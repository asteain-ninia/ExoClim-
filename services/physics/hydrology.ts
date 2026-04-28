
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, WindBeltsResult, OceanStreamline } from '../../types';

const DEG = Math.PI / 180;

// Magnus 式 (Bolton 1980): 飽和水蒸気圧 [hPa]
const eSat = (T_kelvin: number): number => {
    const Tc = T_kelvin - 273.15;
    if (Tc < -100) return 0;
    return 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5));
};

/**
 * 海流ストリームラインを月別の暖流/寒流フラグマップに投影する。
 * - main = ECC = 暖流
 * - split_n / split_s = EC = 寒流
 * 1セル膨張も入れて「沿岸暖流域」を広めに取る。
 */
const buildCurrentMaps = (
    oceanStreamlines: OceanStreamline[][],
    rows: number,
    cols: number
): { warm: Uint8Array; cold: Uint8Array } => {
    const N = rows * cols;
    const monthCount = 12;
    const warm = new Uint8Array(N * monthCount);
    const cold = new Uint8Array(N * monthCount);

    for (let m = 0; m < monthCount; m++) {
        // oceanStreamlines は [0=Jan, 6=Jul] の2要素しかない場合がある
        const sourceIdx = oceanStreamlines[m] ? m : (m < 6 ? 0 : 6);
        const lines = oceanStreamlines[sourceIdx] || [];

        for (const line of lines) {
            const isWarm = line.type === 'main';
            const target = isWarm ? warm : cold;
            for (const pt of line.points) {
                const r = Math.floor(pt.y);
                const c = Math.floor(pt.x);
                // 3x3 で塗る (沿岸暖流域)
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = ((c + dc) % cols + cols) % cols;
                        if (nr >= 0 && nr < rows) {
                            target[m * N + nr * cols + nc] = 1;
                        }
                    }
                }
            }
        }
    }
    return { warm, cold };
};

/**
 * Step 6: 水文モデル (Pasta 流 advection ベース)
 *
 * 参考: Worldbuilding Pasta "An Apple Pie from Scratch, Part VIb" Step 6a/6b/6d
 *
 * アルゴリズム:
 *  1. 海洋セルで飽和水蒸気量を蒸発 (暖流上は ×1.5、寒流上は ×0.6)
 *  2. 風方向に沿って湿気を陸上へ Eulerian advection
 *     - 各反復で 1 セル分上流の moisture を bilinear 補間で取得
 *     - 走行距離 2000km の指数減衰 (Pasta の "2000km 内陸停止" を近似)
 *     - 標高上昇 (orographic uplift) で追加降水
 *     - ITCZ 帯通過時に追加降水
 *     - 標高 4km 超で降水カット (Pasta閾値)
 *  3. ITCZ 直下 (±15°) でダイレクト降水ボーナス
 *
 * 出力:
 *  - cell.moisture[m]: 残存水蒸気量 [hPa 相当]
 *  - cell.precip[m]: 月別降水量 [mm/月]
 *  - cell.uplift[m]: デバッグ用 (上流からの累積降水量)
 */
export const computeHydrology = (
    grid: GridCell[],
    itczLines: number[][],
    windRes: WindBeltsResult | undefined,
    oceanStreamlines: OceanStreamline[][],
    planet: PlanetParams,
    atm: AtmosphereParams,
    config: SimulationConfig
): void => {
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;
    const N = rows * cols;

    // 緯度方向 1 セル = 約111km × (180/rows) 度
    const latStepDeg = 180 / Math.max(1, rows - 1);
    const cellKmLat = latStepDeg * 111.1;

    // 海流マップ
    const { warm: warmMap, cold: coldMap } = buildCurrentMaps(oceanStreamlines, rows, cols);

    // チューニング定数
    const ADVECT_STEPS = 25;          // 反復回数 (≈ 25セル分前進)
    const DISTANCE_SCALE_KM = 2000;   // Pasta の "2000km 内陸停止"
    const OROGRAPHIC_FACTOR = 0.6;    // 標高 1km 上昇あたりの降水率
    const ITCZ_INFLIGHT_BOOST = 0.5;  // 風が ITCZ 帯を通過時の追加倍率
    const ITCZ_INFLIGHT_WIDTH = 5;    // ITCZ 中心からの ±° (狭い帯)
    const PRECIP_BASE_PER_STEP = 0.04;// ベース降水率 (1反復ごと)
    const ITCZ_DIRECT_BAND_DEG = 15;  // ITCZ 直下バンドの広さ
    const ITCZ_DIRECT_PRECIP_MM = 220;// ITCZ 直下のベース降水 [mm/月]
    const ELEV_PRECIP_CUTOFF_M = 4000;// 標高 4km 超で降水カット
    const PRECIP_SCALE = 16.0;        // 内部単位 → mm/月 への換算
    const RH = 0.7;                   // 海洋表面の相対湿度

    for (let m = 0; m < 12; m++) {
        const itcz = itczLines[m];
        const moistureField = new Float32Array(N);

        // ---- Step 1: 海洋セルでの蒸発 ----
        for (let i = 0; i < N; i++) {
            const cell = grid[i];
            if (!cell.isLand) {
                let moisture = eSat(cell.temp[m]) * RH;
                if (warmMap[m * N + i]) moisture *= 1.5;
                else if (coldMap[m * N + i]) moisture *= 0.6;
                moistureField[i] = moisture;
            }
        }

        // ---- Step 2: Eulerian advection ----
        const precipAccum = new Float32Array(N);
        let currentField = moistureField;
        for (let step = 0; step < ADVECT_STEPS; step++) {
            const newField = new Float32Array(currentField);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = r * cols + c;
                    const cell = grid[idx];
                    if (!cell.isLand) continue;

                    const u = cell.windU[m];
                    const v = cell.windV[m];
                    const speed = Math.sqrt(u * u + v * v);
                    if (speed < 0.3) continue;

                    // 風速の単位ベクトル (1セル分の上流を取る)
                    const ux = u / speed;
                    const vy = v / speed;

                    // 上流位置 (fractional)
                    // r+vy: 北向き(v>0)は r=0 方向に進むので、上流は r+ 側
                    // c-ux: 東向き(u>0)は c+ 方向に進むので、上流は c- 側
                    const upR = r + vy;
                    const upC = c - ux;

                    // bilinear 補間 (経度はラップ)
                    const upRc = Math.max(0, Math.min(rows - 1.001, upR));
                    const upCw = ((upC % cols) + cols) % cols;
                    const r0 = Math.floor(upRc);
                    const r1 = Math.min(rows - 1, r0 + 1);
                    const c0 = Math.floor(upCw) % cols;
                    const c1 = (c0 + 1) % cols;
                    const tr = upRc - r0;
                    const tc = upCw - Math.floor(upCw);

                    const m00 = currentField[r0 * cols + c0];
                    const m01 = currentField[r0 * cols + c1];
                    const m10 = currentField[r1 * cols + c0];
                    const m11 = currentField[r1 * cols + c1];
                    const sourceMoist = (1 - tr) * ((1 - tc) * m00 + tc * m01) + tr * ((1 - tc) * m10 + tc * m11);

                    if (sourceMoist <= 0.001) {
                        newField[idx] = 0;
                        continue;
                    }

                    // 走行距離 (km, このセル幅相当)
                    const cosLat = Math.max(0.05, Math.cos(cell.lat * DEG));
                    const stepKm = cellKmLat * Math.sqrt(vy * vy + (ux / cosLat) * (ux / cosLat));
                    const distanceDecay = Math.exp(-stepKm / DISTANCE_SCALE_KM);

                    // 上流セルの代表標高
                    const upElev = grid[r0 * cols + c0].elevation;

                    // orographic: 標高上昇 (1km あたり)
                    const elevRiseKm = Math.max(0, (cell.elevation - upElev) / 1000);
                    const precipOro = sourceMoist * elevRiseKm * OROGRAPHIC_FACTOR;

                    // ITCZ 通過ボーナス (狭い帯)
                    const distITCZ = Math.abs(cell.lat - itcz[c]);
                    let precipITCZBoost = 0;
                    if (distITCZ < ITCZ_INFLIGHT_WIDTH) {
                        precipITCZBoost = sourceMoist * ITCZ_INFLIGHT_BOOST * Math.exp(-Math.pow(distITCZ / ITCZ_INFLIGHT_WIDTH, 2));
                    }

                    // ベース降水
                    const precipBase = sourceMoist * PRECIP_BASE_PER_STEP;

                    let totalDeposit = precipOro + precipITCZBoost + precipBase;

                    // 標高 4km 超は降水カット
                    if (cell.elevation > ELEV_PRECIP_CUTOFF_M) {
                        totalDeposit = 0;
                    }

                    newField[idx] = Math.max(0, sourceMoist * distanceDecay - totalDeposit);
                    precipAccum[idx] += totalDeposit;
                }
            }
            currentField = newField;
        }

        // ---- Step 3: ITCZ 直下の広域帯降水 ----
        for (let r = 0; r < rows; r++) {
            const lat = grid[r * cols].lat;
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const itczLat = itcz[c];
                const distITCZ = Math.abs(lat - itczLat);
                if (distITCZ < ITCZ_DIRECT_BAND_DEG) {
                    const factor = Math.exp(-Math.pow(distITCZ / (ITCZ_DIRECT_BAND_DEG / 2), 2));
                    // 海洋・陸ともに加算 (Pasta は陸主体だが、海洋でも同程度)
                    precipAccum[idx] += ITCZ_DIRECT_PRECIP_MM * factor / PRECIP_SCALE;
                }
            }
        }

        // ---- Step 4: 出力 ----
        for (let i = 0; i < N; i++) {
            const cell = grid[i];
            cell.precip[m] = precipAccum[i] * PRECIP_SCALE;
            cell.moisture[m] = currentField[i];
            cell.uplift[m] = precipAccum[i]; // デバッグ
        }
    }
};

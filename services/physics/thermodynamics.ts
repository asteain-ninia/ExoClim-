
import { GridCell, PlanetParams, AtmosphereParams, PhysicsParams, SimulationConfig } from '../../types';

const SIGMA = 5.670374419e-8; // Stefan-Boltzmann
const DEG = Math.PI / 180;
const T_FREEZE = 271.0; // 海氷閾値 [K] (≈ -2°C)
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Step 0.6 (zonal): 緯度別の放射平衡温度（簡易）
 * 主に既存呼び出し互換のためのスタブ。実体は computeRealTemp。
 */
export const computeZonalClimate = (): void => {};

/**
 * Step 5: 月別表面温度（最小気候モデル）
 *
 * 概要:
 *  1. 放射平衡 (アルベド + 温室効果)
 *  2. 海氷フィードバック (温度に応じてアルベドを上げ、再収束を1回)
 *  3. 子午面熱輸送 (緯度方向 Laplacian 平滑化)
 *  4. 海洋熱慣性 (月方向の指数移動平均)
 *  5. 標高補正 (lapse rate)
 *
 * 出力:
 *  - cell.temp[0..11] [K], cell.tempZonal[0..11] [K]
 *  - SimulationResult.globalTemp / maxTemp / minTemp
 */
export const computeRealTemp = (
    grid: GridCell[],
    planet: PlanetParams,
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig
): { globalTemp: number; maxTemp: number; minTemp: number } => {
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;
    const N = grid.length;

    // 温室効果による effective emissivity:
    //   σT^4 = (1-α)S / ε_eff
    //   ε_eff = 1 / (1 + 0.6 × gf)
    //   gf=1 (地球) で約 33K の温室効果に相当
    const epsEff = 1.0 / (1.0 + 0.6 * Math.max(0, atm.greenhouseFactor));
    const lapseK_per_m = Math.max(0, atm.lapseRate) / 1000;

    // 月別 + セル別の表面温度（標高補正前）と現アルベド
    const surfTemp = new Float32Array(N * 12);

    // ---- Pass 1: 氷なしの放射平衡 (初期推定) ----
    for (let i = 0; i < N; i++) {
        const cell = grid[i];
        const baseAlb = cell.isLand ? atm.albedoLand : atm.albedoOcean;
        for (let m = 0; m < 12; m++) {
            const F = Math.max(0, (1 - baseAlb) * cell.insolation[m]);
            surfTemp[i * 12 + m] = Math.pow(Math.max(1e-3, F) / (epsEff * SIGMA), 0.25);
        }
    }

    // ---- Pass 2: 海氷アルベドフィードバック (1巡で収束) ----
    for (let i = 0; i < N; i++) {
        const cell = grid[i];
        const baseAlb = cell.isLand ? atm.albedoLand : atm.albedoOcean;
        for (let m = 0; m < 12; m++) {
            const T = surfTemp[i * 12 + m];
            // T_FREEZE ± 5K で 0→1 にランプ
            const iceFrac = clamp((T_FREEZE + 5 - T) / 10.0, 0, 1);
            const alb = baseAlb * (1 - iceFrac) + atm.albedoIce * iceFrac;
            const F = Math.max(0, (1 - alb) * cell.insolation[m]);
            surfTemp[i * 12 + m] = Math.pow(Math.max(1e-3, F) / (epsEff * SIGMA), 0.25);
        }
    }

    // ---- Pass 3: 子午面熱輸送 (緯度方向 Laplacian 平滑化) ----
    // meridionalTransport [Watt/K per cell] が大きいほど平滑化を強める
    const transport = Math.max(0, atm.meridionalTransport);
    const smoothPasses = Math.min(40, Math.round(transport / 3));
    if (smoothPasses > 0) {
        const zonalT = new Float32Array(rows);
        const newZonal = new Float32Array(rows);
        for (let m = 0; m < 12; m++) {
            for (let pass = 0; pass < smoothPasses; pass++) {
                // 帯平均を計算
                for (let r = 0; r < rows; r++) {
                    let sum = 0;
                    for (let c = 0; c < cols; c++) sum += surfTemp[(r * cols + c) * 12 + m];
                    zonalT[r] = sum / cols;
                }
                // ラプラシアン拡散 (端は固定)
                newZonal[0] = zonalT[0];
                newZonal[rows - 1] = zonalT[rows - 1];
                for (let r = 1; r < rows - 1; r++) {
                    newZonal[r] = zonalT[r] + 0.25 * (zonalT[r - 1] - 2 * zonalT[r] + zonalT[r + 1]);
                }
                // 差分を全セルに反映 (経度方向の特徴は保ったまま帯のみ平滑化)
                for (let r = 0; r < rows; r++) {
                    const delta = newZonal[r] - zonalT[r];
                    if (delta === 0) continue;
                    for (let c = 0; c < cols; c++) {
                        surfTemp[(r * cols + c) * 12 + m] += delta;
                    }
                }
            }
        }
    }

    // ---- Pass 4: 海洋熱慣性 (月方向の指数移動平均) ----
    // 海洋セルは月をまたぐ温度変化が抑制される (時間遅れ)
    const C_LAND = 1.0;
    const C_OCEAN = Math.max(0.1, atm.heatCapacityOcean) * 6.0;
    const inst = new Array<number>(12);
    for (let i = 0; i < N; i++) {
        const C = grid[i].isLand ? C_LAND : C_OCEAN;
        if (C <= 1.0) continue;
        const alpha = 1.0 / C;
        for (let m = 0; m < 12; m++) inst[m] = surfTemp[i * 12 + m];
        let prev = inst[11]; // 仮想初期 (12月)
        // 2巡: 初期条件を抜く
        for (let pass = 0; pass < 2; pass++) {
            for (let m = 0; m < 12; m++) {
                prev = (1 - alpha) * prev + alpha * inst[m];
                surfTemp[i * 12 + m] = prev;
            }
            prev = surfTemp[i * 12 + 11];
        }
    }

    // ---- Pass 5: 標高補正 + 出力 ----
    let globalSum = 0;
    let totalWeight = 0;
    let maxT = -Infinity;
    let minT = Infinity;

    for (let r = 0; r < rows; r++) {
        const lat = grid[r * cols].lat;
        const w = Math.cos(lat * DEG); // 面積重み
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const cell = grid[idx];
            const elevAbove = cell.isLand ? Math.max(0, cell.elevation) : 0;
            let monthSum = 0;
            for (let m = 0; m < 12; m++) {
                const T = surfTemp[idx * 12 + m] - elevAbove * lapseK_per_m;
                cell.temp[m] = T;
                cell.tempZonal[m] = T;
                monthSum += T;
                if (T > maxT) maxT = T;
                if (T < minT) minT = T;
            }
            globalSum += (monthSum / 12) * w;
            totalWeight += w;
        }
    }

    return {
        globalTemp: globalSum / Math.max(1e-9, totalWeight),
        maxTemp: maxT,
        minTemp: minT
    };
};

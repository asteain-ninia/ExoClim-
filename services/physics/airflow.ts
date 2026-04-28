
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams, WindBeltsResult } from '../../types';

const DEG = Math.PI / 180;
const RHO_AIR = 1.2;       // kg/m³
const PA_PER_HPA = 100;    // Pa/hPa
const KM_PER_DEG_LAT = 111.1;

/**
 * Step 4: 気流詳細 (圧力 anomaly + 地衡風)
 *
 * 参考: Worldbuilding Pasta Part VIb Step 5 (Wind field)
 *
 * Pasta は風帯ベース風 (Step 2) に加えて、以下の圧力 anomaly を手動配置する:
 *   - 海洋ジャイア中心 (~30°N/S 近傍の海洋上): 高気圧
 *   - 陸上冬季高気圧 (内陸冷域: 当該緯度海洋比で 5-10°C 低い)
 *   - 陸上夏季低気圧 (内陸暖域)
 * これらから周囲に螺旋風 (北半球高気圧は時計回り) が吹く。
 *
 * 本実装ではこれを自動化する:
 *   1. 各月で経度方向の温度偏差から陸上 anomaly を導出
 *   2. 亜熱帯ジャイア中心は静的に高気圧を加算
 *   3. 平滑化 (2回 box blur)
 *   4. 圧力勾配 → 地衡風を計算し windU/V に加算
 *      (赤道帯 |lat|<10° では geostrophic balance が破綻するので
 *       単純な圧力勾配風に切替)
 *
 * 副次効果として:
 *   - 海陸の温度差で「海風」 (海→陸方向の風) が出るので
 *     hydrology の advection が陸内側へ伸びる
 *   - 季節で陸上 anomaly が逆転 → 季節風 (モンスーン) を表現
 */
export const computeAirflowDetailed = (
    grid: GridCell[],
    circulationRes: { itczLines: number[][]; cellCount: number; hadleyWidth: number },
    windRes: WindBeltsResult,
    oceanRes: any,
    planet: PlanetParams,
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig
): void => {
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;
    const N = rows * cols;
    const rotationSign = planet.isRetrograde ? -1 : 1;

    // 自転角速度 [rad/s]
    const omega = (2 * Math.PI) / Math.max(60, planet.rotationPeriod * 3600);
    const hadleyEdge = windRes.hadleyEdgeDeg;
    const dyMeters = (180 / Math.max(1, rows - 1)) * KM_PER_DEG_LAT * 1000;

    // 経度方向セル幅 (緯度別) [m]
    const dxMetersByRow = new Float32Array(rows);
    for (let r = 0; r < rows; r++) {
        const lat = grid[r * cols].lat;
        dxMetersByRow[r] = (360 / cols) * KM_PER_DEG_LAT * 1000 * Math.max(0.05, Math.cos(lat * DEG));
    }

    // チューニング定数
    const ANOM_K_PER_HPA = 0.6;     // 陸上温度偏差の hPa 換算係数
    const ANOM_CAP_HPA = 14;        // 陸上 anomaly の上下限
    const SUBTROPICAL_HIGH = 8;     // 亜熱帯ジャイア中心の高気圧
    const SUBTROPICAL_BAND = 5;     // 亜熱帯帯の幅 [°]
    const SMOOTH_PASSES = 2;        // 平滑化反復
    const WIND_WEIGHT = 0.45;       // 既存風への重み (合算時)
    const WIND_CAP = 9;             // 加算 wind の上限 [m/s]
    const TROPICAL_FRICTION = 1e-4; // 赤道帯の擬似摩擦係数 [s⁻¹]

    for (let m = 0; m < 12; m++) {
        const pAnomaly = new Float32Array(N);

        // ---- 帯平均温度 ----
        const zonalT = new Float32Array(rows);
        for (let r = 0; r < rows; r++) {
            let sum = 0;
            for (let c = 0; c < cols; c++) sum += grid[r * cols + c].temp[m];
            zonalT[r] = sum / cols;
        }

        // ---- 圧力 anomaly 配置 ----
        for (let r = 0; r < rows; r++) {
            const lat = grid[r * cols].lat;
            const latAbs = Math.abs(lat);
            const isSubtropical = Math.abs(latAbs - hadleyEdge) < SUBTROPICAL_BAND;

            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const cell = grid[idx];
                let anom = 0;

                if (cell.isLand) {
                    // 陸: 帯平均より冷たいほど高気圧、暖かいほど低気圧
                    const dT = cell.temp[m] - zonalT[r];
                    anom = -dT * ANOM_K_PER_HPA;
                    if (anom > ANOM_CAP_HPA) anom = ANOM_CAP_HPA;
                    else if (anom < -ANOM_CAP_HPA) anom = -ANOM_CAP_HPA;
                } else if (isSubtropical) {
                    // 亜熱帯ジャイア中心 (海洋)
                    anom = SUBTROPICAL_HIGH;
                }

                pAnomaly[idx] = anom;
            }
        }

        // ---- 平滑化 (3x3 weighted blur) ----
        let cur = pAnomaly;
        const tmp = new Float32Array(N);
        for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = r * cols + c;
                    const cE = (c + 1) % cols;
                    const cW = (c - 1 + cols) % cols;
                    const rN = Math.max(0, r - 1);
                    const rS = Math.min(rows - 1, r + 1);
                    tmp[idx] = (
                        cur[idx] * 4 +
                        cur[r * cols + cE] +
                        cur[r * cols + cW] +
                        cur[rN * cols + c] +
                        cur[rS * cols + c]
                    ) / 8;
                }
            }
            // swap
            const swap = cur;
            cur = tmp;
            // tmp の役目を反転
            for (let i = 0; i < N; i++) swap[i] = cur[i];
            cur = swap;
        }

        // ---- 地衡風 → windU/V に加算 + pressure 更新 ----
        for (let r = 0; r < rows; r++) {
            const lat = grid[r * cols].lat;
            const f = 2 * omega * Math.sin(lat * DEG); // Coriolis
            const dxMeters = dxMetersByRow[r];
            const useGeostrophic = Math.abs(lat) > 10 && Math.abs(f) > 1e-7;

            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const cE = (c + 1) % cols;
                const cW = (c - 1 + cols) % cols;
                const rN = Math.max(0, r - 1);
                const rS = Math.min(rows - 1, r + 1);

                // ∂p/∂x [Pa/m] (east positive)
                const dpdx = (cur[r * cols + cE] - cur[r * cols + cW]) * PA_PER_HPA / (2 * dxMeters);
                // ∂p/∂y [Pa/m] (north positive: r 減少が北)
                const dpdy = (cur[rN * cols + c] - cur[rS * cols + c]) * PA_PER_HPA / (2 * dyMeters);

                let uAdd: number;
                let vAdd: number;
                if (useGeostrophic) {
                    // V_g = +(1/ρf) ∂p/∂x;  U_g = -(1/ρf) ∂p/∂y
                    uAdd = -dpdy / (RHO_AIR * f);
                    vAdd = dpdx / (RHO_AIR * f);
                } else {
                    // 赤道帯: 圧力勾配方向に高→低 (gradient-flow approximation)
                    uAdd = -dpdx / (RHO_AIR * TROPICAL_FRICTION);
                    vAdd = -dpdy / (RHO_AIR * TROPICAL_FRICTION);
                }

                // 風速キャップ
                const speed = Math.sqrt(uAdd * uAdd + vAdd * vAdd);
                if (speed > WIND_CAP) {
                    uAdd *= WIND_CAP / speed;
                    vAdd *= WIND_CAP / speed;
                }

                const cell = grid[idx];
                cell.windU[m] += uAdd * rotationSign * WIND_WEIGHT;
                cell.windV[m] += vAdd * rotationSign * WIND_WEIGHT;
                cell.pressure[m] += cur[idx];
            }
        }
    }
};

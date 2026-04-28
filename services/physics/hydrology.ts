
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, WindBeltsResult } from '../../types';

const DEG = Math.PI / 180;

// Magnus 式 (Bolton 1980): 飽和水蒸気圧 [hPa]
const eSat = (T_kelvin: number): number => {
    const Tc = T_kelvin - 273.15;
    if (Tc < -100) return 0;
    return 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5));
};

/**
 * Step 6: 水文モデル (最小実装)
 *
 * 構成:
 *  - 水蒸気供給: 飽和水蒸気量 e_sat(T) × 海洋アクセス係数
 *  - 上昇トリガー (降水確率):
 *      a. ITCZ収束 (Gaussian, 月別 ITCZ 緯度を中心)
 *      b. 中緯度前線 (Ferrel/Polar 境界)
 *      c. 亜熱帯高圧帯による下降乾燥 (負のトリガー)
 *      d. オログラフィック降水 (風 ⋅ 標高勾配)
 *
 * 出力:
 *  - cell.moisture[m]: 大気水蒸気プロキシ [hPa 相当]
 *  - cell.precip[m]: 月別降水量 [mm/月]
 *  - cell.uplift[m]: 上昇トリガー値 (デバッグ用)
 */
export const computeHydrology = (
    grid: GridCell[],
    itczLines: number[][],
    windRes: WindBeltsResult | undefined,
    planet: PlanetParams,
    atm: AtmosphereParams,
    config: SimulationConfig
): void => {
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;

    const hadleyEdge = windRes?.hadleyEdgeDeg ?? 30;
    const cellBoundaries = windRes?.cellBoundariesDeg ?? [hadleyEdge, 60, 90];

    // 海洋アクセス減衰スケール [km]
    const COAST_SCALE_KM = 2000.0;
    // 降水量スケーリング (地球の年降水 ~1000mm に合わせる係数)
    const PRECIP_SCALE = 5.0;
    // 相対湿度プロキシ (簡易: 70%)
    const RH = 0.7;

    for (let m = 0; m < 12; m++) {
        const itcz = itczLines[m];

        for (let r = 0; r < rows; r++) {
            const lat = grid[r * cols].lat;
            const latAbs = Math.abs(lat);

            // ITCZ 帯幅 (Hadley Edge の一定割合)
            const itczWidth = Math.max(3.0, hadleyEdge * 0.18);
            // 亜熱帯高圧帯の中心: hadleyEdge 付近
            const stCenter = hadleyEdge;
            const stWidth = Math.max(3.0, hadleyEdge * 0.18);
            // 中緯度前線: Hadley/Ferrel 境界と Ferrel/Polar 境界の中間
            let ferrelMid = 50;
            let ferrelWidth = 10;
            if (cellBoundaries.length >= 2) {
                ferrelMid = (cellBoundaries[0] + cellBoundaries[1]) / 2;
                ferrelWidth = Math.max(5, (cellBoundaries[1] - cellBoundaries[0]) / 2);
            }

            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const cell = grid[idx];
                const T = cell.temp[m];
                const itczLat = itcz[c];
                const distITCZ = Math.abs(lat - itczLat);

                // 1) 水蒸気供給
                const eS = eSat(T);
                const supply = cell.isLand
                    ? Math.exp(-Math.max(0, cell.distCoast) / COAST_SCALE_KM)
                    : 1.0;
                const moisture = eS * RH * supply;
                cell.moisture[m] = moisture;

                // 2) 上昇トリガー
                let trigger = 0.05; // ベース (一様な弱降水)

                // 2a) ITCZ 収束
                trigger += 0.7 * Math.exp(-Math.pow(distITCZ / itczWidth, 2));

                // 2b) 中緯度前線
                const ferrelDist = Math.abs(latAbs - ferrelMid);
                trigger += 0.25 * Math.exp(-Math.pow(ferrelDist / ferrelWidth, 2));

                // 2c) 亜熱帯高圧帯 (下降気流で乾燥)
                const stDist = Math.abs(latAbs - stCenter);
                trigger -= 0.4 * Math.exp(-Math.pow(stDist / stWidth, 2));

                // 2d) オログラフィック (風 ⋅ 標高勾配)
                if (cell.isLand) {
                    const cE = (c + 1) % cols;
                    const cW = (c - 1 + cols) % cols;
                    const rN = Math.max(0, r - 1);
                    const rS = Math.min(rows - 1, r + 1);
                    const dElevX = (grid[r * cols + cE].elevation - grid[r * cols + cW].elevation) / 2;
                    const dElevY = (grid[rN * cols + c].elevation - grid[rS * cols + c].elevation) / 2;
                    const wU = cell.windU[m];
                    const wV = cell.windV[m];
                    const orographic = wU * dElevX + wV * dElevY;
                    if (orographic > 0) {
                        trigger += 0.4 * Math.min(1.5, orographic / 8000);
                    }
                }

                trigger = Math.max(0, trigger);
                cell.uplift[m] = trigger;

                // 3) 降水量
                cell.precip[m] = moisture * trigger * PRECIP_SCALE;
            }
        }
    }
};

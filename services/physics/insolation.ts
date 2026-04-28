
import { GridCell, PlanetParams, SimulationConfig } from '../../types';

const SOLAR_CONSTANT = 1361.0; // W/m^2 at 1 AU, solar luminosity 1.0
const DEG = Math.PI / 180;

/**
 * Step 0.5: Top-of-Atmosphere Insolation (Daily Mean per Month)
 *
 * 月別・緯度別の大気上端日射量 [W/m²] を軌道幾何から求める。
 *
 * 入力 (PlanetParams):
 *  - obliquity: 地軸傾斜 [deg]
 *  - eccentricity: 軌道離心率
 *  - semiMajorAxis: 軌道長半径 [AU]
 *  - solarLuminosity: 主星光度 [太陽=1]
 *  - perihelionAngle: 春分基準の近日点引数 [deg]
 *
 * 出力:
 *  - cell.insolation[0..11]: 各月中央時点の日平均日射量 [W/m²]
 */
export const calculateInsolation = (
    grid: GridCell[],
    planet: PlanetParams,
    config: SimulationConfig
): void => {
    // 主星から惑星の半長径距離における平均日射 (e=0近似)
    const meanS = SOLAR_CONSTANT * planet.solarLuminosity / Math.max(0.01, planet.semiMajorAxis * planet.semiMajorAxis);
    const e = Math.max(0, Math.min(0.95, planet.eccentricity));
    const obliquityRad = planet.obliquity * DEG;
    const perihelionRad = planet.perihelionAngle * DEG;

    // 各月の太陽位置を事前計算
    const distFactor = new Array<number>(12); // (a/r)^2
    const declination = new Array<number>(12); // δ [rad]
    for (let m = 0; m < 12; m++) {
        // 月中央点を年比 [0,1) に変換
        const yearFrac = (m + 0.5) / 12;
        // 春分基準の太陽黄経 λ = 2π × yearFrac (北半球の春分が m=2.5 付近)
        // m=0 (Jan) -> λ ≈ 0.26π, m=2 (Mar) -> λ ≈ 0.5π...
        // 北半球春分を m=2.5 にしたいのでオフセット
        const lambda = 2 * Math.PI * (yearFrac - 0.25);
        // Mean anomaly (近日点を基準)
        const M = lambda - perihelionRad;
        // True anomaly: 1次離心率近似 (equation of center)
        const nu = M + 2 * e * Math.sin(M) + 1.25 * e * e * Math.sin(2 * M);
        // 距離比 r/a
        const rOverA = (1 - e * e) / (1 + e * Math.cos(nu));
        distFactor[m] = 1 / (rOverA * rOverA);
        // 太陽赤緯
        declination[m] = Math.asin(Math.sin(obliquityRad) * Math.sin(lambda));
    }

    // 各セルで日平均日射を計算
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;
    for (let r = 0; r < rows; r++) {
        const lat = grid[r * cols].lat * DEG;
        const sinPhi = Math.sin(lat);
        const cosPhi = Math.cos(lat);

        for (let m = 0; m < 12; m++) {
            const delta = declination[m];
            const sinDelta = Math.sin(delta);
            const cosDelta = Math.cos(delta);
            // 日没時角 h0: cos h0 = -tan φ tan δ
            const cosH0 = -sinPhi * sinDelta / Math.max(1e-9, cosPhi * cosDelta);
            let h0: number;
            if (cosH0 >= 1) {
                h0 = 0; // 極夜
            } else if (cosH0 <= -1) {
                h0 = Math.PI; // 極日
            } else {
                h0 = Math.acos(cosH0);
            }
            // 日平均TOA日射
            const dailyMean = (meanS / Math.PI) * distFactor[m] *
                (h0 * sinPhi * sinDelta + cosPhi * cosDelta * Math.sin(h0));
            const value = Math.max(0, dailyMean);

            for (let c = 0; c < cols; c++) {
                grid[r * cols + c].insolation[m] = value;
            }
        }
    }
};

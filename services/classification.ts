
import { GridCell, SimulationConfig } from '../types';

/**
 * Step 7: Köppen-Geiger 気候分類 (Pasta 準拠)
 *
 * 参考: hersfeldtn/koppenpasta `Koppen_Alg` (default options)
 *  - cold = 0   (kg_temperate_min)
 *  - kg_arid_avg = False  (B 群の hot/cold は Min_Temp で)
 *  - kg_med_as = False    (As は Summer_Precip < Total/2 で簡易判定)
 *  - kg_trewartha_seasons = False
 *  - kg_wet_summer_total = False
 *
 * 入力: cell.temp[12] (K), cell.precip[12] (mm/月)
 * 出力: cell.climateClass = 'Af' / 'BWh' / 'Cfb' / 'Dfc' / 'ET' / 'EF' / 'Oc' など
 */
export const computeKoppen = (
    grid: GridCell[],
    config: SimulationConfig
): void => {
    for (const cell of grid) {
        if (!cell.isLand) {
            cell.climateClass = 'Oc';
            continue;
        }
        cell.climateClass = classifyCell(cell);
    }
};

const COLD_C_D_THRESHOLD = 0;     // kg_temperate_min
const MED_SUMMER_PRECIP = 30;     // kg_med_summer_precip [mm/月]

const classifyCell = (cell: GridCell): string => {
    const tempsC = cell.temp.map(t => t - 273.15);
    const precip = cell.precip;
    const isNorth = cell.lat >= 0;

    // 基本パラメータ
    const tAvg = tempsC.reduce((a, b) => a + b, 0) / 12;
    const tMax = Math.max(...tempsC);
    const tMin = Math.min(...tempsC);
    const pTotal = precip.reduce((a, b) => a + b, 0); // mm/年
    const pMin = Math.min(...precip);                 // mm/月

    // 夏半年 / 冬半年 (北半球: Apr–Sep が夏)
    // 注: Pasta は「最暖期半年スライド」で動的判定するが、
    // 通常惑星では半球固定で近似可能。本実装も半球固定。
    const summerMonths = isNorth ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
    const winterMonths = isNorth ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
    const sumP = (months: number[]) => months.reduce((s, m) => s + precip[m], 0);
    const minP = (months: number[]) => months.reduce((a, m) => Math.min(a, precip[m]), Infinity);
    const maxP = (months: number[]) => months.reduce((a, m) => Math.max(a, precip[m]), -Infinity);

    const pSummer = sumP(summerMonths); // mm/半年
    const pWinter = sumP(winterMonths);
    const pMinSummer = minP(summerMonths);
    const pMinWinter = minP(winterMonths);
    const pMaxSummer = maxP(summerMonths);
    const pMaxWinter = maxP(winterMonths);

    // Summer Length: 月平均気温 > 10°C の月数の割合
    const summerLengthFrac = tempsC.filter(t => t > 10).length / 12;

    // ----- Aridity threshold (Pasta 既定) -----
    // Summer_Precip > 0.7 * Total → adjust = 280
    // Summer_Precip > 0.3 * Total → adjust = 140
    // else → adjust = 0
    let adjust: number;
    if (pTotal > 0 && pSummer > 0.7 * pTotal) {
        adjust = 280;
    } else if (pTotal > 0 && pSummer > 0.3 * pTotal) {
        adjust = 140;
    } else {
        adjust = 0;
    }
    const aridThreshold = tAvg * 20 + adjust;

    // ----- 主分類 (Groups) -----
    let group: 'A' | 'B' | 'C' | 'D' | 'E';
    if (pTotal < aridThreshold && tMax > 10) {
        group = 'B';
    } else if (tMax < 10) {
        group = 'E';
    } else if (tMin > 18) {
        group = 'A';
    } else if (tMin > COLD_C_D_THRESHOLD) {
        group = 'C';
    } else {
        group = 'D';
    }

    // ----- Full Köppen sub-classification -----
    if (group === 'B') {
        // 砂漠 / ステップ判定
        const isDesert = pTotal < aridThreshold / 2;
        // hot/cold (Pasta 既定: Min_Temp > 0 → h, else k)
        const isHot = tMin > COLD_C_D_THRESHOLD;
        if (isDesert) return isHot ? 'BWh' : 'BWk';
        return isHot ? 'BSh' : 'BSk';
    }

    if (group === 'E') {
        return tMax < 0 ? 'EF' : 'ET';
    }

    if (group === 'A') {
        if (pMin >= 60) return 'Af';
        if (pMin >= 100 - pTotal / 25) return 'Am';
        // As/Aw (Pasta 既定: kg_med_as=False)
        return pSummer < pTotal / 2 ? 'As' : 'Aw';
    }

    // C / D
    // s (med): Min_Sum_Precip < 30 AND Max_Sum_Precip > 3 * Min_Sum_Precip AND Summer_Precip < Total/2
    const isMed =
        pMinSummer < MED_SUMMER_PRECIP &&
        pMaxSummer > 3 * pMinSummer &&
        pSummer < pTotal / 2;
    // w (wet-summer): Max_Sum_Precip > 10 * Min_Win_Precip AND Summer_Precip > Total/2
    const isWetSummer =
        pMaxSummer > 10 * pMinWinter &&
        pSummer > pTotal / 2;

    let second: 's' | 'w' | 'f';
    if (isMed) second = 's';
    else if (isWetSummer) second = 'w';
    else second = 'f';

    // 第3文字 (a/b/c/d)
    let third: 'a' | 'b' | 'c' | 'd';
    if (summerLengthFrac < 1 / 3) {
        // 短い夏: c または d
        third = tMin > -38 ? 'c' : 'd';
    } else {
        // 長い夏: a または b
        third = tMax > 22 ? 'a' : 'b';
    }
    // 'd' は D 群のみ (C は cba 限定)
    if (group === 'C' && third === 'd') third = 'c';

    return group + second + third;
};

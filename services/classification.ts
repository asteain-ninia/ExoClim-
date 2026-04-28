
import { GridCell, SimulationConfig } from '../types';

/**
 * Step 7: Köppen-Geiger 気候分類
 *
 * 月別気温 (cell.temp [K]) と月別降水 (cell.precip [mm]) から
 * 各陸地セルに気候記号を割り当てる。海洋セルは 'Oc'。
 *
 * 参考: Beck et al. 2018 Present and future Köppen-Geiger climate
 * classification の判定ロジックに準拠した最小実装。
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

const classifyCell = (cell: GridCell): string => {
    const tempsC = cell.temp.map(t => t - 273.15);
    const precip = cell.precip;
    const isNorth = cell.lat >= 0;

    const tAvg = tempsC.reduce((a, b) => a + b, 0) / 12;
    const tMax = Math.max(...tempsC);
    const tMin = Math.min(...tempsC);
    const pTotal = precip.reduce((a, b) => a + b, 0);
    const pMin = Math.min(...precip);

    // 夏半年 / 冬半年 (北半球: Apr–Sep が夏)
    const summerMonths = isNorth ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
    const winterMonths = isNorth ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
    const sumP = (months: number[]) => months.reduce((s, m) => s + precip[m], 0);
    const minP = (months: number[]) => months.reduce((a, m) => Math.min(a, precip[m]), Infinity);
    const maxP = (months: number[]) => months.reduce((a, m) => Math.max(a, precip[m]), -Infinity);

    const pSummer = sumP(summerMonths);
    const pWinter = sumP(winterMonths);
    const pMinSummer = minP(summerMonths);
    const pMinWinter = minP(winterMonths);
    const pMaxSummer = maxP(summerMonths);
    const pMaxWinter = maxP(winterMonths);

    // --- E: Polar ---
    if (tMax < 10) {
        return tMax < 0 ? 'EF' : 'ET';
    }

    // --- B: Arid (aridity threshold) ---
    let pThreshold: number;
    if (pTotal > 0 && pSummer >= 0.7 * pTotal) {
        pThreshold = 20 * tAvg + 280;
    } else if (pTotal > 0 && pWinter >= 0.7 * pTotal) {
        pThreshold = 20 * tAvg;
    } else {
        pThreshold = 20 * tAvg + 140;
    }
    if (pTotal < pThreshold) {
        const wos = pTotal < pThreshold / 2 ? 'W' : 'S';
        const hok = tAvg >= 18 ? 'h' : 'k';
        return `B${wos}${hok}`;
    }

    // --- A: Tropical ---
    if (tMin >= 18) {
        if (pMin >= 60) return 'Af';
        if (pMin >= 100 - pTotal / 25) return 'Am';
        return pMinWinter < pMinSummer ? 'Aw' : 'As';
    }

    // --- C / D: 第1文字 ---
    const isC = tMin >= -3 && tMin < 18;
    const major = isC ? 'C' : 'D';

    // --- 第2文字: 季節降水分布 ---
    let second: string;
    const isSDry = pMinSummer < 30 && pMinSummer < pMaxWinter / 3;
    const isWDry = pMinWinter < pMaxSummer / 10;
    if (isSDry) second = 's';
    else if (isWDry) second = 'w';
    else second = 'f';

    // --- 第3文字: 暖月の強度 ---
    let third: string;
    if (tMax >= 22) {
        third = 'a';
    } else {
        const monthsAbove10 = tempsC.filter(t => t >= 10).length;
        third = monthsAbove10 >= 4 ? 'b' : 'c';
    }
    // D の最寒月 < -38°C は 'd'
    if (!isC && tMin < -38) third = 'd';

    return major + second + third;
};

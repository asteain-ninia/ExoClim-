/**
 * idealized_continent_2.jpg + cluster_stats.json + mapping.json から
 * 機械可読な「お手本 Köppen マップ」を生成する第2段階スクリプト。
 *
 * 処理:
 *   1. 元JPGの各ピクセルを cluster_stats.json のセントロイドで最寄り割り当て
 *      (extract_reference の乱数依存を回避し、同じセントロイドで決定論的に再現)
 *   2. mapping.json で各クラスタを Köppen記号 / 'noise' に変換
 *   3. noiseピクセルを近隣多数決で塞ぐ (反復モルフォロジー的fill)
 *   4. 結果を3系統で出力:
 *      - debug/expected_full.png        : 原解像度 (KOPPEN_COLORS 配色, 確認用)
 *      - tests/fixtures/idealized_continent_2_expected.png : リサンプル後 (比較用)
 *      - tests/fixtures/idealized_continent_2.json         : セルごとの記号配列 (人手編集可能)
 *
 * 使い方:
 *   npm run build:reference
 *   npm run build:reference -- --grid-lat 180 --grid-lon 360
 */

import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import * as jpeg from 'jpeg-js';
import { KOPPEN_COLORS } from '../constants';

// お手本JPGは Köppen 2文字短縮形 (Df, Dw, Cs, Cw, BW, BS) で描かれている。
// KOPPEN_COLORS は 3文字版しか持たないので、代表色を補う。
const REF_KOPPEN_COLORS: Record<string, string> = {
    ...KOPPEN_COLORS,
    'Df': KOPPEN_COLORS['Dfb'],  // #55CCCC
    'Dw': KOPPEN_COLORS['Dwc'],  // #6600AA
    'Cs': KOPPEN_COLORS['Csa'],  // #FFFF00
    'Cw': KOPPEN_COLORS['Cwa'],  // #AAFF00
    'BW': KOPPEN_COLORS['BWh'],  // #FF0000
    'BS': KOPPEN_COLORS['BSh']   // #FFAA00
};

interface CliOpts {
    inputJpg: string;
    statsJson: string;
    mappingJson: string;
    outFullPng: string;
    outResampledPng: string;
    outJson: string;
    gridLat: number;
    gridLon: number;
    fillIters: number;
}

const parseArgs = (argv: string[]): CliOpts => {
    const opts: CliOpts = {
        inputJpg: 'tests/fixtures/idealized_continent_2.jpg',
        statsJson: 'debug/cluster_stats.json',
        mappingJson: 'tests/fixtures/idealized_continent_2.mapping.json',
        outFullPng: 'debug/expected_full.png',
        outResampledPng: 'tests/fixtures/idealized_continent_2_expected.png',
        outJson: 'tests/fixtures/idealized_continent_2.json',
        gridLat: 180,
        gridLon: 360,
        fillIters: 30
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = argv[i + 1];
        if (a === '--in' && next) { opts.inputJpg = next; i++; }
        else if (a === '--stats' && next) { opts.statsJson = next; i++; }
        else if (a === '--mapping' && next) { opts.mappingJson = next; i++; }
        else if (a === '--grid-lat' && next) { opts.gridLat = parseInt(next, 10); i++; }
        else if (a === '--grid-lon' && next) { opts.gridLon = parseInt(next, 10); i++; }
        else if (a === '--fill-iters' && next) { opts.fillIters = parseInt(next, 10); i++; }
    }
    return opts;
};

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16)
    ];
};

const NOISE = -1; // labels[i] === NOISE で「未確定」を表す

const main = () => {
    const opts = parseArgs(process.argv.slice(2));

    // --- 入力ロード ---
    console.log(`[build_reference] reading ${opts.inputJpg}`);
    const jpgBuf = fs.readFileSync(opts.inputJpg);
    const decoded: { width: number; height: number; data: Uint8Array } =
        jpeg.decode(jpgBuf, { useTArray: true });
    const w = decoded.width;
    const h = decoded.height;
    const data = decoded.data;

    const stats = JSON.parse(fs.readFileSync(opts.statsJson, 'utf-8'));
    const mapping = JSON.parse(fs.readFileSync(opts.mappingJson, 'utf-8'));

    // クラスタID -> セントロイドRGB
    const centroidById = new Map<number, RGB>();
    for (const c of stats.clusters) {
        centroidById.set(c.id, c.rgb as RGB);
    }
    // クラスタID -> Köppen記号 (or 'noise')
    const klassById = new Map<number, string>();
    for (const [k, v] of Object.entries(mapping.map)) {
        klassById.set(parseInt(k, 10), v as string);
    }

    // --- ピクセル割り当て ---
    const labels = new Int32Array(w * h); // クラスタID
    const klassPx = new Array<string>(w * h); // 'noise' | 'Oc' | 'Af' | ...
    const centroidEntries: [number, RGB][] = Array.from(centroidById.entries());

    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        let bestId = -1;
        let bestD = Infinity;
        for (const [id, c] of centroidEntries) {
            const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
            if (d < bestD) { bestD = d; bestId = id; }
        }
        labels[i] = bestId;
        klassPx[i] = klassById.get(bestId) ?? 'noise';
    }

    // --- 海flood fill: 外周から海クラスタを種にBFS、noiseも経由可で連結 ---
    // 矢印・文字が海上に塗り残ったとき、近隣多数決だと近くのKöppenに塗り潰されて
    // 海がCfb等で侵食される。海と外部noiseはまとめてOcに強制する。
    const SEA_KLASS = 'Oc';
    const sea = new Uint8Array(w * h);
    const queue: number[] = [];
    const seedSea = (i: number) => {
        if (sea[i]) return;
        if (klassPx[i] === SEA_KLASS || klassPx[i] === 'noise') {
            sea[i] = 1;
            queue.push(i);
        }
    };
    for (let x = 0; x < w; x++) { seedSea(x); seedSea((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seedSea(y * w); seedSea(y * w + (w - 1)); }
    while (queue.length) {
        const i = queue.shift()!;
        const x = i % w;
        const y = Math.floor(i / w);
        const neigh = [
            [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
        ];
        for (const [nx, ny] of neigh) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const j = ny * w + nx;
            if (sea[j]) continue;
            if (klassPx[j] === SEA_KLASS || klassPx[j] === 'noise') {
                sea[j] = 1;
                queue.push(j);
            }
        }
    }
    let seaForced = 0;
    for (let i = 0; i < w * h; i++) {
        if (sea[i] && klassPx[i] !== SEA_KLASS) {
            klassPx[i] = SEA_KLASS;
            seaForced++;
        }
    }
    console.log(`[build_reference] sea flood fill: ${seaForced} ocean-side noise pixels forced to ${SEA_KLASS}`);

    // --- ノイズピクセルを近隣多数決で塞ぐ ---
    // 反復: 各noiseピクセルを 3x3 近傍の "確定済み" 多数派で置き換える
    let noiseCount = 0;
    for (let i = 0; i < w * h; i++) if (klassPx[i] === 'noise') noiseCount++;
    console.log(`[build_reference] initial noise pixels (after sea fill): ${noiseCount} / ${w * h} (${((noiseCount / (w * h)) * 100).toFixed(1)}%)`);

    for (let iter = 0; iter < opts.fillIters; iter++) {
        let filled = 0;
        const next = klassPx.slice();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (klassPx[i] !== 'noise') continue;
                const counts = new Map<string, number>();
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                        const k = klassPx[ny * w + nx];
                        if (k === 'noise') continue;
                        counts.set(k, (counts.get(k) ?? 0) + 1);
                    }
                }
                if (counts.size === 0) continue;
                let bestK = '';
                let bestN = 0;
                for (const [k, n] of counts) {
                    if (n > bestN) { bestN = n; bestK = k; }
                }
                next[i] = bestK;
                filled++;
            }
        }
        for (let i = 0; i < w * h; i++) klassPx[i] = next[i];
        console.log(`[build_reference] fill iter ${iter + 1}: filled ${filled} pixels`);
        if (filled === 0) break;
    }
    let remainingNoise = 0;
    for (let i = 0; i < w * h; i++) if (klassPx[i] === 'noise') remainingNoise++;
    console.log(`[build_reference] remaining noise after fill: ${remainingNoise}`);

    // --- 原解像度の確認用PNG ---
    const fullPng = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
        const k = klassPx[i];
        const hex = REF_KOPPEN_COLORS[k] ?? '#FF00FF'; // 残ったnoiseは目立つマゼンタで
        const [r, g, b] = hexToRgb(hex);
        fullPng.data[i * 4]     = r;
        fullPng.data[i * 4 + 1] = g;
        fullPng.data[i * 4 + 2] = b;
        fullPng.data[i * 4 + 3] = 255;
    }
    if (!fs.existsSync(path.dirname(opts.outFullPng))) {
        fs.mkdirSync(path.dirname(opts.outFullPng), { recursive: true });
    }
    fs.writeFileSync(opts.outFullPng, PNG.sync.write(fullPng));
    console.log(`[build_reference] wrote ${opts.outFullPng}`);

    // --- gridLat × gridLon にリサンプル (各セル内 Köppen 記号の最頻) ---
    // 注意: 元JPGは正方形 (600x600) で凧型大陸を中央配置している。
    // これを地球マップ的な lat/lon グリッドへ写すには:
    //   - JPG y=0 -> lat=+90, y=h-1 -> lat=-90 (北上が画像上)
    //   - JPG x=0 -> lon=-180, x=w-1 -> lon=+180
    // とするのが素直。比率1:2の地図ではないが、お手本仕様は緯度方向にだけ
    // 意味があるので、そのまま等緯度マッピングで載せる。
    const klassGrid = new Array<string>(opts.gridLat * opts.gridLon);
    for (let r = 0; r < opts.gridLat; r++) {
        // セル r が JPG 上で覆う y 範囲
        const y0 = Math.floor((r / opts.gridLat) * h);
        const y1 = Math.max(y0 + 1, Math.floor(((r + 1) / opts.gridLat) * h));
        for (let c = 0; c < opts.gridLon; c++) {
            const x0 = Math.floor((c / opts.gridLon) * w);
            const x1 = Math.max(x0 + 1, Math.floor(((c + 1) / opts.gridLon) * w));
            const counts = new Map<string, number>();
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const k = klassPx[y * w + x];
                    counts.set(k, (counts.get(k) ?? 0) + 1);
                }
            }
            let bestK = 'Oc';
            let bestN = 0;
            for (const [k, n] of counts) {
                if (n > bestN) { bestN = n; bestK = k; }
            }
            klassGrid[r * opts.gridLon + c] = bestK;
        }
    }

    // --- リサンプル後 PNG ---
    const grid = new PNG({ width: opts.gridLon, height: opts.gridLat });
    for (let i = 0; i < opts.gridLat * opts.gridLon; i++) {
        const k = klassGrid[i];
        const hex = KOPPEN_COLORS[k] ?? '#FF00FF';
        const [r, g, b] = hexToRgb(hex);
        grid.data[i * 4]     = r;
        grid.data[i * 4 + 1] = g;
        grid.data[i * 4 + 2] = b;
        grid.data[i * 4 + 3] = 255;
    }
    if (!fs.existsSync(path.dirname(opts.outResampledPng))) {
        fs.mkdirSync(path.dirname(opts.outResampledPng), { recursive: true });
    }
    fs.writeFileSync(opts.outResampledPng, PNG.sync.write(grid));
    console.log(`[build_reference] wrote ${opts.outResampledPng}`);

    // --- JSON 出力 ---
    fs.writeFileSync(opts.outJson, JSON.stringify({
        source: opts.inputJpg,
        gridLat: opts.gridLat,
        gridLon: opts.gridLon,
        latRange: [-90, 90],
        lonRange: [-180, 180],
        cells: klassGrid
    }));
    console.log(`[build_reference] wrote ${opts.outJson}`);

    // --- Köppen 分布サマリ ---
    const dist = new Map<string, number>();
    for (const k of klassGrid) dist.set(k, (dist.get(k) ?? 0) + 1);
    const sorted = Array.from(dist.entries()).sort((a, b) => b[1] - a[1]);
    console.log(`[build_reference] resampled Köppen distribution:`);
    const total = klassGrid.length;
    for (const [k, n] of sorted) {
        console.log(`    ${k.padEnd(5)}  ${n.toString().padStart(6)}  (${((n / total) * 100).toFixed(1)}%)`);
    }
};

main();

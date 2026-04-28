/**
 * ヘッドレス Köppen マップ出力スクリプト。
 *
 * 用途: dev サイクルでブラウザを起動せずに気候マップを PNG 出力する。
 *       退化検出・お手本との比較・連続シミュレーション結果のスナップショット用。
 *
 * 使い方:
 *   npm run render                 -> debug/climate.png に PNG 出力 (デフォルト設定)
 *   npm run render -- --seed 7     -> seed=7 で実行
 *   npm run render -- --map PROCEDURAL  -> 分散大陸モード
 *   npm run render -- --out my.png      -> 出力先指定
 */

import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

import {
    EARTH_PARAMS,
    EARTH_ATMOSPHERE,
    DEFAULT_PHYSICS_PARAMS,
    DEFAULT_CONFIG,
    KOPPEN_COLORS
} from '../constants';
import { initializeGrid } from '../services/geography';
import { runSimulation } from '../services/climateEngine';
import type { SimulationConfig } from '../types';

interface CliOpts {
    seed: number;
    startingMap: SimulationConfig['startingMap'];
    resolutionLat: number;
    resolutionLon: number;
    outPath: string;
}

const parseArgs = (argv: string[]): CliOpts => {
    const opts: CliOpts = {
        seed: DEFAULT_CONFIG.seed,
        startingMap: DEFAULT_CONFIG.startingMap,
        resolutionLat: DEFAULT_CONFIG.resolutionLat,
        resolutionLon: DEFAULT_CONFIG.resolutionLon,
        outPath: 'debug/climate.png'
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = argv[i + 1];
        if (a === '--seed' && next) { opts.seed = parseInt(next, 10); i++; }
        else if (a === '--map' && next) { opts.startingMap = next as any; i++; }
        else if (a === '--lat' && next) { opts.resolutionLat = parseInt(next, 10); i++; }
        else if (a === '--lon' && next) { opts.resolutionLon = parseInt(next, 10); i++; }
        else if (a === '--out' && next) { opts.outPath = next; i++; }
    }
    return opts;
};

const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16)
    ];
};

const koppenColor = (klass: string): [number, number, number] => {
    const hex = KOPPEN_COLORS[klass]
        || KOPPEN_COLORS[klass.substring(0, 3)]
        || KOPPEN_COLORS[klass.substring(0, 2)]
        || '#cccccc';
    return hexToRgb(hex);
};

const main = async () => {
    const opts = parseArgs(process.argv.slice(2));
    console.log(`[render_climate] seed=${opts.seed} map=${opts.startingMap} ${opts.resolutionLat}x${opts.resolutionLon} -> ${opts.outPath}`);

    const config: SimulationConfig = {
        ...DEFAULT_CONFIG,
        seed: opts.seed,
        startingMap: opts.startingMap,
        resolutionLat: opts.resolutionLat,
        resolutionLon: opts.resolutionLon
    };

    const t0 = Date.now();
    const grid = initializeGrid(config.resolutionLat, config.resolutionLon, config.startingMap, undefined, config.seed);
    const result = await runSimulation(grid, EARTH_PARAMS, EARTH_ATMOSPHERE, DEFAULT_PHYSICS_PARAMS, config, () => {});
    const dt = Date.now() - t0;
    console.log(`[render_climate] simulation done in ${dt}ms (globalTemp=${(result.globalTemp - 273.15).toFixed(2)}°C, cellCount=${result.cellCount})`);

    // Köppen 種類と陸セル比率の集計 (健全性指標)
    const counts = new Map<string, number>();
    let landCells = 0;
    for (const cell of result.grid) {
        const k = cell.climateClass;
        counts.set(k, (counts.get(k) || 0) + 1);
        if (cell.isLand) landCells++;
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    console.log(`[render_climate] Köppen distribution (top 10):`);
    for (const [k, n] of sorted.slice(0, 10)) {
        const pct = ((n / result.grid.length) * 100).toFixed(1);
        console.log(`    ${k.padEnd(4)} ${n.toString().padStart(6)}  (${pct}%)`);
    }
    console.log(`[render_climate] land cells = ${landCells} / ${result.grid.length} (${((landCells / result.grid.length) * 100).toFixed(1)}%)`);

    // PNG 出力
    const png = new PNG({ width: opts.resolutionLon, height: opts.resolutionLat });
    for (let r = 0; r < opts.resolutionLat; r++) {
        for (let c = 0; c < opts.resolutionLon; c++) {
            const cell = result.grid[r * opts.resolutionLon + c];
            const [rr, gg, bb] = koppenColor(cell.climateClass);
            const pi = (r * opts.resolutionLon + c) * 4;
            png.data[pi] = rr;
            png.data[pi + 1] = gg;
            png.data[pi + 2] = bb;
            png.data[pi + 3] = 255;
        }
    }

    const dir = path.dirname(opts.outPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(opts.outPath);
        out.on('finish', () => resolve());
        out.on('error', reject);
        png.pack().pipe(out);
    });
    console.log(`[render_climate] wrote ${opts.outPath}`);
};

main().catch(err => {
    console.error(err);
    process.exit(1);
});

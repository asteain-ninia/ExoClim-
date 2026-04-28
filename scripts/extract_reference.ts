/**
 * idealized_continent_2.jpg を細粒度クラスタリングで機械可読化するための
 * 第1段階: 色クラスタリングと統計の出力。
 *
 * 出力:
 *   - debug/clusters.png        ... 各ピクセルを所属クラスタの代表色で塗り直したPNG
 *   - debug/cluster_stats.json  ... 各クラスタID, 代表RGB, ピクセル数, 重心(x,y)
 *
 * フェーズ2 (別スクリプト) で、これらを目視確認しつつ
 * "クラスタID -> Köppen記号 / noise" の対応表を作成し、
 * 最終的な expected.png + idealized_continent_2.json を生成する。
 *
 * 使い方:
 *   npm run extract:reference
 *   npm run extract:reference -- --k 30          # クラスタ数変更
 *   npm run extract:reference -- --in foo.jpg
 */

import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - jpeg-js does not ship its own types
import * as jpeg from 'jpeg-js';

interface CliOpts {
    inputPath: string;
    outPng: string;
    outJson: string;
    k: number;
    maxIter: number;
    sampleStride: number;
    emitMasks: boolean;
}

const parseArgs = (argv: string[]): CliOpts => {
    const opts: CliOpts = {
        inputPath: 'tests/fixtures/idealized_continent_2.jpg',
        outPng: 'debug/clusters.png',
        outJson: 'debug/cluster_stats.json',
        k: 24,
        maxIter: 30,
        sampleStride: 2,
        emitMasks: false
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = argv[i + 1];
        if (a === '--in' && next) { opts.inputPath = next; i++; }
        else if (a === '--out-png' && next) { opts.outPng = next; i++; }
        else if (a === '--out-json' && next) { opts.outJson = next; i++; }
        else if (a === '--k' && next) { opts.k = parseInt(next, 10); i++; }
        else if (a === '--iter' && next) { opts.maxIter = parseInt(next, 10); i++; }
        else if (a === '--stride' && next) { opts.sampleStride = parseInt(next, 10); i++; }
        else if (a === '--masks') { opts.emitMasks = true; }
    }
    return opts;
};

type RGB = [number, number, number];

const sqDist = (a: RGB, b: RGB): number =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const toHex = (c: RGB): string =>
    '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// k-means++ 初期化: 既存セントロイドから遠いピクセルを優先的に選ぶ。
// ランダムkより安定したクラスタ分離が得られる。
const initCentroidsPP = (samples: RGB[], k: number): RGB[] => {
    const n = samples.length;
    const centroids: RGB[] = [];
    centroids.push([...samples[Math.floor(Math.random() * n)]]);
    while (centroids.length < k) {
        const dists = new Float64Array(n);
        let total = 0;
        for (let i = 0; i < n; i++) {
            let minD = Infinity;
            for (const c of centroids) {
                const d = sqDist(samples[i], c);
                if (d < minD) minD = d;
            }
            dists[i] = minD;
            total += minD;
        }
        if (total === 0) break;
        let r = Math.random() * total;
        let pick = 0;
        for (let i = 0; i < n; i++) {
            r -= dists[i];
            if (r <= 0) { pick = i; break; }
        }
        centroids.push([...samples[pick]]);
    }
    return centroids;
};

const kmeans = (samples: RGB[], k: number, maxIter: number): RGB[] => {
    const centroids = initCentroidsPP(samples, k);
    const n = samples.length;
    const labels = new Int32Array(n);

    for (let iter = 0; iter < maxIter; iter++) {
        let changed = 0;
        for (let i = 0; i < n; i++) {
            let best = 0;
            let bestD = Infinity;
            for (let j = 0; j < centroids.length; j++) {
                const d = sqDist(samples[i], centroids[j]);
                if (d < bestD) { bestD = d; best = j; }
            }
            if (labels[i] !== best) { labels[i] = best; changed++; }
        }
        if (changed === 0) {
            console.log(`[extract_reference] k-means converged at iter=${iter}`);
            break;
        }

        const sums: number[][] = Array.from({ length: centroids.length }, () => [0, 0, 0, 0]);
        for (let i = 0; i < n; i++) {
            const j = labels[i];
            sums[j][0] += samples[i][0];
            sums[j][1] += samples[i][1];
            sums[j][2] += samples[i][2];
            sums[j][3]++;
        }
        for (let j = 0; j < centroids.length; j++) {
            if (sums[j][3] > 0) {
                centroids[j] = [
                    sums[j][0] / sums[j][3],
                    sums[j][1] / sums[j][3],
                    sums[j][2] / sums[j][3]
                ];
            }
        }
    }
    return centroids;
};

const assignAll = (data: Uint8Array, w: number, h: number, centroids: RGB[]): Int32Array => {
    const labels = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        let best = 0;
        let bestD = Infinity;
        for (let j = 0; j < centroids.length; j++) {
            const c = centroids[j];
            const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
            if (d < bestD) { bestD = d; best = j; }
        }
        labels[i] = best;
    }
    return labels;
};

const main = () => {
    const opts = parseArgs(process.argv.slice(2));
    console.log(`[extract_reference] reading ${opts.inputPath}`);
    const buf = fs.readFileSync(opts.inputPath);
    const decoded: { width: number; height: number; data: Uint8Array } =
        jpeg.decode(buf, { useTArray: true });
    const w = decoded.width;
    const h = decoded.height;
    const data = decoded.data;
    console.log(`[extract_reference] ${w}x${h} pixels (${(w * h).toLocaleString()})`);

    // サンプリング (k-means の入力)
    const samples: RGB[] = [];
    for (let y = 0; y < h; y += opts.sampleStride) {
        for (let x = 0; x < w; x += opts.sampleStride) {
            const i = (y * w + x) * 4;
            samples.push([data[i], data[i + 1], data[i + 2]]);
        }
    }
    console.log(`[extract_reference] sampled ${samples.length.toLocaleString()} pixels for k-means (k=${opts.k}, stride=${opts.sampleStride})`);

    const t0 = Date.now();
    const centroids = kmeans(samples, opts.k, opts.maxIter);
    console.log(`[extract_reference] k-means done in ${Date.now() - t0}ms`);

    // 全ピクセルに最寄りセントロイドを割り当て
    const labels = assignAll(data, w, h, centroids);

    // 統計
    interface ClusterStat {
        id: number;
        rgb: [number, number, number];
        hex: string;
        count: number;
        cx: number;
        cy: number;
    }
    const stats: ClusterStat[] = centroids.map((c, id) => ({
        id,
        rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])],
        hex: toHex(c),
        count: 0,
        cx: 0,
        cy: 0
    }));
    for (let i = 0; i < labels.length; i++) {
        const j = labels[i];
        stats[j].count++;
        stats[j].cx += i % w;
        stats[j].cy += Math.floor(i / w);
    }
    for (const s of stats) {
        if (s.count > 0) {
            s.cx = Math.round(s.cx / s.count);
            s.cy = Math.round(s.cy / s.count);
        }
    }
    stats.sort((a, b) => b.count - a.count);

    console.log(`[extract_reference] cluster stats (sorted by count):`);
    for (const s of stats) {
        const pct = ((s.count / (w * h)) * 100).toFixed(1);
        console.log(
            `    #${s.id.toString().padStart(2)}  ${s.hex}  count=${s.count.toString().padStart(7)} (${pct.padStart(5)}%)  centroid=(${s.cx.toString().padStart(4)},${s.cy.toString().padStart(4)})`
        );
    }

    // 可視化PNG (各ピクセルを所属クラスタの代表色で塗り直し)
    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
        const c = centroids[labels[i]];
        png.data[i * 4]     = Math.round(c[0]);
        png.data[i * 4 + 1] = Math.round(c[1]);
        png.data[i * 4 + 2] = Math.round(c[2]);
        png.data[i * 4 + 3] = 255;
    }

    const dir = path.dirname(opts.outPng);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(opts.outJson, JSON.stringify({
        input: opts.inputPath,
        width: w,
        height: h,
        k: opts.k,
        maxIter: opts.maxIter,
        sampleStride: opts.sampleStride,
        clusters: stats
    }, null, 2));
    console.log(`[extract_reference] wrote ${opts.outJson}`);

    const stream = fs.createWriteStream(opts.outPng);
    png.pack().pipe(stream);
    stream.on('finish', () => console.log(`[extract_reference] wrote ${opts.outPng}`));
    stream.on('error', err => { console.error(err); process.exit(1); });

    // 各クラスタ単独のマスクPNGを出力 (--masks)
    if (opts.emitMasks) {
        const masksDir = path.join(path.dirname(opts.outPng), 'cluster_masks');
        if (!fs.existsSync(masksDir)) fs.mkdirSync(masksDir, { recursive: true });
        console.log(`[extract_reference] writing ${stats.length} cluster masks to ${masksDir}/`);
        for (const s of stats) {
            const mask = new PNG({ width: w, height: h });
            for (let i = 0; i < w * h; i++) {
                const v = labels[i] === s.id ? 255 : 0;
                mask.data[i * 4]     = v;
                mask.data[i * 4 + 1] = v;
                mask.data[i * 4 + 2] = v;
                mask.data[i * 4 + 3] = 255;
            }
            const outPath = path.join(masksDir, `cluster_${String(s.id).padStart(2, '0')}.png`);
            fs.writeFileSync(outPath, PNG.sync.write(mask));
        }
        console.log(`[extract_reference] mask emit done`);
    }
};

main();

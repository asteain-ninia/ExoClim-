import * as d3 from 'd3';
import { GridCell } from '../../types';

// Converts Hex color string to [r, g, b]
export const hexToRgb = (hex: string): [number, number, number] => {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

// Converts D3 color string to [r, g, b]
export const d3ColorToRgb = (c: string): [number, number, number] => {
    const co = d3.rgb(c);
    return [co.r, co.g, co.b];
};

// Average nearby ocean current effect (for thermodynamics and hydrology)
export const getNearbyOceanCurrentEffect = (
    grid: GridCell[],
    cell: GridCell,
    rows: number,
    cols: number,
    range: number = 2
): number => {
    if (!cell.isLand) return 0;
    
    // Optimization: Pre-calculate indices or use simple coordinate math
    // Assuming uniform grid
    const r = Math.round((90 - cell.lat) / 180 * (rows - 1));
    const c = Math.round((cell.lon + 180) / 360 * (cols - 1));
    
    let sum = 0;
    let count = 0;
    
    // Check local neighborhood
    for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
            const nr = r + dr;
            const nc = (c + dc + cols) % cols;
            if (nr < 0 || nr >= rows) continue;
            
            const idx = nr * cols + nc;
            // Access grid safely
            if (grid[idx] && !grid[idx].isLand) {
                sum += grid[idx].oceanCurrent;
                count++;
            }
        }
    }
    
    if (count === 0) return 0;
    return sum / count;
};

// Deterministic Noise Function to replace Math.random()
export const deterministicNoise = (x: number, y: number, seed: number = 0): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 4.1414) * 43758.5453;
    return Math.abs(n % 1); // Returns 0.0 to 1.0
};

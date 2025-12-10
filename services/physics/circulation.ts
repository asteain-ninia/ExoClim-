

import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams } from '../../types';

const toRad = (d: number) => d * Math.PI / 180;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Step 1: ITCZ Determination Algorithm
 * Based on "Generic Planet ITCZ Algorithm Specification"
 */
export const computeCirculation = (
    grid: GridCell[],
    planet: PlanetParams,
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig
): { itczLines: number[][], cellCount: number, hadleyWidth: number } => {
    
    const rows = config.resolutionLat;
    const cols = config.resolutionLon;

    // --- 0. Calculate Number of Circulation Cells ---
    // Physical Reference: Earth
    const R_EARTH = 6371; // km
    const P_ROT_EARTH = 24; // hours
    
    // N ~ Radius * Sqrt(RotationSpeed)
    // RotationSpeed ~ 1/Period
    // Therefore N ~ Radius * Sqrt(1/Period)
    // N_planet / N_earth = (R_planet / R_earth) * Sqrt(P_earth / P_planet)
    // N_earth = 3 (Hadley, Ferrel, Polar)
    
    // Note: This relies on physics proportionality, not hardcoded Earth values.
    // Earth constants are used only for unit conversion/scaling reference.
    const radiusRatio = planet.radius / R_EARTH;
    const rotSpeedRatio = P_ROT_EARTH / planet.rotationPeriod;
    
    // Heuristic Formula
    const estimatedCells = 3.0 * radiusRatio * Math.sqrt(rotSpeedRatio);
    
    // Clamp to minimum 1 cell (Single Hadley cell per hemisphere)
    // Max 15 to prevent extreme segmentation on giant fast rotators
    const cellCount = Math.min(15, Math.max(1, Math.round(estimatedCells)));
    
    // Estimated Width of the Tropical (Hadley) Cell in degrees
    // In a multi-cell model, the tropical cell is roughly 90 / N, though typically wider than high-latitude cells.
    // We approximate it as equal division for simulation parameters.
    const hadleyWidth = 90.0 / cellCount;

    // --- 1.2 Generate Influence Map (HeatMap) ---
    // S_dist: Normalized Distance (-1.0 Ocean, +1.0 Inland)
    // P_alt: Altitude Penalty
    for (const cell of grid) {
        // S_dist: Normalized by Saturation Distance
        const sDist = clamp(cell.distCoast / phys.itczSaturationDist, -1.0, 1.0);
        
        let pAlt = 1.0;
        if (cell.isLand) {
            // Altitude in km (cell.elevation is in meters)
            const altKm = cell.elevation / 1000.0;
            pAlt = Math.max(0.0, 1.0 - altKm / phys.itczAltitudeLimit);
        }
        
        cell.heatMapVal = sDist * pAlt;
    }

    // --- 1.3 Calculate Planetary Coefficients ---
    // Pressure in hPa (atm.surfacePressure is in bar) -> 1 bar = 1000 hPa
    const pAtmHpa = atm.surfacePressure * 1000;
    
    // Orbital period input directly from planet params
    const pOrb = planet.orbitalPeriod;

    const term1 = Math.pow(pOrb / phys.itczRefYear, phys.itczInertiaExp);
    const term2 = Math.pow(phys.itczRefPressure / pAtmHpa, phys.itczInertiaExp);
    
    // Clip M_planet to reasonable bounds
    const mPlanet = clamp(term1 * term2, 0.05, 1.5);
    
    const kSea = Math.min(phys.itczBaseSeaRatio * mPlanet, 0.8);
    const kLand = Math.min(phys.itczBaseLandRatio * mPlanet, 1.0);

    // --- 1.4 Smoothing Kernel Size (R) ---
    // Based on Rotation Period
    const rDeg = Math.min(
        phys.itczKernelAngle * (planet.rotationPeriod / phys.itczRefDay),
        phys.itczKernelMax
    );

    // --- 1.5 Effective Land Ratio (L_eff) ---
    // For each longitude, we need L_eff.
    // Since the result is only latitude shift, we output an array of latitudes per longitude.
    const finalLatNorth = new Float32Array(cols);
    const finalLatSouth = new Float32Array(cols);

    // Latitudes of the grid rows
    const latList: number[] = [];
    const cosLatList: number[] = [];
    for(let r=0; r<rows; r++) {
        const lat = grid[r*cols].lat; // Assumes rectangular grid
        latList.push(lat);
        cosLatList.push(Math.cos(toRad(lat)));
    }

    // Pre-process: Create 2D array for fast HeatMap access
    // Note: We only care about the Tropical Zone [0, Obliquity]
    const obliquity = planet.obliquity;

    // Helper to compute ITCZ for a specific column (lonIndex) and a specific hemisphere
    const computeItczForColumn = (c: number, isNorth: boolean): number => {
        let weightedSum = 0;
        let weightSum = 0;

        // Iterate Rows (Latitude)
        for (let r = 0; r < rows; r++) {
            const lat = latList[r];
            
            // Only consider range [0, Obliquity] in the target hemisphere
            if (isNorth) {
                if (lat < 0 || lat > obliquity) continue;
            } else {
                if (lat > 0 || lat < -obliquity) continue;
            }

            const cosLat = cosLatList[r];
            
            // Iterate Columns (Longitude window: [c - R, c + R])
            // In grid space: rDeg corresponds to some number of columns
            const lonStep = 360 / cols;
            const rCols = Math.ceil(rDeg / lonStep);

            // Simple Box Blur along Longitude
            for (let dc = -rCols; dc <= rCols; dc++) {
                // Wrap longitude
                let neighborC = (c + dc) % cols;
                if (neighborC < 0) neighborC += cols;

                const idx = r * cols + neighborC;
                const val = grid[idx].heatMapVal;

                weightedSum += val * cosLat;
                weightSum += cosLat;
            }
        }

        if (weightSum === 0) return 0; // Should not happen in tropics usually

        // L_eff: -1.0 to 1.0
        const lEff = weightedSum / weightSum;

        // --- 1.6 ITCZ Latitude ---
        // Normalize t: 0.0 (Sea) -> 1.0 (Land)
        const t = (lEff + 1.0) / 2.0;

        // Shift ratio (fraction of obliquity)
        const shiftRatio = (1.0 - t) * kSea + t * kLand;
        
        // Return absolute latitude shift
        return obliquity * shiftRatio;
    };

    // Calculate for all longitudes
    for (let c = 0; c < cols; c++) {
        // Summer in North (July) -> ITCZ is North
        const shiftN = computeItczForColumn(c, true);
        finalLatNorth[c] = shiftN;

        // Summer in South (Jan) -> ITCZ is South (result is positive shift magnitude)
        const shiftS = computeItczForColumn(c, false);
        finalLatSouth[c] = -shiftS; // Convert to actual latitude
    }

    // --- 1.7 Interpolation / Output ---
    // The visualizer handles spline interpolation if we provide the points.
    // We provide 12 months.
    // Standard approach: 
    // Month 0 (Jan): ITCZ is fully South
    // Month 6 (July): ITCZ is fully North
    // Other months: Sinusoidal interpolation between South and North peaks

    const itczLines: number[][] = [];
    for (let m = 0; m < 12; m++) {
        // tMonth: 0 (Jan) -> 1 (July) -> 0 (Jan)
        // 0=Jan (South), 6=July (North)
        // Cosine wave: -cos(m * PI / 6) ranges from -1 to 1.
        // We want Jan=-1 (South), July=1 (North).
        // phase: m=0 -> -1, m=6 -> 1.
        const phase = -Math.cos(m * Math.PI / 6);
        
        const line: number[] = [];
        for (let c = 0; c < cols; c++) {
            const latN = finalLatNorth[c]; // Peak North
            const latS = finalLatSouth[c]; // Peak South (negative)
            
            // Interpolate
            // if phase -1 -> latS
            // if phase 1 -> latN
            const t = (phase + 1) / 2; // 0 to 1
            const currentLat = latS * (1 - t) + latN * t;
            line.push(currentLat);
        }
        itczLines.push(line);
    }

    return { itczLines, cellCount, hadleyWidth };
};

import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, PhysicsParams, WindBeltsResult } from '../../types';

/**
 * Step 2: Wind Belts Analysis
 * 
 * Unit B/C Implementation:
 * - Moves hardcoded zonal wind logic from climateEngine to here.
 * - Prepares the WindBeltsResult for UI debugging.
 */
export const computeWindBelts = (
    grid: GridCell[],
    circulationRes: { itczLines: number[][], cellCount: number, hadleyWidth: number },
    planet: PlanetParams,
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig
): WindBeltsResult => {
    
    const rotationSign = planet.isRetrograde ? -1 : 1;

    // --- Unit C: Apply Zonal Wind (Legacy Logic Moved from Engine) ---
    // This will be replaced by generalized cell logic in Unit D.
    for (const cell of grid) {
        const latAbs = Math.abs(cell.lat);
        let baseU = 0;
        
        // Simple 3-band model (Legacy)
        if (latAbs < 30) {
            baseU = -phys.windBaseSpeedEasterly; 
        } else if (latAbs < 60) {
            baseU = phys.windBaseSpeedWesterly;
        } else {
            baseU = -2.0; // Polar easterlies
        }
        
        const u = baseU * rotationSign;

        // Fill all months with this baseline for now
        cell.windU = new Array(12).fill(u);
        cell.windV = new Array(12).fill(0);
        cell.pressure = new Array(12).fill(1013);
    }

    // --- Prepare Result ---
    // These values are scaffold/placeholders until Unit D/E
    const hadleyEdge = circulationRes.hadleyWidth;
    const boundaries = [hadleyEdge, 60]; // Simplified legacy boundaries

    return {
        hadleyEdgeDeg: hadleyEdge,
        cellBoundariesDeg: boundaries,
        doldrumsHalfWidthDeg: phys.windDoldrumsWidthDeg,
        tradePeakOffsetDeg: phys.windTradePeakOffsetDeg,
        oceanEcLatGapDerived: phys.oceanEcLatGap, // Pass through manual value for now
        modelLevel: 'scaffold',
        debug: {
            paramsUsed: {
                rotationSign,
                cellCount: circulationRes.cellCount,
                hadleyWidth: circulationRes.hadleyWidth
            }
        }
    };
};

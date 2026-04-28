
import { GridCell, PlanetParams, AtmosphereParams, SimulationConfig, SimulationResult, PhysicsParams } from '../types';
import { calculateInsolation } from './physics/insolation';
import { computeCirculation } from './physics/circulation';
import { computeWindBelts } from './physics/windBelts';
import { computeOceanCurrents } from './physics/ocean';
import { computeAirflowDetailed } from './physics/airflow';
import { computeRealTemp } from './physics/thermodynamics';
import { computeHydrology } from './physics/hydrology';
import { computeKoppen } from './classification';
export { initializeGrid } from './geography';

export const runSimulation = async (
  grid: GridCell[],
  planet: PlanetParams,
  atm: AtmosphereParams,
  phys: PhysicsParams,
  config: SimulationConfig,
  onProgress: (progress: number, label?: string, stepId?: string) => void
): Promise<SimulationResult> => {

  onProgress(5, "Initializing Grid...", 'elevation');

  // Step 0: Geography is already set by initializeGrid (passed in as `grid`)
  for (const cell of grid) {
      cell.insolation = new Array(12).fill(0);
      cell.tempZonal = new Array(12).fill(0);
      cell.oceanCurrent = 0;
      cell.temp = new Array(12).fill(0);
      cell.pressure = new Array(12).fill(1013);
      cell.windU = new Array(12).fill(0);
      cell.windV = new Array(12).fill(0);
      cell.uplift = new Array(12).fill(0);
      cell.hadleyCell = new Array(12).fill(0);
      cell.moisture = new Array(12).fill(0);
      cell.precip = new Array(12).fill(0);
      cell.heatMapVal = 0;
      cell.collisionMask = 0;
      cell.climateClass = cell.isLand ? '?' : 'Oc';
  }

  await new Promise(r => setTimeout(r, 30));

  // --- Step 0.5: Insolation (orbital geometry) ---
  onProgress(15, "Step 0.5: Calculating Insolation...", 'elevation');
  calculateInsolation(grid, planet, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 1: ITCZ & Circulation ---
  onProgress(25, "Step 1: Calculating ITCZ...", 'step1');
  const circulationRes = computeCirculation(grid, planet, atm, phys, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 2: Wind Belts ---
  onProgress(40, "Step 2: Calculating Wind Belts...", 'step2');
  const windRes = computeWindBelts(grid, circulationRes, planet, atm, phys, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 3: Ocean Currents ---
  onProgress(55, "Step 3: Ocean Currents...", 'step3');
  // Unit G: Pass derived gap for alignment
  const physForOcean = { ...phys, oceanEcLatGap: windRes.oceanEcLatGapDerived };
  const oceanRes = computeOceanCurrents(grid, circulationRes.itczLines, physForOcean, config, planet);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 4: Airflow Detailed (placeholder) ---
  onProgress(70, "Step 4: Refining Airflow...", 'step4');
  computeAirflowDetailed(grid, circulationRes, windRes, oceanRes, planet, atm, phys, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 5: Surface Temperature ---
  onProgress(80, "Step 5: Surface Temperature...", 'step4');
  const thermoRes = computeRealTemp(grid, planet, atm, phys, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 6: Hydrology ---
  onProgress(90, "Step 6: Hydrology...", 'step4');
  computeHydrology(grid, circulationRes.itczLines, windRes, planet, atm, config);
  await new Promise(r => setTimeout(r, 30));

  // --- Step 7: Köppen Classification ---
  onProgress(97, "Step 7: Climate Classification...", 'step4');
  computeKoppen(grid, config);
  await new Promise(r => setTimeout(r, 30));

  onProgress(100, "Ready", undefined);

  return {
      grid,
      globalTemp: thermoRes.globalTemp,
      maxTemp: thermoRes.maxTemp,
      minTemp: thermoRes.minTemp,
      hadleyWidth: circulationRes.hadleyWidth,
      cellCount: circulationRes.cellCount,
      itczLats: new Array(12).fill(0),
      itczLines: circulationRes.itczLines,
      wind: windRes,
      oceanStreamlines: oceanRes.streamlines,
      impactPoints: oceanRes.impacts,
      diagnostics: oceanRes.diagnostics,
      implementationStatus: {
          thermoModel: 'implemented',
          hydroModel: 'implemented',
          climateClassification: 'implemented'
      }
  };
};

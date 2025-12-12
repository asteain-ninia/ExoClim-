
import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint, OceanImpact, OceanDiagnosticLog, DebugSimulationData, DebugFrame, DebugAgentSnapshot } from '../../types';

// Extended Agent Interface for Physics & Debugging
interface Agent {
  id: number;
  active: boolean;
  x: number; // Float grid coordinate
  y: number; // Float grid coordinate
  vx: number;
  vy: number;
  strength: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
  
  // Lifecycle / Debug State
  state: 'active' | 'dead' | 'stuck' | 'impact';
  cause?: string;
  age: number;
  stagnationCounter: number;
  lastX: number;
  lastY: number;
}

interface ImpactPointTemp {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

export const computeOceanCurrents = (
  grid: GridCell[],
  itczLines: number[][],
  phys: PhysicsParams,
  config: SimulationConfig,
  debugMonth?: number // Optional: If provided, generates DebugSimulationData for this month
): { streamlines: OceanStreamline[][], impacts: OceanImpact[][], diagnostics: OceanDiagnosticLog[], debugData?: DebugSimulationData } => {
  const streamlinesByMonth: OceanStreamline[][] = [];
  const impactsByMonth: OceanImpact[][] = [];
  const diagnostics: OceanDiagnosticLog[] = [];
  
  // If debugMonth is specified, we focus logic on that month for detailed capture
  const targetMonths = debugMonth !== undefined ? [debugMonth] : [0, 6]; 
  
  const rows = config.resolutionLat;
  const cols = config.resolutionLon;
  
  // Helpers
  const getIdx = (c: number, r: number) => {
    let cc = ((c % cols) + cols) % cols;
    let rr = Math.max(0, Math.min(rows - 1, r));
    return Math.floor(rr) * cols + Math.floor(cc);
  };
  
  const getLatFromRow = (r: number) => 90 - (r / (rows - 1)) * 180;
  const getRowFromLat = (lat: number) => (90 - lat) / 180 * (rows - 1);
  const getLonFromCol = (c: number) => -180 + (c / cols) * 360;

  // --- STEP 2.0: Generate Collision Field ---
  
  let collisionField = new Float32Array(rows * cols);
  for(let i=0; i<grid.length; i++) {
      // Positive = Land/Wall, Negative = Ocean
      collisionField[i] = grid[i].distCoast + phys.oceanCollisionBuffer;
  }

  // Smooth Field
  for(let iter=0; iter<phys.oceanSmoothing; iter++) {
      const nextField = new Float32Array(rows * cols);
      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              let sum = 0;
              let count = 0;
              for(let dr=-1; dr<=1; dr++) {
                  for(let dc=-1; dc<=1; dc++) {
                      const nr = Math.min(Math.max(r+dr, 0), rows-1);
                      const nc = ((c+dc) % cols + cols) % cols;
                      sum += collisionField[nr*cols + nc];
                      count++;
                  }
              }
              nextField[r*cols + c] = sum / count;
          }
      }
      collisionField = nextField;
  }

  // Store for Visualization (Main App)
  for(let i=0; i<grid.length; i++) {
      grid[i].collisionMask = collisionField[i];
  }
  
  // Compute Gradients (Point TOWARDS higher values = Land)
  const distGradX = new Float32Array(rows * cols);
  const distGradY = new Float32Array(rows * cols);
  
  for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
          const idx = r*cols + c;
          const idxLeft = getIdx(c-1, r);
          const idxRight = getIdx(c+1, r);
          const idxUp = getIdx(c, r-1);
          const idxDown = getIdx(c, r+1);
          
          distGradX[idx] = (collisionField[idxRight] - collisionField[idxLeft]) * 0.5;
          distGradY[idx] = (collisionField[idxDown] - collisionField[idxUp]) * 0.5; 
      }
  }

  const getEnvironment = (x: number, y: number) => {
      const c = Math.floor(x);
      const r = Math.floor(y);
      const fx = x - c;
      const fy = y - r;
      
      const idx00 = getIdx(c, r);
      const idx10 = getIdx(c+1, r);
      const idx01 = getIdx(c, r+1);
      const idx11 = getIdx(c+1, r+1);
      
      const interpolate = (v00: number, v10: number, v01: number, v11: number) => 
        v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy;

      return { 
          dist: interpolate(collisionField[idx00], collisionField[idx10], collisionField[idx01], collisionField[idx11]),
          gx: interpolate(distGradX[idx00], distGradX[idx10], distGradX[idx01], distGradX[idx11]),
          gy: interpolate(distGradY[idx00], distGradY[idx10], distGradY[idx01], distGradY[idx11])
      };
  };

  const findSafeSpawnX = (startX: number, y: number): number => {
      const maxSearch = 40; 
      let currX = startX;
      for(let i=0; i<maxSearch; i++) {
          const env = getEnvironment(currX, y);
          if (env.dist < -10.0) return currX - 1.0; 
          currX -= 0.5;
      }
      return startX - 10.0; 
  };

  // --- Debug Data Holder ---
  let collectedDebugData: DebugSimulationData | undefined = undefined;

  // --- Simulation Loop ---

  for (const m of targetMonths) {
    const isDebugRun = (debugMonth === m);
    const debugFrames: DebugFrame[] = [];
    
    const itcz = itczLines[m];
    const finishedLines: OceanStreamline[] = [];
    const impactResults: OceanImpact[] = [];
    const impactPointsTemp: ImpactPointTemp[] = [];
    
    // ** Spatial Pruning Grid **
    const flowGridU = new Float32Array(rows * cols).fill(0);
    const flowGridV = new Float32Array(rows * cols).fill(0);
    const flowGridCount = new Uint8Array(rows * cols).fill(0);

    const updateAndCheckPruning = (x: number, y: number, vx: number, vy: number): boolean => {
        const idx = getIdx(Math.round(x), Math.round(y));
        const count = flowGridCount[idx];
        
        if (count === 0) {
            flowGridU[idx] = vx;
            flowGridV[idx] = vy;
            flowGridCount[idx] = 1;
            return false; 
        }

        const ex = flowGridU[idx];
        const ey = flowGridV[idx];
        const dot = vx * ex + vy * ey;
        const len1 = Math.sqrt(vx*vx + vy*vy);
        const len2 = Math.sqrt(ex*ex + ey*ey);
        const sim = dot / (len1 * len2 + 0.0001);

        if (sim > 0.95) return true; 
        return false;
    };

    // --- Time Stepping Config ---
    const MAX_STEPS = phys.oceanStreamlineSteps;
    const SUB_STEPS = 10; 
    const TOTAL_DT = 0.5; 
    const DT = TOTAL_DT / SUB_STEPS;

    // --- PASS 1: Equatorial Counter Current (ECC) ---
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 64); 

    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      if (env.dist > -20) continue; 

      const westIdx = getIdx(c - 1, Math.round(r));
      const westIsWall = collisionField[westIdx] > 0;

      let shouldSpawn = false;
      if (westIsWall) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          eccAgents.push({
              id: nextAgentId++, active: true, x: c, y: r, vx: phys.oceanBaseSpeed, vy: 0.0, strength: 2.0, type: 'ECC',
              state: 'active', age: 0, stagnationCounter: 0, lastX: c, lastY: r
          });
      }
    }
    
    // Track paths for Streamlines (Visualization)
    let agentPoints: StreamlinePoint[][] = eccAgents.map(a => [{
        x: a.x, y: a.y, lon: getLonFromCol(a.x), lat: getLatFromRow(a.y), vx: a.vx, vy: a.vy
    }]);

    // Store EC spawns for Phase 2. 
    // In normal mode we just push to impactPointsTemp. In debug mode we might need to show them spawning.
    // We'll just collect them normally and spawn new agents in Phase 2.
    
    // ================= ECC LOOP =================
    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = eccAgents.filter(a => a.active);
        const frameSnapshot: DebugAgentSnapshot[] = [];

        // Stop if no agents and not debugging (if debugging, we might want to record empty frames or just stop)
        if (activeAgents.length === 0 && !isDebugRun) break;
        if (activeAgents.length === 0 && isDebugRun) {
             // If all died, we still record the frame showing them dead/impacted if we want persistence,
             // but current logic filters active. 
             // We will snapshot ALL agents if debugging to show final states.
        }

        for (const agent of eccAgents) {
            // If debug, we process everyone (to update state/cause). If normal, only active.
            if (!agent.active && !isDebugRun) continue; 
            if (!agent.active && isDebugRun) {
                // Just snapshot dead agents
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
                continue;
            }

            // --- Movement Logic ---
            
            // Stagnation Check
            const moveDist = Math.abs(agent.x - agent.lastX) + Math.abs(agent.y - agent.lastY);
            if (moveDist < 0.05 * TOTAL_DT) agent.stagnationCounter++;
            else agent.stagnationCounter = 0;
            agent.lastX = agent.x; agent.lastY = agent.y;
            if (agent.stagnationCounter > 20) {
                 agent.active = false; agent.state = 'stuck'; agent.cause = "Stagnation";
                 if (agent.type === 'ECC') diagnostics.push({ type: 'ECC_STUCK', x: agent.x, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(agent.x), age: agent.age, message: "ECC Stagnated" });
            }

            // Pruning (only for streamlines, not affecting debug state usually, but let's consistency)
            if (agent.active && agentPoints[agent.id].length > 5) {
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false; agent.state = 'dead'; agent.cause = "Merged/Pruned";
                 }
            }

            if (agent.active) {
                for(let ss=0; ss<SUB_STEPS; ss++) {
                    const baseAx = phys.oceanBaseSpeed * 0.05; 
                    const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                    const targetLat = itcz[lonIdx];
                    const targetY = getRowFromLat(targetLat);
                    const distY = targetY - agent.y;
                    const ayItcz = distY * phys.oceanPatternForce;

                    let nvx = agent.vx + baseAx;
                    let nvy = agent.vy + ayItcz;
                    const nextX = agent.x + nvx * DT;
                    const nextY = agent.y + nvy * DT;

                    const { dist: distOld } = getEnvironment(agent.x, agent.y);
                    const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                    if (distNew > 0 && distOld <= 0) {
                        // Impact
                        let tLow = 0, tHigh = 1; let hitX = agent.x, hitY = agent.y;
                        for(let k=0; k<4; k++) {
                            const tMid = (tLow + tHigh) * 0.5;
                            const mx = agent.x + (nextX - agent.x) * tMid;
                            const my = agent.y + (nextY - agent.y) * tMid;
                            const mEnv = getEnvironment(mx, my);
                            if (mEnv.dist > 0) tHigh = tMid; else tLow = tMid;
                            hitX = mx; hitY = my;
                        }
                        const { gx: hgx, gy: hgy } = getEnvironment(hitX, hitY);
                        const gradLen = Math.sqrt(hgx*hgx + hgy*hgy);
                        const nx = gradLen > 0 ? hgx / gradLen : 0;
                        const ny = gradLen > 0 ? hgy / gradLen : 0;
                        const vDotN = nvx * nx + nvy * ny;

                        if (vDotN > 0.05) {
                            // Hard Impact
                            impactResults.push({ x: hitX, y: hitY, lat: getLatFromRow(hitY), lon: getLonFromCol(hitX), type: 'ECC' });
                            const safeSpawnX = findSafeSpawnX(hitX, hitY);
                            impactPointsTemp.push({ x: safeSpawnX, y: hitY, lat: getLatFromRow(hitY), lon: getLonFromCol(safeSpawnX) });

                            agent.active = false; agent.state = 'impact'; agent.cause = "Coastal Impact";
                            break; 
                        } else {
                            // Slide
                            nvx = nvx - vDotN * nx; nvy = nvy - vDotN * ny;
                            const epsilon = 0.1;
                            agent.x = hitX - nx * epsilon; agent.y = hitY - ny * epsilon;
                        }
                    } else if (distNew > 0) {
                        // Recovery
                        const gradLen = Math.sqrt(gx*gx + gy*gy);
                        if (gradLen > 0.0001) {
                            const nx = gx / gradLen; const ny = gy / gradLen;
                            const pushFactor = distNew + 0.1; 
                            agent.x -= nx * pushFactor; agent.y -= ny * pushFactor;
                        }
                    } else {
                        agent.x = nextX; agent.y = nextY;
                    }

                    const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                    const maxSpeed = phys.oceanBaseSpeed * 2.5; 
                    if (speed > maxSpeed) { nvx = (nvx / speed) * maxSpeed; nvy = (nvy / speed) * maxSpeed; }
                    if (speed < 0.01) {
                        agent.active = false; agent.state = 'stuck'; agent.cause = "Zero Velocity"; break;
                    }
                    agent.vx = nvx; agent.vy = nvy;
                    
                    const nextLat = getLatFromRow(agent.y);
                    if (Math.abs(nextLat - itcz[lonIdx]) > phys.oceanDeflectLat * 1.5) {
                         agent.active = false; agent.state = 'dead'; agent.cause = "Deflected too far"; break; 
                    }
                }
            }
            
            agent.age++;

            if (agent.active && agentPoints[agent.id]) {
                agentPoints[agent.id].push({
                    x: agent.x, y: agent.y, lon: getLonFromCol(agent.x), lat: getLatFromRow(agent.y), vx: agent.vx, vy: agent.vy
                });
            }

            if (isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
            }
        }

        if (isDebugRun) debugFrames.push({ step, agents: frameSnapshot });
        if (eccAgents.every(a => !a.active) && !isDebugRun) break;
    }

    // Save Streamlines for ECC
    for(const agent of eccAgents) {
        if (agentPoints[agent.id] && agentPoints[agent.id].length > 5) {
            finishedLines.push({ points: agentPoints[agent.id], strength: agent.strength, type: 'main' });
        }
    }

    // --- PASS 2: Equatorial Current (EC) ---
    
    let ecAgents: Agent[] = [];
    // nextAgentId continues
    
    // Convert impacts to agents
    for (const ip of impactPointsTemp) {
        ecAgents.push({
            id: nextAgentId++, active: true, x: ip.x, y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5, vy: -phys.oceanEcPolewardDrift, strength: 2.0, type: 'EC_N',
            state: 'active', age: 0, stagnationCounter: 0, lastX: ip.x, lastY: ip.y
        });
        ecAgents.push({
            id: nextAgentId++, active: true, x: ip.x, y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5, vy: phys.oceanEcPolewardDrift, strength: 2.0, type: 'EC_S',
            state: 'active', age: 0, stagnationCounter: 0, lastX: ip.x, lastY: ip.y
        });
    }

    // EC Points Tracking
    let ecPoints: StreamlinePoint[][] = []; // Sparse array indexed by ID
    for(const a of ecAgents) {
        ecPoints[a.id] = [{
            x: a.x, y: a.y, lon: getLonFromCol(a.x), lat: getLatFromRow(a.y), vx: a.vx, vy: a.vy
        }];
    }

    const startStepPhase2 = debugFrames.length;

    // ================= EC LOOP =================
    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = ecAgents.filter(a => a.active);
        const frameSnapshot: DebugAgentSnapshot[] = [];

        if (activeAgents.length === 0 && !isDebugRun) break;

        for (const agent of ecAgents) {
            if (!agent.active && !isDebugRun) continue;
            if (!agent.active && isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
                continue;
            }

            // --- Movement ---
            if (agentPoints[agent.id] && agentPoints[agent.id].length > 5 && !isDebugRun) {
                // Pruning reuse
                 if (updateAndCheckPruning(agent.x, agent.y, agent.vx, agent.vy)) {
                     agent.active = false; agent.state = 'dead'; agent.cause = "Merged/Pruned";
                 }
            }

            // Stagnation
            const moveDist = Math.abs(agent.x - agent.lastX) + Math.abs(agent.y - agent.lastY);
            if (moveDist < 0.05 * TOTAL_DT) agent.stagnationCounter++;
            else agent.stagnationCounter = 0;
            agent.lastX = agent.x; agent.lastY = agent.y;
            
            if (agent.stagnationCounter > 20) {
                agent.active = false; agent.state = 'stuck'; agent.cause = "Stagnation";
            }

            if (agent.active) {
                for(let ss=0; ss<SUB_STEPS; ss++) {
                    let baseAx = -phys.oceanBaseSpeed * 0.05;
                    const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
                    const baseItczLat = itcz[lonIdx];
                    const ecSeparation = phys.oceanEcLatGap;
                    
                    let targetLat = baseItczLat;
                    if (agent.type === 'EC_N') targetLat += ecSeparation; 
                    else targetLat -= ecSeparation; 
                    
                    const targetY = getRowFromLat(targetLat);
                    const errorY = targetY - agent.y; 
                    
                    const k = phys.oceanEcPatternForce;
                    const criticalDamping = 2.0 * Math.sqrt(k);
                    let currentDamping = phys.oceanEcDamping;
                    if (Math.abs(errorY) < 3.0) { 
                         const factor = (3.0 - Math.abs(errorY)) / 3.0; 
                         const targetDamping = Math.max(currentDamping, criticalDamping * 1.5);
                         currentDamping = currentDamping * (1 - factor) + targetDamping * factor;
                    }
                    const pTerm = errorY * k;
                    const dTerm = -agent.vy * currentDamping;
                    const ayControl = pTerm + dTerm;

                    let nvx = agent.vx + baseAx;
                    let nvy = agent.vy + ayControl;

                    const { dist: distOld } = getEnvironment(agent.x, agent.y);
                    const nextX = agent.x + nvx * DT;
                    const nextY = agent.y + nvy * DT;
                    const { dist: distNew, gx, gy } = getEnvironment(nextX, nextY);

                    if (distNew > -50) { 
                        const gradLen = Math.sqrt(gx*gx + gy*gy);
                        if (gradLen > 0.0001) {
                            const nx = gx / gradLen; const ny = gy / gradLen;
                            const repulsion = 0.8 * (1.0 - (distNew / -50)); 
                            nvx -= nx * repulsion; nvy -= ny * repulsion;
                        }
                    }

                    if (distNew > 0 && distOld <= 0) {
                         let tLow = 0, tHigh = 1; let hitX = agent.x, hitY = agent.y;
                        for(let k=0; k<4; k++) {
                            const tMid = (tLow + tHigh) * 0.5;
                            const mx = agent.x + (nextX - agent.x) * tMid;
                            const my = agent.y + (nextY - agent.y) * tMid;
                            const mEnv = getEnvironment(mx, my);
                            if (mEnv.dist > 0) tHigh = tMid; else tLow = tMid;
                            hitX = mx; hitY = my;
                        }
                        const { gx: hgx, gy: hgy } = getEnvironment(hitX, hitY);
                        const gradLen = Math.sqrt(hgx*hgx + hgy*hgy);
                        const nx = gradLen > 0 ? hgx / gradLen : 0;
                        const ny = gradLen > 0 ? hgy / gradLen : 0;
                        const vDotN = nvx * nx + nvy * ny;
                        
                        if (vDotN > 0.05) {
                            // Hard Impact (EC arrival at west coast)
                             if (Math.random() < 0.1) {
                                 impactResults.push({ x: hitX, y: hitY, lat: getLatFromRow(hitY), lon: getLonFromCol(hitX), type: 'EC' });
                             }
                            agent.active = false; agent.state = 'dead'; agent.cause = "West Coast Arrival"; 
                            // Check for infant death (bad spawn logic detection)
                            if (agent.age < 5) {
                                diagnostics.push({ type: 'EC_INFANT_DEATH', x: agent.x, y: agent.y, lat: getLatFromRow(agent.y), lon: getLonFromCol(agent.x), age: agent.age, message: "EC Died on Spawn" });
                            }
                            break; 
                        } else {
                            // Slide
                            nvx = nvx - vDotN * nx; nvy = nvy - vDotN * ny;
                            nvx *= 0.9; nvy *= 0.9;
                            agent.x = hitX - nx * 0.1; agent.y = hitY - ny * 0.1;
                        }
                    } else if (distNew > 0) {
                        const gradLen = Math.sqrt(gx*gx + gy*gy);
                        if (gradLen > 0.0001) {
                            const nx = gx / gradLen; const ny = gy / gradLen;
                            const pushOut = distNew + 0.1;
                            agent.x -= nx * pushOut; agent.y -= ny * pushOut;
                        } else {
                            agent.active = false; agent.state = 'stuck'; agent.cause = "Trapped in Land"; break;
                        }
                    } else {
                         agent.x = nextX; agent.y = nextY;
                    }
                    
                    const speed = Math.sqrt(nvx*nvx + nvy*nvy);
                    const maxSpeed = phys.oceanBaseSpeed * 2.0;
                    if (speed > maxSpeed) { nvx = (nvx / speed) * maxSpeed; nvy = (nvy / speed) * maxSpeed; }
                    if (speed < 0.01) {
                        agent.active = false; agent.state = 'stuck'; agent.cause = "Zero Velocity"; break;
                    }

                    agent.vx = nvx; agent.vy = nvy;
                    if (Math.abs(getLatFromRow(agent.y)) > 85) { 
                        agent.active = false; agent.state = 'dead'; agent.cause = "Polar Exit"; break; 
                    }
                }
            }

            agent.age++;
            if (agent.active && ecPoints[agent.id]) {
                ecPoints[agent.id].push({
                    x: agent.x, y: agent.y, lon: getLonFromCol(agent.x), lat: getLatFromRow(agent.y), vx: agent.vx, vy: agent.vy
                });
            }

            if (isDebugRun) {
                frameSnapshot.push({
                    id: agent.id, type: agent.type, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
                    state: agent.state, cause: agent.cause
                });
            }
        }
        
        if (isDebugRun) debugFrames.push({ step: startStepPhase2 + step, agents: frameSnapshot });
        if (ecAgents.every(a => !a.active) && !isDebugRun) break;
    }

    // Save EC Streamlines
    for(const agent of ecAgents) {
        if (ecPoints[agent.id] && ecPoints[agent.id].length > 5) {
            finishedLines.push({ points: ecPoints[agent.id], strength: agent.strength, type: agent.type === 'EC_N' ? 'split_n' : 'split_s' });
        }
    }

    if (isDebugRun) {
        collectedDebugData = {
            frames: debugFrames,
            collisionField: collisionField, // Export full field for viz
            width: cols,
            height: rows,
            itczLine: itcz
        };
    }

    streamlinesByMonth[m] = finishedLines;
    impactsByMonth[m] = impactResults;
  }
  
  // Fill empty months
  for(let m=0; m<12; m++) {
      if (!streamlinesByMonth[m]) {
          streamlinesByMonth[m] = [];
          impactsByMonth[m] = [];
      }
  }

  return { streamlines: streamlinesByMonth, impacts: impactsByMonth, diagnostics, debugData: collectedDebugData };
};

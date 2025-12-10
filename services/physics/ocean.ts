import { GridCell, SimulationConfig, PhysicsParams, OceanStreamline, StreamlinePoint } from '../../types';

interface Agent {
  id: number;
  active: boolean;
  x: number; // Float grid coordinate
  y: number; // Float grid coordinate
  vx: number;
  vy: number;
  strength: number;
  age: number;
  type: 'ECC' | 'EC_N' | 'EC_S';
  hasTriggeredImpact?: boolean; // For ECC to avoid multiple triggers
}

interface ImpactPoint {
  x: number;
  y: number;
  lat: number;
}

export const computeOceanCurrents = (
  grid: GridCell[],
  itczLines: number[][],
  phys: PhysicsParams,
  config: SimulationConfig
): OceanStreamline[][] => {
  const streamlinesByMonth: OceanStreamline[][] = [];
  const targetMonths = [0, 6]; // Jan and Jul
  
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
  const isLand = (c: number, r: number) => grid[getIdx(c, r)].isLand;
  
  // Pre-calculate gradient of distance field for collision normals
  const distGradX = new Float32Array(rows * cols);
  const distGradY = new Float32Array(rows * cols);
  
  for(let r=0; r<rows; r++) {
      for(let c=0; c<cols; c++) {
          const idx = r*cols + c;
          const left = grid[getIdx(c-1, r)].distCoast;
          const right = grid[getIdx(c+1, r)].distCoast;
          const up = grid[getIdx(c, r-1)].distCoast; // r-1 is North
          const down = grid[getIdx(c, r+1)].distCoast;
          
          distGradX[idx] = (right - left) * 0.5;
          distGradY[idx] = (down - up) * 0.5; 
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
      
      const d00 = grid[idx00].distCoast;
      const d10 = grid[idx10].distCoast;
      const d01 = grid[idx01].distCoast;
      const d11 = grid[idx11].distCoast;
      
      const dist = 
        d00 * (1-fx)*(1-fy) +
        d10 * fx * (1-fy) +
        d01 * (1-fx) * fy +
        d11 * fx * fy;
        
      const gx = 
        distGradX[idx00] * (1-fx)*(1-fy) +
        distGradX[idx10] * fx * (1-fy) +
        distGradX[idx01] * (1-fx) * fy +
        distGradX[idx11] * fx * fy;

      const gy = 
        distGradY[idx00] * (1-fx)*(1-fy) +
        distGradY[idx10] * fx * (1-fy) +
        distGradY[idx01] * (1-fx) * fy +
        distGradY[idx11] * fx * fy;
        
      return { dist, gx, gy };
  };

  for (const m of targetMonths) {
    const itcz = itczLines[m];
    const finishedLines: OceanStreamline[] = [];
    const impactPoints: ImpactPoint[] = [];
    
    // --- PASS 1: Equatorial Counter Current (ECC) ---
    // Flows West -> East (+U)
    // Starts deep ocean, dies at continent.
    
    let eccAgents: Agent[] = [];
    let nextAgentId = 0;
    const gapFillInterval = Math.floor(cols / 24); 

    // Spawn ECC
    for (let c = 0; c < cols; c++) {
      const itczLat = itcz[c];
      const r = getRowFromLat(itczLat);
      if (r < 0 || r >= rows) continue;
      const env = getEnvironment(c, r);
      
      // Spawn in deep ocean
      if (env.dist > -50) continue; 

      const westIsLand = grid[getIdx(c - 1, Math.round(r))].isLand;
      let shouldSpawn = false;
      if (westIsLand) shouldSpawn = true;
      else if (c % gapFillInterval === 0) shouldSpawn = true;

      if (shouldSpawn) {
          eccAgents.push({
              id: nextAgentId++,
              active: true,
              x: c,
              y: r,
              vx: phys.oceanBaseSpeed, // Initial Eastward flow
              vy: 0.0,
              strength: 2.0,
              age: 0,
              type: 'ECC'
          });
      }
    }

    const MAX_STEPS = phys.oceanStreamlineSteps;
    const DT = 0.5; 
    const SHELF_DEPTH = -200; 

    // Run ECC Simulation
    // We store traces to add to finishedLines
    let agentPoints: StreamlinePoint[][] = eccAgents.map(a => [{
        x: a.x, y: a.y,
        lon: -180 + (a.x % cols) / cols * 360,
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = eccAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);
            
            // 1. Eastward Drive
            const baseAx = phys.oceanBaseSpeed * 0.05; 

            // 2. ITCZ Attraction
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const targetLat = itcz[lonIdx];
            const targetY = getRowFromLat(targetLat);
            const distY = targetY - agent.y;
            const ayItcz = distY * phys.oceanPatternForce;

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayItcz;
            
            // 3. Wall Sliding (Impact Detection)
            if (dist > SHELF_DEPTH) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    
                    if (dot > 0) {
                        // Project onto tangent
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        // ECC IMPACT LOGIC:
                        if (!agent.hasTriggeredImpact) {
                             agent.hasTriggeredImpact = true;
                             impactPoints.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y) });
                        }

                        // If the wall forces us to turn back West (vx < 0), this agent is "done" as an ECC.
                        if (nvx < -0.1) {
                            agent.active = false;
                            continue;
                        }
                    }
                }
                
                // Hard stop
                if (dist > 10.0) {
                     if (!agent.hasTriggeredImpact) {
                         impactPoints.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y) });
                     }
                     agent.active = false;
                     continue;
                }
            }

            // Cap Speed
            const speed = Math.sqrt(nvx*nvx + nvy*nvy);
            const maxSpeed = phys.oceanBaseSpeed * 2.0; 
            if (speed > maxSpeed) {
                nvx = (nvx / speed) * maxSpeed;
                nvy = (nvy / speed) * maxSpeed;
            }

            if (speed < 0.01) {
                // If stuck, die
                agent.active = false;
                continue;
            }

            agent.vx = nvx;
            agent.vy = nvy;
            const nextX = agent.x + agent.vx * DT;
            const nextY = agent.y + agent.vy * DT;
            
            // Boundary / Divergence check
            const nextLonIdx = Math.floor(((nextX % cols) + cols) % cols);
            const nextItczLat = itcz[nextLonIdx];
            const nextLat = getLatFromRow(nextY);
            
            if (Math.abs(nextLat - nextItczLat) > phys.oceanDeflectLat) {
                 agent.active = false; 
                 continue; 
            }

            agent.x = nextX;
            agent.y = nextY;
            
            agentPoints[agent.id].push({
                x: nextX, y: nextY,
                lon: -180 + (nextX % cols) / cols * 360,
                lat: getLatFromRow(nextY),
                vx: nvx, vy: nvy
            });
        }
    }

    // Save ECC Lines
    for(const agent of eccAgents) {
        if (agentPoints[agent.id].length > 5) {
            finishedLines.push({ points: agentPoints[agent.id], strength: agent.strength, type: 'main' });
        }
    }

    // --- PASS 2: Equatorial Current (EC) ---
    // Flows East -> West (-U)
    // Starts from Impact Points of ECC.
    // Splits North/South.
    
    let ecAgents: Agent[] = [];
    nextAgentId = 0; // Reset ID for new array mapping

    for (const ip of impactPoints) {
        // Spawn North Branch
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x,
            y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5, // Start Westward
            vy: -phys.oceanEcPolewardDrift, // Initial kick North (-Y)
            strength: 2.0,
            age: 0,
            type: 'EC_N'
        });
        
        // Spawn South Branch
        ecAgents.push({
            id: nextAgentId++,
            active: true,
            x: ip.x,
            y: ip.y,
            vx: -phys.oceanBaseSpeed * 0.5, // Start Westward
            vy: phys.oceanEcPolewardDrift, // Initial kick South (+Y)
            strength: 2.0,
            age: 0,
            type: 'EC_S'
        });
    }

    // Calculate separation distance based on oceanEcLatGap
    const ecSeparation = phys.oceanEcLatGap;

    // Collect secondary impact points (for visualization or future steps)
    const ecImpactPoints: ImpactPoint[] = [];

    let ecPoints: StreamlinePoint[][] = ecAgents.map(a => [{
        x: a.x, y: a.y,
        lon: -180 + (a.x % cols) / cols * 360,
        lat: getLatFromRow(a.y),
        vx: a.vx, vy: a.vy
    }]);

    for (let step = 0; step < MAX_STEPS; step++) {
        const activeAgents = ecAgents.filter(a => a.active);
        if (activeAgents.length === 0) break;

        for (const agent of activeAgents) {
            agent.age++;
            const { dist, gx, gy } = getEnvironment(agent.x, agent.y);

            // 1. Westward Drive
            let baseAx = -phys.oceanBaseSpeed * 0.05;

            // 2. Attraction to Separated Latitude with PD Control + Arrival Squeezing
            // Target is ITCZ +/- gap
            const lonIdx = Math.floor(((agent.x % cols) + cols) % cols);
            const baseItczLat = itcz[lonIdx];
            
            let targetLat = baseItczLat;
            if (agent.type === 'EC_N') targetLat += ecSeparation; // North
            else targetLat -= ecSeparation; // South
            
            const targetY = getRowFromLat(targetLat);
            const errorY = targetY - agent.y; // Vector pointing to target
            
            // PD Controller with Critical Damping approximation near target
            // c_crit = 2 * sqrt(m * k) where m=1
            // We aim for critical damping near the target to prevent oscillation and "squeeze" the line flat.
            const k = phys.oceanEcPatternForce;
            const criticalDamping = 2.0 * Math.sqrt(k);

            let currentDamping = phys.oceanEcDamping;
            
            // "Squeeze" Logic: Ramp up damping when close to target (within ~3 degrees)
            // Blend from user-set damping to Critical Damping (or slightly over-damped) to kill lateral momentum
            if (Math.abs(errorY) < 3.0) { 
                 const factor = (3.0 - Math.abs(errorY)) / 3.0; // 0.0 (far) to 1.0 (at target)
                 // Use a blended damping that approaches a higher value at the target
                 const targetDamping = Math.max(currentDamping, criticalDamping * 1.5);
                 currentDamping = currentDamping * (1 - factor) + targetDamping * factor;
            }

            const pTerm = errorY * k;
            const dTerm = -agent.vy * currentDamping;
            
            const ayControl = pTerm + dTerm;

            // Coastal Crawl Logic
            // If deep along the coast, slow down Westward drift to allow "crawling" up/down
            const currentLat = getLatFromRow(agent.y);
            const latDiff = Math.abs(currentLat - targetLat);
            
            if (dist > -1500 && latDiff > 2.5) {
                 baseAx *= 0.1; // Reduce Westward driving force significantly
                 // We rely on the PD controller to drive the N/S motion.
            }

            let nvx = agent.vx + baseAx;
            let nvy = agent.vy + ayControl;

            // 3. Wall Sliding
            if (dist > SHELF_DEPTH) {
                const len = Math.sqrt(gx*gx + gy*gy);
                if (len > 0.0001) {
                    const nx = gx / len;
                    const ny = gy / len;
                    const dot = nvx * nx + nvy * ny;
                    if (dot > 0) {
                        nvx = nvx - dot * nx;
                        nvy = nvy - dot * ny;
                        
                        if (!agent.hasTriggeredImpact) {
                             agent.hasTriggeredImpact = true;
                             ecImpactPoints.push({ x: agent.x, y: agent.y, lat: getLatFromRow(agent.y) });
                        }

                        // Light friction
                        nvx *= 0.99;
                        nvy *= 0.99;
                        
                        // If blocked Eastward, stop.
                        if (nvx > 0.1) {
                            agent.active = false;
                            continue;
                        }
                    }
                }
                
                if (dist > 10.0) {
                     agent.active = false;
                     continue;
                }
            }
            
            // Cap Speed
            const speed = Math.sqrt(nvx*nvx + nvy*nvy);
            const maxSpeed = phys.oceanBaseSpeed * 2.0;
            if (speed > maxSpeed) {
                nvx = (nvx / speed) * maxSpeed;
                nvy = (nvy / speed) * maxSpeed;
            }
            if (speed < 0.001) {
                agent.active = false;
                continue;
            }

            agent.vx = nvx;
            agent.vy = nvy;
            
            const nextX = agent.x + agent.vx * DT;
            const nextY = agent.y + agent.vy * DT;
            
            // Boundary Check
            const nextLat = getLatFromRow(nextY);
            if (Math.abs(nextLat) > 85) { agent.active = false; continue; }

            agent.x = nextX;
            agent.y = nextY;
            
            ecPoints[agent.id].push({
                x: nextX, y: nextY,
                lon: -180 + (nextX % cols) / cols * 360,
                lat: getLatFromRow(nextY),
                vx: nvx, vy: nvy
            });
        }
    }

    // Save EC Lines
    for(const agent of ecAgents) {
        if (ecPoints[agent.id].length > 5) {
            finishedLines.push({ points: ecPoints[agent.id], strength: agent.strength, type: agent.type === 'EC_N' ? 'split_n' : 'split_s' });
        }
    }

    streamlinesByMonth[m] = finishedLines;
  }
  
  // Fill other months
  for(let m=0; m<12; m++) {
      if (m!==0 && m!==6) streamlinesByMonth[m] = [];
  }

  return streamlinesByMonth;
};
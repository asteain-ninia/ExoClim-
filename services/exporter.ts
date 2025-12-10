import JSZip from 'jszip';
import * as d3 from 'd3';
import { SimulationResult, PlanetParams, AtmosphereParams, SimulationConfig, GridCell, PhysicsParams } from '../types';
import { KOPPEN_COLORS, CURRENT_COLORS } from '../constants';
import { hexToRgb, d3ColorToRgb } from './utils/helpers';

// Draw Legend onto Canvas
const drawLegend = (ctx: CanvasRenderingContext2D, mode: string, width: number, height: number) => {
    const padding = 10;
    const boxWidth = 260; 
    
    const x = width - boxWidth - padding;
    const y = padding;

    // Background
    ctx.fillStyle = 'rgba(17, 24, 39, 0.95)'; // Darker opaque
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.5)';
    ctx.lineWidth = 1;
    
    const drawBox = (h: number) => {
        ctx.fillRect(x, y, boxWidth, h);
        ctx.strokeRect(x, y, boxWidth, h);
    };

    const drawTitle = (title: string) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(title, x + 10, y + 20);
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 28);
        ctx.lineTo(x + boxWidth - 10, y + 28);
        ctx.strokeStyle = '#4b5563';
        ctx.stroke();
    };

    const drawGradient = (colors: string[], labels: string[], topOffset: number, customH?: number) => {
        const gradX = x + 10;
        const gradY = y + topOffset;
        const gradW = boxWidth - 20;
        const gradH = customH || 15;

        const grad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
        colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
        
        ctx.fillStyle = grad;
        ctx.fillRect(gradX, gradY, gradW, gradH);
        ctx.strokeStyle = '#6b7280';
        ctx.strokeRect(gradX, gradY, gradW, gradH);

        if (labels.length > 0) {
            ctx.fillStyle = '#d1d5db';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            
            labels.forEach((l, i) => {
                const lx = gradX + (gradW / (labels.length - 1)) * i;
                // Adjust first and last to stay in bounds
                let alignX = lx;
                if (i === 0) { ctx.textAlign = 'left'; alignX = gradX; }
                else if (i === labels.length - 1) { ctx.textAlign = 'right'; alignX = gradX + gradW; }
                else ctx.textAlign = 'center';
                
                ctx.fillText(l, alignX, gradY + gradH + 13);
            });
            ctx.textAlign = 'left'; // Reset
        }
    };

    if (mode === 'distCoast') {
        drawBox(100);
        drawTitle('内陸度 / 海洋深度 (km)');
        
        ctx.fillStyle = '#9ca3af'; ctx.font = '9px sans-serif';
        ctx.fillText('Land: Coast -> Inland', x + 10, y + 40);
        drawGradient(['#74c476', '#00441b'], ['0 km', '', '2000 km+'], 42, 10);

        ctx.fillStyle = '#9ca3af'; ctx.font = '9px sans-serif';
        ctx.fillText('Ocean: Coast -> Deep', x + 10, y + 68);
        drawGradient(['#6baed6', '#08306b'], ['0 km', '', '3000 km+'], 70, 10);

    } else if (mode === 'elevation' || mode === 'itcz_result' || mode === 'oceanCurrent') {
        drawBox(120);
        const labels: Record<string, string> = {
            'elevation': '標高 (Elevation)',
            'itcz_result': 'ITCZ 計算結果',
            'oceanCurrent': '海流 (Ocean Current)'
        };
        drawTitle(labels[mode]);
        
        let curY = y + 40;
        // Simple scale
        const colors = ["#663301", "#995a32", "#cc9a45", "#c7db7a", "#7fb86e", "#7fcdbb", "#081d58"];
        const w = (boxWidth - 20) / colors.length;
        
        colors.forEach((c, i) => {
             ctx.fillStyle = c;
             ctx.fillRect(x + 10 + i*w, curY, w, 15);
        });
        
        ctx.fillStyle = '#d1d5db';
        ctx.font = '10px monospace';
        ctx.fillText('High', x + 10, curY + 28);
        ctx.textAlign = 'right';
        ctx.fillText('Deep', x + boxWidth - 10, curY + 28);
        ctx.textAlign = 'left';

        if (mode === 'itcz_result') {
            curY += 35;
            const drawLineLegend = (color: string, label: string) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 10, curY + 5);
                ctx.lineTo(x + 40, curY + 5);
                ctx.stroke();
                ctx.fillStyle = '#d1d5db';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(label, x + 50, curY + 9);
                curY += 20;
            };
            drawLineLegend('#FFFF00', 'Annual Mean');
            drawLineLegend('rgba(255, 100, 100, 0.8)', 'July (Summer N)');
            drawLineLegend('rgba(100, 100, 255, 0.8)', 'Jan (Summer S)');
        }
        else if (mode === 'oceanCurrent') {
             curY += 35;
             const drawLineLegend = (color: string, label: string) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 10, curY + 5);
                ctx.lineTo(x + 40, curY + 5);
                ctx.stroke();
                ctx.fillStyle = '#d1d5db';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(label, x + 50, curY + 9);
                curY += 20;
             };
             
             drawLineLegend('rgba(0,0,0,0.8)', 'Ocean Current');
             drawLineLegend('rgba(0, 255, 255, 0.8)', 'EC Attractor');
        }

    } else if (mode === 'itcz_heatmap') {
        drawBox(90);
        drawTitle('ITCZ 影響度 (HeatMap)');
        // RdBu inverted
        drawGradient(['#2166ac', '#f7f7f7', '#b2182b'], ['Ocean (-1)', '0', 'Inland (+1)'], 40, 15);
    }
    
    // Add Metadata Footer
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, height - 20, width, 20);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Generated by ExoClim Simulator', width - 10, height - 6);
};

// Generate Image Blob for a specific map mode
const generateMapBlob = async (data: SimulationResult, mode: string, width: number, height: number, phys?: PhysicsParams): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Draw Map Pixels
    const lats = new Set(data.grid.map(c => c.lat));
    const gridRows = lats.size;
    const gridCols = data.grid.length / gridRows;

    const imgData = ctx.createImageData(gridCols, gridRows);
    const pixels = imgData.data;

    // Scales
    const oceanColor = d3.scaleLinear<string>()
        .domain([-8000, -4000, -200, 0])
        .range(["#081d58", "#1d91c0", "#41b6c4", "#7fcdbb"])
        .clamp(true);
    
    const oceanBrightGradient = d3.scaleLinear<string>()
        .domain([-8000, -200, 0])
        .range(["#0066ff", "#00ccff", "#e0ffff"]) 
        .clamp(true);

    const landGradient = d3.scaleLinear<string>().domain([0, 200, 500, 1000, 2000]).range(["#7fb86e", "#c7db7a", "#cc9a45", "#995a32", "#663301"]).clamp(true);

    const coastScaleLand = d3.scaleLinear<string>()
        .domain([0, 2000])
        .range(["#74c476", "#00441b"]) 
        .clamp(true);
    
    const coastScaleOcean = d3.scaleLinear<string>()
        .domain([0, -3000])
        .range(["#6baed6", "#08306b"])
        .clamp(true);

    for (let i = 0; i < data.grid.length; i++) {
        const cell = data.grid[i];
        let r=0, g=0, b=0;

        if (mode === 'distCoast') {
             if (cell.distCoast >= 0) {
                 [r,g,b] = d3ColorToRgb(coastScaleLand(cell.distCoast));
             } else {
                 [r,g,b] = d3ColorToRgb(coastScaleOcean(cell.distCoast));
             }
        } else if (mode === 'elevation' || mode === 'itcz_result' || mode === 'oceanCurrent') {
            if (!cell.isLand) {
                let cStr = oceanColor(cell.elevation);
                if (mode === 'oceanCurrent') cStr = oceanBrightGradient(cell.elevation);
                [r,g,b] = d3ColorToRgb(cStr);
            } else {
                [r,g,b] = d3ColorToRgb(landGradient(cell.elevation));
            }
            
            if (mode === 'itcz_result' || (mode === 'oceanCurrent' && cell.isLand)) {
                r *= 0.5; g *= 0.5; b *= 0.5;
            }
        } else if (mode === 'itcz_heatmap') {
             const t = (cell.heatMapVal * -1 + 1) / 2;
             [r,g,b] = d3ColorToRgb(d3.interpolateRdBu(t));
        }

        const pIdx = i * 4;
        pixels[pIdx] = r; pixels[pIdx+1] = g; pixels[pIdx+2] = b; pixels[pIdx+3] = 255;
    }
    
    const buffer = document.createElement('canvas');
    buffer.width = gridCols;
    buffer.height = gridRows;
    buffer.getContext('2d')?.putImageData(imgData, 0, 0);

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, width, height);

    const getX = (gridX: number) => (gridX / gridCols) * width;
    const getY = (lat: number) => (90 - lat) / 180 * height;

    // 2. Draw Vectors / Lines
    if (mode === 'itcz_result' && data.itczLines && data.itczLines.length > 0) {
        
        const drawLine = (lineIndex: number | 'annual', color: string) => {
             ctx.strokeStyle = color;
             ctx.lineWidth = 3;
             ctx.lineCap = 'round';
             ctx.shadowColor = 'rgba(0,0,0,0.8)';
             ctx.shadowBlur = 4;
             ctx.beginPath();

             let lineData: number[] = [];
             if (lineIndex === 'annual') {
                  lineData = new Array(gridCols).fill(0);
                  for(let c=0; c<gridCols; c++) {
                      let sum = 0;
                      for(let m=0; m<12; m++) sum += data.itczLines[m][c];
                      lineData[c] = sum / 12;
                  }
             } else {
                  lineData = data.itczLines[lineIndex];
             }

             ctx.moveTo(getX(0), getY(lineData[0]));
             for(let c=1; c<gridCols; c++) {
                 ctx.lineTo(getX(c), getY(lineData[c]));
             }
             ctx.stroke();
             ctx.shadowBlur = 0;
        };

        drawLine(0, 'rgba(100, 100, 255, 0.8)');
        drawLine(6, 'rgba(255, 100, 100, 0.8)');
        drawLine('annual', '#FFFF00');
    } 
    else if (mode === 'oceanCurrent' && data.oceanStreamlines) {
         // Draw EC Lines if Physics Params available
         if (phys && data.itczLines && data.itczLines[6]) {
            const itcz = data.itczLines[6]; // Use July base
            const deflect = phys.oceanDeflectLat;
            const separation = deflect / 2.0;

            const drawAuxLine = (offset: number, color: string, dash: number[]) => {
                 ctx.strokeStyle = color;
                 ctx.lineWidth = 2;
                 ctx.setLineDash(dash);
                 ctx.beginPath();
                 for(let c=0; c<gridCols; c++) {
                     const y = getY(Math.max(-90, Math.min(90, itcz[c] + offset)));
                     const x = getX(c);
                     if (c===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                 }
                 ctx.stroke();
                 ctx.setLineDash([]);
            };

            // EC Centerlines (Brighter Cyan and distinct dash)
            drawAuxLine(separation, "rgba(0, 255, 255, 0.8)", [4, 4]);
            drawAuxLine(-separation, "rgba(0, 255, 255, 0.8)", [4, 4]);

            // ITCZ
            drawAuxLine(0, "rgba(255, 255, 255, 0.8)", [8, 4]);
         }

         const lines = data.oceanStreamlines[6] || [];
         ctx.strokeStyle = "rgba(0,0,0,0.8)";
         
         for (const line of lines) {
             const strength = line.strength || 1.0;
             ctx.lineWidth = Math.max(1.0, strength * 2.0);
             ctx.beginPath();
             const pts = line.points;
             for(let i=0; i<pts.length; i++) {
                 if (i===0) ctx.moveTo(getX(pts[i].x), getY(pts[i].lat));
                 else {
                     // Check wrap
                     if (Math.abs(getX(pts[i].x) - getX(pts[i-1].x)) > width/2) {
                         ctx.stroke(); ctx.beginPath(); ctx.moveTo(getX(pts[i].x), getY(pts[i].lat));
                     } else {
                         ctx.lineTo(getX(pts[i].x), getY(pts[i].lat));
                     }
                 }
             }
             ctx.stroke();
         }
    }

    // 3. Draw Legend
    drawLegend(ctx, mode, width, height);

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
};

export const exportAllData = async (
    planet: PlanetParams, 
    atm: AtmosphereParams,
    phys: PhysicsParams,
    config: SimulationConfig, 
    result: SimulationResult,
    chartContainerId: string
) => {
    const zip = new JSZip();

    // 1. Config & Metadata
    const metaData = {
        planet,
        atmosphere: atm,
        physics: phys,
        config,
        stats: {
            globalTemp: "Not Calculated",
            hadleyWidth: "Not Calculated"
        }
    };
    zip.file("config.json", JSON.stringify(metaData, null, 2));
    
    // 2. CSV - Basic Grid Data (Limited to valid fields)
    const csvRows = [];
    csvRows.push("lat,lon,elevation,isLand,dist_coast_km,itcz_heatmap");
    
    for(let i=0; i<result.grid.length; i++) {
        const c = result.grid[i];
        csvRows.push(`${c.lat},${c.lon},${c.elevation.toFixed(1)},${c.isLand?1:0},${c.distCoast.toFixed(1)},${c.heatMapVal.toFixed(3)}`);
    }
    zip.file("grid_geography.csv", csvRows.join("\n"));

    // 3. ITCZ Lines CSV
    if (result.itczLines && result.itczLines.length > 0) {
        const itczRows = [];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        itczRows.push(`lon_idx,lon_deg,${months.join(",")}`);
        
        const lats = new Set(result.grid.map(c => c.lat));
        const gridRows = lats.size;
        const gridCols = result.grid.length / gridRows;

        for(let c=0; c<gridCols; c++) {
            const lon = -180 + (c / gridCols) * 360;
            const rowVals = [c, lon.toFixed(1)];
            for(let m=0; m<12; m++) {
                rowVals.push(result.itczLines[m][c].toFixed(2));
            }
            itczRows.push(rowVals.join(","));
        }
        zip.file("itcz_lines.csv", itczRows.join("\n"));
    }

    // 4. Ocean Currents JSON
    if (result.oceanStreamlines) {
         zip.file("ocean_streamlines.json", JSON.stringify(result.oceanStreamlines, null, 2));
    }

    // 5. Map Images
    const modes = ['elevation', 'distCoast', 'itcz_heatmap', 'itcz_result', 'oceanCurrent'];
    const w = 2000;
    const h = 1000;
    
    for (const m of modes) {
        const blob = await generateMapBlob(result, m, w, h, phys);
        if (blob) {
            zip.file(`map_${m}.png`, blob);
        }
    }

    // 6. Download
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `exoclim_export_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
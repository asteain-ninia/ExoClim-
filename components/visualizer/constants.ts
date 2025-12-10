
import * as d3 from 'd3';
import { KOPPEN_COLORS, CURRENT_COLORS } from '../../constants';

// Scales
export const tempScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([313, 233]);
export const precipScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 3000]); 
export const precipScaleMonthly = d3.scaleSequential(d3.interpolateBlues).domain([0, 400]); 
export const insolationScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 500]); 

export const coastScaleLand = d3.scaleLinear<string>()
    .domain([0, 2000])
    .range(["#74c476", "#00441b"]) 
    .clamp(true);

export const coastScaleOcean = d3.scaleLinear<string>()
    .domain([0, -3000])
    .range(["#6baed6", "#08306b"])
    .clamp(true);

export const hadleyScale = d3.scaleDiverging(d3.interpolateBrBG).domain([-2.5, 0, 2.5]);

export const heatMapScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-1.0, 0, 1.0]);

export const oceanGradient = d3.scaleLinear<string>()
    .domain([-8000, -4000, -200, 0])
    .range(["#081d58", "#1d91c0", "#41b6c4", "#7fcdbb"])
    .clamp(true);

export const oceanBrightGradient = d3.scaleLinear<string>()
    .domain([-8000, -200, 0])
    .range(["#003399", "#0066cc", "#aaccff"])
    .clamp(true);

export const OCEAN_DISCRETE_COLORS = {
    SHELF: "#7fcdbb",
    DEEP: "#1d91c0",
    ABYSS: "#081d58"
};

export const ELEVATION_STOPS = [0, 200, 500, 1000, 2000];
export const ELEVATION_COLORS = ["#7fb86e", "#c7db7a", "#cc9a45", "#995a32", "#663301"];

export const landGradient = d3.scaleLinear<string>()
    .domain(ELEVATION_STOPS)
    .range(ELEVATION_COLORS)
    .clamp(true);

export { KOPPEN_COLORS, CURRENT_COLORS };

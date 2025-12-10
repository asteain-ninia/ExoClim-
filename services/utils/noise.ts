
export const hash33 = (x: number, y: number, z: number, seed: number) => {
    let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed) * 43758.5453123;
    return n - Math.floor(n);
};

export const noise3D = (x: number, y: number, z: number, seed: number) => {
    const ix = Math.floor(x); const iy = Math.floor(y); const iz = Math.floor(z);
    const fx = x - ix; const fy = y - iy; const fz = z - iz;
    const u = fx*fx*(3-2*fx);
    const v = fy*fy*(3-2*fy);
    const w = fz*fz*(3-2*fz);
    const s = seed;
    const n000 = hash33(ix, iy, iz, s);
    const n100 = hash33(ix+1, iy, iz, s);
    const n010 = hash33(ix, iy+1, iz, s);
    const n110 = hash33(ix+1, iy+1, iz, s);
    const n001 = hash33(ix, iy, iz+1, s);
    const n101 = hash33(ix+1, iy, iz+1, s);
    const n011 = hash33(ix, iy+1, iz+1, s);
    const n111 = hash33(ix+1, iy+1, iz+1, s);
    const r1 = n000*(1-u) + n100*u;
    const r2 = n010*(1-u) + n110*u;
    const r3 = n001*(1-u) + n101*u;
    const r4 = n011*(1-u) + n111*u;
    const r5 = r1*(1-v) + r2*v;
    const r6 = r3*(1-v) + r4*v;
    return r5*(1-w) + r6*w;
};

export const fbmSphere = (nx: number, ny: number, nz: number, octaves: number, seed: number) => {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0; 
    let norm = 0;
    const baseScale = 2.0; 

    for(let i=0; i<octaves; i++) {
        val += amp * noise3D(nx * freq * baseScale, ny * freq * baseScale, nz * freq * baseScale, seed);
        norm += amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    return val / norm; 
};

export const ridgeSphere = (nx: number, ny: number, nz: number, octaves: number, seed: number) => {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0;
    let prev = 1.0;
    let norm = 0;
    const baseScale = 2.0;

    for(let i=0; i<octaves; i++) {
        let n = noise3D(nx * freq * baseScale, ny * freq * baseScale, nz * freq * baseScale, seed + i*13.0);
        n = 1.0 - Math.abs(2.0 * n - 1.0); 
        n = Math.pow(n, 2); 
        val += n * amp * prev;
        norm += amp;
        prev = n; 
        freq *= 2.0;
        amp *= 0.5;
    }
    return val / norm; 
};

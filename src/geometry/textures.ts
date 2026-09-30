import * as THREE from "three";

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size: number, color = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

let wood: THREE.CanvasTexture | null = null;
let leather: THREE.CanvasTexture | null = null;
let fabric: THREE.CanvasTexture | null = null;
let shadow: THREE.CanvasTexture | null = null;

// Better pseudo-random noise for textures
function hash(x: number, y: number): number {
  return (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x, y);
    x *= 2.0;
    y *= 2.0;
    a *= 0.5;
  }
  return v;
}

export function woodMap(): THREE.CanvasTexture {
  wood ??= canvasTexture((ctx, s) => {
    const imgData = ctx.createImageData(s, s);
    const data = imgData.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // Stretched noise for wood grain
        const nx = x * 0.05;
        const ny = y * 0.005;
        let n = fbm(nx, ny, 3);
        // Add rings/lines
        n = Math.sin(n * 25.0) * 0.5 + 0.5;
        // High frequency noise for micro detail
        const micro = hash(x, y) * 0.1;
        const val = 0.6 + 0.4 * n + micro;
        
        const i = (y * s + x) * 4;
        const color = Math.floor(val * 255);
        data[i] = color;
        data[i + 1] = color;
        data[i + 2] = color;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, 512, false);
  return wood;
}

export function leatherBump(): THREE.CanvasTexture {
  leather ??= canvasTexture((ctx, s) => {
    const imgData = ctx.createImageData(s, s);
    const data = imgData.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // Cellular/Voronoi like approach by combining multiple noises
        let n1 = noise(x * 0.08, y * 0.08);
        let n2 = noise(x * 0.16 + 10, y * 0.16 + 10);
        let n = (n1 * 0.7 + n2 * 0.3);
        // Make it look like cracks/creases
        n = Math.abs(n - 0.5) * 2.0;
        n = 1.0 - n; // cells are high, cracks are low
        n = Math.pow(n, 2.0);
        // Add fine noise
        n += hash(x, y) * 0.1;
        
        const val = Math.floor(n * 255);
        const i = (y * s + x) * 4;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, 256, false);
  return leather;
}

export function fabricBump(): THREE.CanvasTexture {
  fabric ??= canvasTexture((ctx, s) => {
    const imgData = ctx.createImageData(s, s);
    const data = imgData.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // Very high frequency noise for fabric weave/flock
        let n = hash(x * 0.5, y * 0.5);
        // Add horizontal and vertical weave pattern
        n += Math.sin(x * Math.PI) * 0.2;
        n += Math.sin(y * Math.PI) * 0.2;
        
        const val = Math.floor((n * 0.3 + 0.5) * 255);
        const i = (y * s + x) * 4;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, 256, false);
  return fabric;
}

export function groundShadow(): THREE.CanvasTexture {
  shadow ??= canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s * 0.48);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 256, false);
  return shadow;
}

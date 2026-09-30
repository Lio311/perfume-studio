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
let shadow: THREE.CanvasTexture | null = null;

export function woodMap(): THREE.CanvasTexture {
  wood ??= canvasTexture((ctx, s) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = (i / 90) * s + Math.sin(i) * 2;
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 + (i % 4) * 0.08})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
      ctx.stroke();
    }
  }, 256, true);
  return wood;
}

export function leatherBump(): THREE.CanvasTexture {
  leather ??= canvasTexture((ctx, s) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const g = 90 + Math.random() * 50;
      ctx.fillStyle = `rgba(${g}, ${g}, ${g}, 0.45)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + Math.random() * 5, 1.2 + Math.random() * 2, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  }, 256, false);
  return leather;
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

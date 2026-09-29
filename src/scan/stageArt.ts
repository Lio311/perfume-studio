export function drawStage(canvas: HTMLCanvasElement, scene: "card" | "close" | "ok" | "far" | "held" | "review" | "result") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = "#241f1a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#3a332b";
  ctx.fillRect(0, height * 0.72, width, height);
  const card = cardBox(scene, width, height);
  ctx.save();
  ctx.translate(card.x, card.y);
  ctx.rotate(card.tilt);
  roundRect(ctx, -card.w / 2, -card.h / 2, card.w, card.h, 10);
  ctx.fillStyle = "#f4efe4";
  ctx.fill();
  ctx.strokeStyle = "#d6b26a";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#1a1408";
  ctx.font = "600 18px Heebo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CARD", 0, 6);
  ctx.restore();
  if (scene !== "card") {
    const bottleX = width * 0.68;
    const bottleY = height * 0.48;
    ctx.fillStyle = "rgba(196, 214, 206, 0.85)";
    ctx.beginPath();
    ctx.ellipse(bottleX, bottleY, 36, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4a15a";
    ctx.fillRect(bottleX - 22, bottleY - 118, 44, 28);
  }
}

function cardBox(scene: string, width: number, height: number) {
  if (scene === "close") return { x: width * 0.42, y: height * 0.5, w: width * 0.7, h: width * 0.44, tilt: -0.08 };
  if (scene === "far") return { x: width * 0.4, y: height * 0.46, w: width * 0.28, h: width * 0.18, tilt: 0.12 };
  if (scene === "held") return { x: width * 0.4, y: height * 0.48, w: width * 0.42, h: width * 0.26, tilt: 0.04 };
  return { x: width * 0.38, y: height * 0.5, w: width * 0.46, h: width * 0.29, tilt: -0.05 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

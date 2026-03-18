import type { PlayerState, ChatBubble } from "../types";
import type { GameMap, FurnitureObject } from "./tileMap";
import { drawCharacter, isSpriteLoaded } from "./sprites";

export interface RenderPlayer extends PlayerState {
  renderX: number;
  renderY: number;
  walking: boolean;
}

// ─── Tileset ──────────────────────────────────────────────────
let tilesetImg: HTMLImageElement | null = null;
let tilesetCols = 16;

export function loadTileset(src: string, columns: number): Promise<void> {
  tilesetCols = columns;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { tilesetImg = img; resolve(); };
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Furniture sprites ────────────────────────────────────────
const furnitureImages = new Map<string, HTMLImageElement>();

export function loadFurnitureSprites(basePath: string, spriteKeys: string[]): Promise<void> {
  const unique = [...new Set(spriteKeys)];
  const promises = unique.map((key) => {
    // Map sprite keys to file paths
    const path = getSpriteFile(basePath, key);
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { furnitureImages.set(key, img); resolve(); };
      img.onerror = () => resolve(); // skip missing
      img.src = path;
    });
  });
  return Promise.all(promises).then(() => {});
}

function getSpriteFile(basePath: string, key: string): string {
  // Map keys like "DESK_FRONT" -> "/sprites/arcade/furniture/DESK/DESK_FRONT.png"
  const parts = key.split("_");
  // Special cases for multi-word furniture names
  const nameMap: Record<string, string> = {
    DESK_FRONT: "DESK/DESK_FRONT",
    DESK_SIDE: "DESK/DESK_SIDE",
    PC_FRONT: "PC/PC_FRONT_ON_1",
    CHAIR_FRONT: "CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT",
    CHAIR_BACK: "CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK",
    PLANT: "PLANT/PLANT",
    CACTUS: "CACTUS/CACTUS",
    BOOKSHELF: "BOOKSHELF/BOOKSHELF",
    WHITEBOARD: "WHITEBOARD/WHITEBOARD",
    SOFA_FRONT: "SOFA/SOFA_FRONT",
    SMALL_TABLE: "SMALL_TABLE/SMALL_TABLE_FRONT",
    CLOCK: "CLOCK/CLOCK",
    BIN: "BIN/BIN",
    COFFEE: "COFFEE/COFFEE",
  };
  const mapped = nameMap[key];
  if (mapped) return `${basePath}/furniture/${mapped}.png`;
  return `${basePath}/furniture/${parts[0]}/${key}.png`;
}

// ─── Pre-rendered ground cache ────────────────────────────────
let groundCache: HTMLCanvasElement | null = null;

export function buildLayerCaches(map: GameMap): void {
  const ts = map.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = map.width * ts;
  canvas.height = map.height * ts;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (!tilesetImg) { groundCache = canvas; return; }

  for (let i = 0; i < map.layers.ground.length; i++) {
    const gid = map.layers.ground[i];
    if (gid === 0) continue;

    const sx = (gid % tilesetCols) * ts;
    const sy = Math.floor(gid / tilesetCols) * ts;
    const dx = (i % map.width) * ts;
    const dy = Math.floor(i / map.width) * ts;

    ctx.drawImage(tilesetImg, sx, sy, ts, ts, dx, dy, ts, ts);
  }

  groundCache = canvas;
}

// ─── Canvas sizing ────────────────────────────────────────────
export function resizeCanvas(canvas: HTMLCanvasElement, map: GameMap): void {
  const w = map.width * map.tileSize;
  const h = map.height * map.tileSize;
  canvas.width = w;
  canvas.height = h;

  const scaleX = window.innerWidth / w;
  const scaleY = window.innerHeight / h;
  const scale = Math.min(scaleX, scaleY);

  canvas.style.width = `${Math.floor(w * scale)}px`;
  canvas.style.height = `${Math.floor(h * scale)}px`;
}

// ─── Main render ──────────────────────────────────────────────
export function render(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  players: RenderPlayer[],
  bubbles: ChatBubble[],
  localPlayerId: string,
): void {
  const ts = map.tileSize;
  const w = map.width * ts;
  const h = map.height * ts;

  ctx.clearRect(0, 0, w, h);

  // Layer 1: Ground tiles
  if (groundCache) {
    ctx.drawImage(groundCache, 0, 0);
  }

  // Layer 2+3: Furniture + Players, Z-sorted by sortY
  interface Renderable {
    sortY: number;
    draw: () => void;
  }

  const renderables: Renderable[] = [];

  for (const f of map.furniture) {
    const sortY = (f as FurnitureObject & { sortY?: number }).sortY ?? (f.y + f.height);
    renderables.push({
      sortY,
      draw: () => {
        const img = furnitureImages.get(f.sprite);
        if (img) {
          ctx.drawImage(img, f.x, f.y, img.width * 2, img.height * 2);
        } else {
          drawFurnitureFallback(ctx, f);
        }
      },
    });
  }

  for (const p of players) {
    renderables.push({
      sortY: p.renderY + ts,
      draw: () => renderPlayer(ctx, p, ts, localPlayerId),
    });
  }

  renderables.sort((a, b) => a.sortY - b.sortY);
  for (const r of renderables) r.draw();

  // Layer 4: Speech bubbles
  renderBubbles(ctx, players, bubbles, ts);
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  p: RenderPlayer,
  ts: number,
  localPlayerId: string,
): void {
  const px = p.renderX;
  const py = p.renderY;

  if (isSpriteLoaded()) {
    const spriteScale = 2;
    const spriteW = 16 * spriteScale;
    const spriteH = 32 * spriteScale;
    drawCharacter(
      ctx, p.sprite_id, p.dir, p.walking,
      px + (ts - spriteW) / 2,
      py - spriteH + ts,
      spriteScale,
    );
  } else {
    const isLocal = p.id === localPlayerId;
    ctx.fillStyle = isLocal ? "#c8e64a" : "#4a9eff";
    ctx.fillRect(px + 8, py + 4, 16, 24);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(p.github_login, px + ts / 2, py + ts + 10);
}

function drawFurnitureFallback(ctx: CanvasRenderingContext2D, f: FurnitureObject): void {
  // Simple colored rectangle as fallback
  if (f.sprite.includes("ARCADE")) {
    ctx.fillStyle = "#4040a0";
  } else if (f.sprite.includes("ELEV")) {
    ctx.fillStyle = "#505060";
  } else {
    ctx.fillStyle = "#6a5a3a";
  }
  ctx.fillRect(f.x + 2, f.y + 2, f.width - 4, f.height - 4);
}

function renderBubbles(
  ctx: CanvasRenderingContext2D,
  players: RenderPlayer[],
  bubbles: ChatBubble[],
  ts: number,
): void {
  const bubblesByPlayer = new Map<string, ChatBubble[]>();
  for (const bubble of bubbles) {
    const list = bubblesByPlayer.get(bubble.id) ?? [];
    list.push(bubble);
    bubblesByPlayer.set(bubble.id, list);
  }

  const BUBBLE_H = 16;
  const BUBBLE_GAP = 2;

  for (const [playerId, playerBubbles] of bubblesByPlayer) {
    const player = players.find((p) => p.id === playerId);
    if (!player) continue;

    const bx = player.renderX + ts / 2;
    const baseY = player.renderY - 20;

    for (let i = 0; i < playerBubbles.length; i++) {
      const bubble = playerBubbles[i];
      const stackOffset = (playerBubbles.length - 1 - i) * (BUBBLE_H + BUBBLE_GAP);
      const by = baseY - stackOffset;

      const alpha = bubble.timer < 1 ? bubble.timer : 1;
      ctx.globalAlpha = alpha;

      ctx.font = "8px monospace";
      const textWidth = ctx.measureText(bubble.text).width;
      const padding = 6;
      const bw = textWidth + padding * 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      roundRect(ctx, bx - bw / 2, by - BUBBLE_H, bw, BUBBLE_H, 3);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(bubble.text, bx, by - 5);

      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

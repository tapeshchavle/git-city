/**
 * Generates lobby map JSON.
 *
 * KEY INSIGHT from pixel-agents:
 * - Sprites are positioned by their TOP-LEFT at (col * tileSize, row * tileSize)
 * - Tall sprites naturally extend UPWARD from their tile position
 * - Objects ON surfaces (PC on desk) share the SAME tile row as the surface
 * - Z-sorting uses bottom edge (y + spriteHeight) for correct overlap
 *
 * Run: node scripts/generate-lobby-map.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 24;
const H = 17;
const TS = 32;

const FLOOR = 1;
const WALL = 3;
const DOOR = 4;

// ── GROUND LAYER ──
const ground = [];
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const isDoor = r === H - 1 && c >= 10 && c <= 13;
    const isWall = r === 0 || r === H - 1 || c === 0 || c === W - 1;
    if (isDoor) ground.push(DOOR);
    else if (isWall) ground.push(WALL);
    else ground.push(FLOOR);
  }
}

// ── FURNITURE ──
// Each: sprite key, tile col, tile row, footprint (tiles), collision, spriteSize (source px)
// Position = top-left of sprite at (col * TS, row * TS - (spriteHeight*2 - footprintH*TS))
// This makes the bottom of the sprite align with the bottom of the footprint
const furniture = [
  // ── Desk group 1 ──
  // Desk: source 48x32, footprint 3x2 tiles
  { sprite: "DESK_FRONT", col: 4,  row: 4, fw: 3, fh: 2, collides: true,  sw: 48, sh: 32 },
  { sprite: "DESK_FRONT", col: 7,  row: 4, fw: 3, fh: 2, collides: true,  sw: 48, sh: 32 },
  // PC: source 16x32, footprint 1x1. Placed at SAME ROW as desk.
  // onSurface: true → sortY inherits desk's sortY + 0.5 (renders IN FRONT of desk)
  { sprite: "PC_FRONT",   col: 5,  row: 4, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "PC_FRONT",   col: 8,  row: 4, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  // Chairs
  { sprite: "CHAIR_FRONT", col: 5, row: 6, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 8, row: 6, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── Desk group 2 ──
  { sprite: "DESK_FRONT", col: 12, row: 8, fw: 3, fh: 2, collides: true,  sw: 48, sh: 32 },
  { sprite: "DESK_FRONT", col: 15, row: 8, fw: 3, fh: 2, collides: true,  sw: 48, sh: 32 },
  { sprite: "PC_FRONT",   col: 13, row: 8, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "PC_FRONT",   col: 16, row: 8, fw: 1, fh: 1, collides: false, sw: 16, sh: 32, onSurface: true },
  { sprite: "CHAIR_FRONT", col: 13, row: 10, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },
  { sprite: "CHAIR_FRONT", col: 16, row: 10, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── Decorations ──
  { sprite: "BOOKSHELF",  col: 3,  row: 1, fw: 2, fh: 1, collides: true,  sw: 32, sh: 16 },
  { sprite: "BOOKSHELF",  col: 6,  row: 1, fw: 2, fh: 1, collides: true,  sw: 32, sh: 16 },
  { sprite: "PLANT",      col: 1,  row: 2, fw: 1, fh: 1, collides: true,  sw: 16, sh: 32 },
  { sprite: "CACTUS",     col: 22, row: 2, fw: 1, fh: 1, collides: true,  sw: 16, sh: 32 },
  { sprite: "PLANT",      col: 1,  row: 15, fw: 1, fh: 1, collides: true, sw: 16, sh: 32 },
  { sprite: "WHITEBOARD", col: 1,  row: 4, fw: 2, fh: 2, collides: true,  sw: 32, sh: 32 },
  { sprite: "CLOCK",      col: 22, row: 7, fw: 1, fh: 1, collides: true,  sw: 16, sh: 32 },

  // ── Sofa area ──
  { sprite: "SOFA_FRONT",  col: 20, row: 2, fw: 2, fh: 1, collides: true,  sw: 32, sh: 16 },
  { sprite: "SMALL_TABLE", col: 20, row: 3, fw: 2, fh: 2, collides: true,  sw: 32, sh: 32 },
  { sprite: "COFFEE",      col: 21, row: 3, fw: 1, fh: 1, collides: false, sw: 16, sh: 16 },

  // ── Misc ──
  { sprite: "BIN",         col: 8,  row: 15, fw: 1, fh: 1, collides: true,  sw: 16, sh: 16 },
  { sprite: "ARCADE",      col: 18, row: 12, fw: 2, fh: 1, collides: true,  sw: 0, sh: 0 },
  { sprite: "ELEVATOR",    col: 18, row: 14, fw: 2, fh: 1, collides: true,  sw: 0, sh: 0 },
];

// ── COLLISION ──
const collision = new Array(W * H).fill(0);
for (let i = 0; i < ground.length; i++) {
  if (ground[i] === WALL) collision[i] = 1;
}
for (const f of furniture) {
  if (!f.collides) continue;
  for (let r = f.row; r < f.row + f.fh; r++) {
    for (let c = f.col; c < f.col + f.fw; c++) {
      if (r >= 0 && r < H && c >= 0 && c < W) collision[r * W + c] = 1;
    }
  }
}

// ── SPAWNS ──
const spawns = [];
for (let c = 0; c < W; c++) {
  if (ground[16 * W + c] === DOOR) spawns.push({ type: "spawn", x: c, y: 16 });
}

// ── Pre-compute desk sortY per tile (like pixel-agents deskZByTile) ──
const deskSortByTile = new Map();
for (const f of furniture) {
  if (f.sprite.includes("DESK")) {
    const deskSortY = (f.row + f.fh) * TS;
    for (let r = f.row; r < f.row + f.fh; r++) {
      for (let c = f.col; c < f.col + f.fw; c++) {
        deskSortByTile.set(`${c},${r}`, deskSortY);
      }
    }
  }
}

// ── Serialize furniture ──
const furnitureOut = furniture.map((f, i) => {
  const renderH = f.sh * 2;
  const footprintBottom = (f.row + f.fh) * TS;
  let sortY = footprintBottom;

  // Surface items: inherit the desk's sortY + 0.5 so they render IN FRONT of the desk
  // Also shift Y down so the item visually overlaps with the surface
  let yOffset = 0;
  if (f.onSurface) {
    const deskZ = deskSortByTile.get(`${f.col},${f.row}`);
    if (deskZ !== undefined) {
      sortY = deskZ + 0.5;
    }
    // Move down by 1 tile so PC overlaps deeply with desk surface
    yOffset = TS;
  }

  return {
    id: `f-${i}`,
    sprite: f.sprite,
    x: f.col * TS,
    y: footprintBottom - renderH + yOffset,
    width: f.fw * TS,
    height: f.fh * TS,
    collides: f.collides,
    sortY,
  };
});

const map = {
  name: "lobby",
  width: W,
  height: H,
  tileSize: TS,
  tileset: "/sprites/arcade-tileset.png",
  tilesetColumns: 16,
  layers: { ground, collision, abovePlayer: new Array(W * H).fill(0) },
  furniture: furnitureOut,
  objects: [
    ...spawns,
    { type: "arcade", x: 18, y: 12, label: "Arcade Machine" },
    { type: "elevator", x: 18, y: 14, label: "Elevator (Coming Soon)" },
  ],
};

const outPath = join(__dirname, "..", "public", "maps", "lobby.json");
writeFileSync(outPath, JSON.stringify(map));

const blocked = collision.filter(c => c === 1).length;
console.log(`Saved: ${outPath}`);
console.log(`Map: ${W}x${H}, ${furniture.length} furniture, ${spawns.length} spawns`);
console.log(`Collision: ${blocked} blocked, ${W * H - blocked} walkable`);


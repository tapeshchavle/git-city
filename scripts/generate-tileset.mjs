/**
 * Builds a 32x32-cell tileset PNG from pixel-agents assets.
 * Each cell is 32x32px (pixel-agents 16px assets scaled 2x).
 *
 * Run: node scripts/generate-tileset.mjs
 *
 * Output: public/sprites/arcade-tileset.png
 * Also prints the tile ID map for reference when building maps.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = "/tmp/pixel-agents-assets";

const CELL = 32; // output cell size
const COLS = 16; // tileset grid columns
const SRC = 16; // source pixel size (pixel-agents)
const S = 2; // scale factor

// Tile registry: [id, name, srcImage, srcX, srcY, srcW, srcH]
// We'll build this dynamically
const tiles = [];
let nextId = 0;

function addTile(name, drawer) {
  const id = nextId++;
  tiles.push({ id, name, drawer });
  return id;
}

async function main() {
  // Load all source images
  const img = {
    floor: await loadImage(join(ASSETS, "floor_1.png")),
    floor2: await loadImage(join(ASSETS, "floor_3.png")),
    desk: await loadImage(join(ASSETS, "furniture/DESK/DESK_FRONT.png")),
    deskSide: await loadImage(join(ASSETS, "furniture/DESK/DESK_SIDE.png")),
    chair: await loadImage(join(ASSETS, "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png")),
    chairBack: await loadImage(join(ASSETS, "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png")),
    pc: await loadImage(join(ASSETS, "furniture/PC/PC_FRONT_ON_1.png")),
    plant: await loadImage(join(ASSETS, "furniture/PLANT/PLANT.png")),
    bookshelf: await loadImage(join(ASSETS, "furniture/BOOKSHELF/BOOKSHELF.png")),
    whiteboard: await loadImage(join(ASSETS, "furniture/WHITEBOARD/WHITEBOARD.png")),
    sofa: await loadImage(join(ASSETS, "furniture/SOFA/SOFA_FRONT.png")),
    cactus: await loadImage(join(ASSETS, "furniture/CACTUS/CACTUS.png")),
    clock: await loadImage(join(ASSETS, "furniture/CLOCK/CLOCK.png")),
    bin: await loadImage(join(ASSETS, "furniture/BIN/BIN.png")),
    coffee: await loadImage(join(ASSETS, "furniture/COFFEE/COFFEE.png")),
    smallTable: await loadImage(join(ASSETS, "furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png")),
  };

  // ── Define tiles ──
  // 0 = empty (transparent)
  addTile("empty", () => {});

  // 1 = floor
  addTile("floor", (ctx) => {
    ctx.drawImage(img.floor, 0, 0, SRC, SRC, 0, 0, CELL, CELL);
  });

  // 2 = floor variant
  addTile("floor_alt", (ctx) => {
    ctx.drawImage(img.floor2, 0, 0, SRC, SRC, 0, 0, CELL, CELL);
  });

  // 3 = wall
  addTile("wall", (ctx) => {
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.strokeStyle = "#1e1e30";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);
  });

  // 4 = door floor
  addTile("door", (ctx) => {
    ctx.fillStyle = "#3a3a28";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = "#4a4a38";
    ctx.fillRect(4, 4, CELL - 8, CELL - 8);
  });

  // 5-7: desk (3 tiles: left, middle, right from 48x32 source)
  // Desk source: 48x32, we need 3 columns of 16x32 -> 3 cells of 32x32 (top half is desk top)
  addTile("desk_left", (ctx) => {
    ctx.drawImage(img.desk, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("desk_mid", (ctx) => {
    ctx.drawImage(img.desk, 16, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("desk_right", (ctx) => {
    ctx.drawImage(img.desk, 32, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 8-9: desk bottom row (legs)
  addTile("desk_bl", (ctx) => {
    ctx.drawImage(img.desk, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("desk_bm", (ctx) => {
    ctx.drawImage(img.desk, 16, 16, 16, 16, 0, 0, CELL, CELL);
  });
  // 10
  addTile("desk_br", (ctx) => {
    ctx.drawImage(img.desk, 32, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 11: chair
  addTile("chair", (ctx) => {
    ctx.drawImage(img.chair, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 12-13: PC (16x32 = 1 wide, 2 tall)
  addTile("pc_top", (ctx) => {
    ctx.drawImage(img.pc, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("pc_bottom", (ctx) => {
    ctx.drawImage(img.pc, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 14-15: plant (16x32 = 1 wide, 2 tall)
  addTile("plant_top", (ctx) => {
    ctx.drawImage(img.plant, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("plant_bottom", (ctx) => {
    ctx.drawImage(img.plant, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 16-17: bookshelf (32x16 = 2 wide, 1 tall)
  addTile("bookshelf_l", (ctx) => {
    ctx.drawImage(img.bookshelf, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("bookshelf_r", (ctx) => {
    ctx.drawImage(img.bookshelf, 16, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 18-21: whiteboard (32x32 = 2x2)
  addTile("wb_tl", (ctx) => {
    ctx.drawImage(img.whiteboard, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("wb_tr", (ctx) => {
    ctx.drawImage(img.whiteboard, 16, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("wb_bl", (ctx) => {
    ctx.drawImage(img.whiteboard, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("wb_br", (ctx) => {
    ctx.drawImage(img.whiteboard, 16, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 22-23: sofa (32x16 = 2 wide)
  addTile("sofa_l", (ctx) => {
    ctx.drawImage(img.sofa, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("sofa_r", (ctx) => {
    ctx.drawImage(img.sofa, 16, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 24-25: cactus (16x32)
  addTile("cactus_top", (ctx) => {
    ctx.drawImage(img.cactus, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("cactus_bot", (ctx) => {
    ctx.drawImage(img.cactus, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 26-27: clock (16x32)
  addTile("clock_top", (ctx) => {
    ctx.drawImage(img.clock, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("clock_bot", (ctx) => {
    ctx.drawImage(img.clock, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 28: bin
  addTile("bin", (ctx) => {
    ctx.drawImage(img.bin, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 29: coffee
  addTile("coffee", (ctx) => {
    ctx.drawImage(img.coffee, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // 30-31: arcade machine (custom drawn, 2 wide)
  addTile("arcade_l", (ctx) => {
    ctx.fillStyle = "#4040a0";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = "#6060c0";
    ctx.fillRect(4, 4, CELL - 8, CELL - 12);
    ctx.fillStyle = "#80ff80";
    ctx.fillRect(8, 8, 16, 10);
  });
  addTile("arcade_r", (ctx) => {
    ctx.fillStyle = "#4040a0";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = "#303080";
    ctx.fillRect(4, 4, CELL - 8, CELL - 8);
  });

  // 32-33: elevator (2 wide)
  addTile("elev_l", (ctx) => {
    ctx.fillStyle = "#505060";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = "#606070";
    ctx.fillRect(2, 2, CELL - 4, CELL - 4);
  });
  addTile("elev_r", (ctx) => {
    ctx.fillStyle = "#505060";
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = "#606070";
    ctx.fillRect(2, 2, CELL - 4, CELL - 4);
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(CELL - 8, 4, 4, 4);
  });

  // 34-37: small table (32x32 = 2x2)
  addTile("table_tl", (ctx) => {
    ctx.drawImage(img.smallTable, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("table_tr", (ctx) => {
    ctx.drawImage(img.smallTable, 16, 0, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("table_bl", (ctx) => {
    ctx.drawImage(img.smallTable, 0, 16, 16, 16, 0, 0, CELL, CELL);
  });
  addTile("table_br", (ctx) => {
    ctx.drawImage(img.smallTable, 16, 16, 16, 16, 0, 0, CELL, CELL);
  });

  // 38: chair back
  addTile("chair_back", (ctx) => {
    ctx.drawImage(img.chairBack, 0, 0, 16, 16, 0, 0, CELL, CELL);
  });

  // ── Render tileset PNG ──
  const rows = Math.ceil(tiles.length / COLS);
  const canvas = createCanvas(COLS * CELL, rows * CELL);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  for (const tile of tiles) {
    const col = tile.id % COLS;
    const row = Math.floor(tile.id / COLS);
    ctx.save();
    ctx.translate(col * CELL, row * CELL);
    tile.drawer(ctx);
    ctx.restore();
  }

  const outPath = join(__dirname, "..", "public", "sprites", "arcade-tileset.png");
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Tileset: ${COLS * CELL}x${rows * CELL}px, ${tiles.length} tiles`);
  console.log(`Saved: ${outPath}`);
  console.log("\nTile IDs:");
  for (const t of tiles) {
    console.log(`  ${t.id}: ${t.name}`);
  }
}

main().catch(console.error);

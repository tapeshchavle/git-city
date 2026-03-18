// ─── Map loader (tiles + objects hybrid) ──────────────────────
// Tile layers: floor, walls (grid-based)
// Object layer: furniture (full sprites at pixel positions)
// Collision: flat boolean grid computed from both

export interface FurnitureObject {
  id: string;
  sprite: string;
  x: number;      // pixel position (top-left of sprite)
  y: number;
  width: number;  // footprint pixel size
  height: number;
  collides: boolean;
  sortY?: number;  // Z-sort key (bottom of footprint). If missing, uses y + height.
}

export interface MapObject {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tileset: string;
  tilesetColumns: number;
  layers: {
    ground: number[];
    collision: number[];
    abovePlayer: number[];
  };
  furniture: FurnitureObject[];
  objects: MapObject[];
}

let currentMap: GameMap | null = null;

export async function loadMap(url: string): Promise<GameMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load map: ${url}`);
  const map: GameMap = await res.json();
  currentMap = map;
  return map;
}

export function getMap(): GameMap | null {
  return currentMap;
}

export function isWalkable(x: number, y: number): boolean {
  if (!currentMap) return false;
  if (x < 0 || x >= currentMap.width || y < 0 || y >= currentMap.height) return false;
  return currentMap.layers.collision[y * currentMap.width + x] === 0;
}

export function getSpawns(): Array<{ x: number; y: number }> {
  if (!currentMap) return [{ x: 12, y: 15 }];
  return currentMap.objects
    .filter((o) => o.type === "spawn")
    .map((o) => ({ x: o.x, y: o.y }));
}

export function getRandomSpawn(): { x: number; y: number } {
  const spawns = getSpawns();
  return spawns[Math.floor(Math.random() * spawns.length)];
}

export function getCollisionData(): number[] {
  return currentMap?.layers.collision ?? [];
}

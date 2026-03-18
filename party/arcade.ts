import type { Party, Connection, ConnectionContext } from "partykit/server";

// ─── Inline shared constants (party/ can't use @/ alias) ──────
const GRID_COLS = 24;
const GRID_ROWS = 17;

type Direction = "up" | "down" | "left" | "right";

interface PlayerState {
  id: string;
  github_login: string;
  avatar_url: string;
  sprite_id: number;
  x: number;
  y: number;
  dir: Direction;
}

type ClientMsg =
  | { type: "move"; dir: Direction }
  | { type: "chat"; text: string };

type ServerMsg =
  | { type: "sync"; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "leave"; id: string }
  | { type: "move"; id: string; x: number; y: number; dir: Direction }
  | { type: "chat"; id: string; text: string };

// ─── Collision data (generated from public/maps/lobby.json) ───
// To regenerate: node scripts/generate-lobby-map.mjs then copy COLLISION array
// 0 = walkable, 1 = blocked
const COLLISION = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,1,1,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,1,1,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1];
const SPAWNS = [{ x: 10, y: 16 }, { x: 11, y: 16 }, { x: 12, y: 16 }, { x: 13, y: 16 }];

function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return false;
  return COLLISION[y * GRID_COLS + x] === 0;
}

function randomSpawn(): { x: number; y: number } {
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
}

// ─── Rate limiting ────────────────────────────────────────────
const MOVE_INTERVAL_MS = 100; // max 10 moves/sec
const CHAT_INTERVAL_MS = 1000; // max 1 chat/sec
const CHAT_MAX_LENGTH = 100;

// ─── Server ───────────────────────────────────────────────────
export default class ArcadeServer implements Party.Server {
  readonly players = new Map<string, PlayerState>();
  readonly lastMove = new Map<string, number>();
  readonly lastChat = new Map<string, number>();

  constructor(readonly room: Party.Room) {}

  // ── Auth: verify Supabase JWT before allowing connection ────
  static async onBeforeConnect(
    request: Party.Request,
    lobby: Party.Lobby,
  ) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    try {
      // Verify token by calling Supabase auth API directly
      // Works with any signing algorithm (HS256, RS256)
      const supabaseUrl = lobby.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const supabaseAnonKey = lobby.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });

      if (!userRes.ok) {
        return new Response("Invalid token", { status: 401 });
      }

      const user = (await userRes.json()) as {
        id: string;
        user_metadata?: Record<string, string>;
      };

      request.headers.set("x-user-id", user.id);
      request.headers.set(
        "x-user-meta",
        JSON.stringify(user.user_metadata ?? {}),
      );

      return request;
    } catch {
      return new Response("Auth failed", { status: 401 });
    }
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const userId = ctx.request.headers.get("x-user-id") ?? conn.id;
    const metaStr = ctx.request.headers.get("x-user-meta") ?? "{}";
    let meta: Record<string, string> = {};
    try {
      meta = JSON.parse(metaStr);
    } catch {
      /* ignore */
    }

    // Kick duplicate connection for same user
    for (const [id] of this.players) {
      if (id === userId) {
        const oldConn = [...this.room.getConnections()].find(
          (c) => (c.state as { userId?: string } | null)?.userId === userId && c !== conn,
        );
        if (oldConn) {
          oldConn.close(4000, "duplicate");
        }
        this.players.delete(id);
        break;
      }
    }

    const spawn = randomSpawn();
    const player: PlayerState = {
      id: userId,
      github_login:
        (meta.user_name as string) ??
        (meta.preferred_username as string) ??
        "anon",
      avatar_url: (meta.avatar_url as string) ?? "",
      sprite_id: Math.floor(Math.random() * 5),
      x: spawn.x,
      y: spawn.y,
      dir: "up",
    };

    conn.setState({ userId });
    this.players.set(userId, player);

    // Send full state to new player
    const syncMsg: ServerMsg = {
      type: "sync",
      players: [...this.players.values()],
    };
    conn.send(JSON.stringify(syncMsg));

    // Broadcast join to everyone else
    const joinMsg: ServerMsg = { type: "join", player };
    this.room.broadcast(JSON.stringify(joinMsg), [conn.id]);
  }

  onMessage(message: string, sender: Connection) {
    const state = sender.state as { userId?: string } | null;
    const userId = state?.userId ?? sender.id;
    const player = this.players.get(userId);
    if (!player) return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const now = Date.now();

    if (msg.type === "move") {
      const lastMoveTime = this.lastMove.get(userId) ?? 0;
      if (now - lastMoveTime < MOVE_INTERVAL_MS) return;
      this.lastMove.set(userId, now);

      const dir = msg.dir;
      if (!["up", "down", "left", "right"].includes(dir)) return;

      let nx = player.x;
      let ny = player.y;
      if (dir === "up") ny -= 1;
      else if (dir === "down") ny += 1;
      else if (dir === "left") nx -= 1;
      else if (dir === "right") nx += 1;

      if (!isWalkable(nx, ny)) {
        // Turn to face the wall but don't move
        player.dir = dir;
        const moveMsg: ServerMsg = {
          type: "move",
          id: userId,
          x: player.x,
          y: player.y,
          dir,
        };
        this.room.broadcast(JSON.stringify(moveMsg));
        return;
      }

      player.x = nx;
      player.y = ny;
      player.dir = dir;

      const moveMsg: ServerMsg = { type: "move", id: userId, x: nx, y: ny, dir };
      this.room.broadcast(JSON.stringify(moveMsg));
    }

    if (msg.type === "chat") {
      const lastChatTime = this.lastChat.get(userId) ?? 0;
      if (now - lastChatTime < CHAT_INTERVAL_MS) return;
      this.lastChat.set(userId, now);

      const text =
        typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
      if (text.length === 0) return;

      const chatMsg: ServerMsg = { type: "chat", id: userId, text };
      this.room.broadcast(JSON.stringify(chatMsg));
    }
  }

  onClose(conn: Connection) {
    const state = conn.state as { userId?: string } | null;
    const userId = state?.userId ?? conn.id;
    this.players.delete(userId);
    this.lastMove.delete(userId);
    this.lastChat.delete(userId);

    const leaveMsg: ServerMsg = { type: "leave", id: userId };
    this.room.broadcast(JSON.stringify(leaveMsg));
  }

  // ── HTTP: GET /parties/main/lobby → player count ────────────
  async onRequest(request: Party.Request) {
    if (request.method === "GET") {
      return new Response(JSON.stringify({ count: this.players.size }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  }
}

ArcadeServer satisfies Party.Worker;

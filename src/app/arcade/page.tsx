"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import type { PlayerState, ChatBubble, Direction } from "@/lib/arcade/types";
import { startGameLoop } from "@/lib/arcade/engine/gameLoop";
import { loadSpritesheet, updateSpriteAnimation } from "@/lib/arcade/engine/sprites";
import { loadMap, type GameMap } from "@/lib/arcade/engine/tileMap";
import {
  render,
  resizeCanvas,
  loadTileset,
  buildLayerCaches,
  loadFurnitureSprites,
  type RenderPlayer,
} from "@/lib/arcade/engine/renderer";
import { attachInput, updateMovement } from "@/lib/arcade/engine/input";
import {
  connect,
  sendMove,
  sendChat,
  disconnect,
} from "@/lib/arcade/network/client";
import type { ConnectionStatus } from "@/lib/arcade/network/client";

const LERP_DURATION = 0.12;
const BUBBLE_DURATION = 5;

interface InterpolatedPlayer extends PlayerState {
  prevX: number;
  prevY: number;
  lerpTimer: number;
  walking: boolean;
}

export default function ArcadePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(true);

  const playersRef = useRef<Map<string, InterpolatedPlayer>>(new Map());
  const bubblesRef = useRef<ChatBubble[]>([]);
  const localIdRef = useRef<string>("");
  const mapRef = useRef<GameMap | null>(null);

  const isTyping = useCallback(() => {
    return document.activeElement === chatInputRef.current;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanupGameLoop: (() => void) | null = null;
    let cleanupInput: (() => void) | null = null;
    let cleanupResize: (() => void) | null = null;

    async function init() {
      const supabase = createBrowserSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      const token = session.access_token;
      localIdRef.current = session.user.id;

      // 1. Load map JSON
      const map = await loadMap("/maps/lobby.json");
      mapRef.current = map;

      // 2. Load assets in parallel
      const spriteKeys = map.furniture.map((f) => f.sprite);
      await Promise.all([
        loadSpritesheet("/sprites/arcade").catch(() => {}),
        loadTileset(map.tileset, map.tilesetColumns),
        loadFurnitureSprites("/sprites/arcade", spriteKeys),
      ]);

      // 3. Pre-render static tile layers to offscreen canvases
      buildLayerCaches(map);

      // 4. Setup canvas
      resizeCanvas(canvas!, map);
      const onResize = () => resizeCanvas(canvas!, map);
      window.addEventListener("resize", onResize);
      cleanupResize = () => window.removeEventListener("resize", onResize);

      // 5. Connect to PartyKit
      connect(token, {
        onSync(players) {
          const pmap = playersRef.current;
          pmap.clear();
          for (const p of players) {
            pmap.set(p.id, {
              ...p,
              prevX: p.x,
              prevY: p.y,
              lerpTimer: LERP_DURATION,
              walking: false,
            });
          }
        },
        onJoin(player) {
          playersRef.current.set(player.id, {
            ...player,
            prevX: player.x,
            prevY: player.y,
            lerpTimer: LERP_DURATION,
            walking: false,
          });
        },
        onLeave(id) {
          playersRef.current.delete(id);
          bubblesRef.current = bubblesRef.current.filter((b) => b.id !== id);
        },
        onMove(id, x, y, dir) {
          const p = playersRef.current.get(id);
          if (!p) return;
          const t = Math.min(p.lerpTimer / LERP_DURATION, 1);
          p.prevX = p.prevX + (p.x - p.prevX) * t;
          p.prevY = p.prevY + (p.y - p.prevY) * t;
          p.x = x;
          p.y = y;
          p.dir = dir;
          p.lerpTimer = 0;
          p.walking = true;
        },
        onChat(id, text) {
          const playerBubbles = bubblesRef.current.filter((b) => b.id === id);
          if (playerBubbles.length >= 3) {
            const oldest = playerBubbles[0];
            bubblesRef.current = bubblesRef.current.filter((b) => b !== oldest);
          }
          bubblesRef.current.push({ id, text, timer: BUBBLE_DURATION });
        },
        onStatusChange(s) {
          setStatus(s);
        },
      });

      // 6. Input handler
      cleanupInput = attachInput((dir: Direction) => {
        sendMove({ type: "move", dir });
      }, isTyping);

      // 7. Game loop
      const tileSize = map.tileSize;
      cleanupGameLoop = startGameLoop(canvas!, {
        update(dt) {
          updateMovement(dt);
          updateSpriteAnimation(dt);

          for (const p of playersRef.current.values()) {
            p.lerpTimer = Math.min(p.lerpTimer + dt, LERP_DURATION);
            if (p.lerpTimer >= LERP_DURATION) {
              p.walking = false;
            }
          }
          bubblesRef.current = bubblesRef.current.filter((b) => {
            b.timer -= dt;
            return b.timer > 0;
          });
        },
        render(ctx) {
          const m = mapRef.current;
          if (!m) return;

          const renderPlayers: RenderPlayer[] = [];
          for (const p of playersRef.current.values()) {
            const t = Math.min(p.lerpTimer / LERP_DURATION, 1);
            const rx = (p.prevX + (p.x - p.prevX) * t) * tileSize;
            const ry = (p.prevY + (p.y - p.prevY) * t) * tileSize;
            renderPlayers.push({
              ...p,
              renderX: rx,
              renderY: ry,
            });
          }
          render(ctx, m, renderPlayers, bubblesRef.current, localIdRef.current);
        },
      });

      setLoading(false);
    }

    init();

    return () => {
      cleanupGameLoop?.();
      cleanupInput?.();
      cleanupResize?.();
      disconnect();
    };
  }, [router, isTyping]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    sendChat(text);
    setChatText("");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        document.activeElement !== chatInputRef.current
      ) {
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <div className="fixed inset-0 bg-[#0a0a1a] flex flex-col items-center justify-center">
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a1a]">
          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: "#c8e64a" }}>
              Entering E.Arcade...
            </p>
            <p className="mt-2 text-[10px] text-gray-500">
              {status === "connecting" ? "Connecting..." : "Loading assets..."}
            </p>
          </div>
        </div>
      )}

      {!loading && status === "reconnecting" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
          <p className="text-sm text-white">Reconnecting...</p>
        </div>
      )}

      <button
        onClick={() => router.push("/")}
        className="absolute left-4 top-4 z-30 text-[10px] text-gray-500 hover:text-white transition-colors"
      >
        ← Back to city
      </button>

      <canvas ref={canvasRef} className="block" />

      <form
        onSubmit={handleChatSubmit}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-4"
      >
        <input
          ref={chatInputRef}
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="Press Enter to chat..."
          maxLength={100}
          className="w-full rounded-none border border-gray-700 bg-black/70 px-3 py-2 text-xs text-white
            placeholder:text-gray-600 focus:border-[#c8e64a] focus:outline-none"
        />
      </form>
    </div>
  );
}

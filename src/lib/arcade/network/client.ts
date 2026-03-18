import PartySocket from "partysocket";
import type { ClientMsg, ServerMsg, PlayerState } from "../types";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

export interface ArcadeCallbacks {
  onSync: (players: PlayerState[]) => void;
  onJoin: (player: PlayerState) => void;
  onLeave: (id: string) => void;
  onMove: (id: string, x: number, y: number, dir: PlayerState["dir"]) => void;
  onChat: (id: string, text: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

let socket: PartySocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connect(token: string, callbacks: ArcadeCallbacks): void {
  if (socket) {
    socket.close();
  }

  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

  socket = new PartySocket({
    host,
    room: "lobby",
    query: { token },
  });

  callbacks.onStatusChange("connecting");

  socket.addEventListener("open", () => {
    // Clear any pending reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    callbacks.onStatusChange("connected");
  });

  socket.addEventListener("message", (event) => {
    // Any message means we're connected - clear reconnecting state
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    callbacks.onStatusChange("connected");

    let msg: ServerMsg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case "sync":
        callbacks.onSync(msg.players);
        break;
      case "join":
        callbacks.onJoin(msg.player);
        break;
      case "leave":
        callbacks.onLeave(msg.id);
        break;
      case "move":
        callbacks.onMove(msg.id, msg.x, msg.y, msg.dir);
        break;
      case "chat":
        callbacks.onChat(msg.id, msg.text);
        break;
    }
  });

  socket.addEventListener("close", (event) => {
    // Code 4000 = duplicate tab, don't reconnect
    if (event.code === 4000) {
      callbacks.onStatusChange("error");
      return;
    }

    // Only show "reconnecting" after 2s delay to avoid flashing during normal reconnects
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        callbacks.onStatusChange("reconnecting");
        reconnectTimer = null;
      }, 2000);
    }
  });

  socket.addEventListener("error", () => {
    // Don't immediately show error - PartySocket will auto-retry
  });
}

export function sendMove(dir: ClientMsg & { type: "move" }) {
  socket?.send(JSON.stringify(dir));
}

export function sendChat(text: string) {
  const msg: ClientMsg = { type: "chat", text };
  socket?.send(JSON.stringify(msg));
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

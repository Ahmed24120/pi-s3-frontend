"use client";
import { io, Socket } from "socket.io-client";

declare global {
  // eslint-disable-next-line no-var
  var __socket: Socket | undefined;
}

export function getSocket() {
  if (!globalThis.__socket) {
    globalThis.__socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001", {
      transports: ["websocket"],
    });
  }
  return globalThis.__socket;
}

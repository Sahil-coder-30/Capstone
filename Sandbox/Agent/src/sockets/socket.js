// socket.js
// Socket.IO for the editor: terminal I/O and workspace change events.
// Every socket needs the owner's token, like the REST API.

import { Server } from "socket.io";
import { allowedOrigins, requireOwnerSocket } from "../middleware/auth.middleware.js";
import { startTerminal } from "../services/terminal.service.js";
import { watchWorkspace } from "../services/workspaceWatcher.service.js";

let io = null;

/** Sends an event to every connected editor. Does nothing before attachSockets runs. */
export const emitToAll = (event, data) => io?.emit(event, data);

export function attachSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins(),
      credentials: true,
      methods: ["GET", "POST", "PATCH"],
    },
  });

  io.use(requireOwnerSocket);

  watchWorkspace((change) => io.emit("workspace-change", change));

  const ptyProcess = startTerminal((data) => io.emit("terminal-output", data));

  io.on("connection", (socket) => {
    console.log(`A user has connected ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`User disconnected : ${socket.id}`);
    });

    socket.on("terminal-input", (data) => {
      ptyProcess.write(data);
    });

    socket.on("terminal-resize", ({ cols, rows }) => {
      if (cols && rows) {
        try {
          ptyProcess.resize(cols, rows);
        } catch (err) {
          console.error("Failed to resize ptyProcess:", err);
        }
      }
    });

    socket.on("connect_error", (err) => {
      console.log(`Connection error : ${err.message}`);
    });
  });

  return io;
}

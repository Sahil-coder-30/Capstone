import http from "http";
import app from "./src/app/app.js";
import dotenv from "dotenv";
import { initSocketIO } from "./src/socket/socket.js";

dotenv.config();
const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const server = http.createServer(app);
server.timeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = REQUEST_TIMEOUT_MS + 10000;

// Initialize Socket.io
initSocketIO(server);

server.listen(PORT, () => {
  console.log(`AI Orchestration service is running on port ${PORT}`);
  console.log(`Request timeout set to ${REQUEST_TIMEOUT_MS / 1000}s`);
});

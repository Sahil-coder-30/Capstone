import http from "http";
import app from "./src/app/app.js";
import { attachSockets } from "./src/sockets/socket.js";

const PORT = process.env.PORT || 3000;

// Socket.IO (terminal, file sync) shares the HTTP server with Express.
const httpServer = http.createServer(app);
attachSockets(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Agent API is running on port ${PORT}`);
});

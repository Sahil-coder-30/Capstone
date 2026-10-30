import http from "http";
import app from "./src/app/app.js";
import dotenv from "dotenv";
import connectToDb from "./src/config/db.js";

dotenv.config();
const PORT = process.env.PORT || 3000;

// Agent runs stream over SSE and can stay open for a long time (plan review
// waits up to 30 minutes). Heartbeats keep the connection alive, so the
// socket-level timeouts are disabled instead of capping run length.
const server = http.createServer(app);
server.requestTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(PORT, () => {
  console.log(`AI Orchestration service is running on port ${PORT}`);

  // Connect to MongoDB asynchronously
  connectToDb().catch((err) => {
    console.error("Database connection failed asynchronously: ", err.message);
  });
});

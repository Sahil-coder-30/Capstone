import { io } from "socket.io-client";

console.log("Testing connection via Ingress (port 80)...");
const socket80 = io("ws://localhost", {
  path: "/api/ai/socket.io",
  transports: ["websocket"],
});

socket80.on("connect", () => {
  console.log("SUCCESS: Connected to ws://localhost/api/ai/socket.io");
  socket80.disconnect();
});

socket80.on("connect_error", (err) => {
  console.error("FAILED: ws://localhost/api/ai/socket.io connection error:", err.message);
  socket80.disconnect();
});

setTimeout(() => {
  console.log("Timeout for Ingress connection. Trying direct connection (port 3000)...");
  socket80.disconnect();
  
  const socket3000 = io("ws://localhost:3000", {
    path: "/api/ai/socket.io",
    transports: ["websocket"],
  });

  socket3000.on("connect", () => {
    console.log("SUCCESS: Connected to ws://localhost:3000/api/ai/socket.io");
    socket3000.disconnect();
  });

  socket3000.on("connect_error", (err) => {
    console.error("FAILED: ws://localhost:3000/api/ai/socket.io connection error:", err.message);
    socket3000.disconnect();
  });
}, 5000);

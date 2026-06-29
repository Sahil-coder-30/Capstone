import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import aiRouter from "../routes/ai.routes.js";

const app = express();

app.use(morgan("combined"));
app.use(cookieParser());
app.use(express.json());

// ✅ Health routes MUST be registered before the main router
// so they are matched directly and never forwarded to the agent
app.get("/api/ai/healthz", (req, res) => {
  res.status(200).json({ status: "ok", message: "AI service is healthy" });
});

app.get("/api/ai/readyz", (req, res) => {
  res.status(200).json({ status: "ok", message: "AI service is ready" });
});

app.use("/api/ai", aiRouter);

export default app;

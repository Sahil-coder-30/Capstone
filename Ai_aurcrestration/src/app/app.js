import express from "express";
import morgan from "morgan";

const app = express();

app.use(morgan("dev"));
app.use(express.json());

app.get("/api/ai/healthz", (req, res) => {
  res.status(200).json({ status: "ok", message: "AI service is healthy" });
});

app.get("/api/ai/readyz" , (req , res) => {
    res.status(200).json({ status: "ok", message: "AI service is ready" });
})

export default app;

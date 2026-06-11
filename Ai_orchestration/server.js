import app from "./src/app/app.js";
import dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AI Aurcrestration service is running on port ${PORT}`);
});

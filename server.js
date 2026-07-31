import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeHandler,
  generatePitch,
  generateBrief,
  generateNewsHooks,
} from "./api/_shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.post("/api/pitch", makeHandler(generatePitch));
app.post("/api/brief", makeHandler(generateBrief));
app.post("/api/news", makeHandler(generateNewsHooks));

const port = process.env.PORT || 3457;
app.listen(port, () => console.log(`Policy Camouflage running on http://localhost:${port}`));

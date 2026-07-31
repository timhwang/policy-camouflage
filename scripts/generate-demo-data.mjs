// Pregenerates demo content for /demo: one proposal, all four personas.
// Run: node scripts/generate-demo-data.mjs   (needs ANTHROPIC_API_KEY in .env)
// Writes demo/data.json incrementally per persona; re-running resumes,
// skipping personas already present.
import "dotenv/config";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERSONAS,
  generatePitch,
  generateBriefSection,
  generateNewsBeat,
} from "../api/_shared.js";

const PROPOSAL = "A federal tax credit for employers who offer a four-day work week";
const SECTIONS = ["summary", "problem", "solution", "recommendations"];
const BEATS = ["politics", "economy", "culture"];
const CALL_TIMEOUT_MS = 180_000;

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo");
mkdirSync(dir, { recursive: true });
const dataPath = path.join(dir, "data.json");

const withTimeout = (label, fn) =>
  Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), CALL_TIMEOUT_MS)
    ),
  ]);

const robust = async (label, fn) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await withTimeout(label, fn);
    } catch (err) {
      console.log(`  ${label} attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw new Error(`${label} failed twice`);
};

let out = { proposal: PROPOSAL, generated_at: new Date().toISOString(), personas: {} };
try {
  const existing = JSON.parse(readFileSync(dataPath, "utf8"));
  if (existing.proposal === PROPOSAL) {
    out = existing;
    console.log(`Resuming; already have: ${Object.keys(out.personas).join(", ") || "none"}`);
  }
} catch {}

for (const persona of Object.keys(PERSONAS)) {
  if (out.personas[persona]) continue;
  console.log(`Generating: ${PERSONAS[persona].label}`);
  const t0 = Date.now();
  const base = { proposal: PROPOSAL, persona };
  try {
  const [pitch, briefParts, newsParts] = await Promise.all([
    robust(`${persona}/pitch`, () => generatePitch(base)),
    Promise.all(
      SECTIONS.map((section) =>
        robust(`${persona}/${section}`, () => generateBriefSection({ ...base, section }))
      )
    ),
    Promise.all(
      BEATS.map((beat) =>
        robust(`${persona}/${beat}`, () => generateNewsBeat({ ...base, beat }))
      )
    ),
  ]);
  out.personas[persona] = {
    pitch,
    brief: Object.fromEntries(SECTIONS.map((s, i) => [s, briefParts[i]])),
    news: Object.fromEntries(BEATS.map((b, i) => [b, newsParts[i]])),
  };
  writeFileSync(dataPath, JSON.stringify(out, null, 1));
  console.log(`  done in ${Math.round((Date.now() - t0) / 1000)}s — saved`);
  } catch (err) {
    console.log(`  ${persona} FAILED (${err.message}) — continuing; rerun to retry it`);
  }
}

console.log(`Complete: ${Object.keys(out.personas).length}/4 personas in demo/data.json`);

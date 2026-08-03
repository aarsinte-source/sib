import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Carica .env.local a mano (niente dipendenza da dotenv). Non sovrascrive variabili già impostate. */
export function caricaEnv() {
  const file = path.join(RADICE, ".env.local");
  if (!existsSync(file)) return;
  for (const riga of readFileSync(file, "utf8").split("\n")) {
    const t = riga.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const idx = t.indexOf("=");
    const k = t.slice(0, idx).trim();
    let v = t.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

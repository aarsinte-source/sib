import "server-only";

/**
 * Upload immagini via Supabase Storage REST — bucket `sheis-articoli`
 * (pubblico, creato e verificato dal vivo il 2026-08-03: bucket creato con
 * `POST /storage/v1/bucket`, upload+fetch pubblico+delete su un pixel di
 * prova, byte identici andata e ritorno). A differenza del DDL Postgres,
 * l'API Storage funziona con la sola chiave di servizio — non serve il
 * Personal Access Token che blocca le tabelle.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const BUCKET = "sheis-articoli";
const MIME_AMMESSI = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DIMENSIONE_MASSIMA = 10 * 1024 * 1024; // 10MB, stesso limite del bucket

export type EsitoUpload = { ok: true; url: string; path: string } | { ok: false; errore: string };

function estensioneDa(mime: string): string {
  return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[mime] ?? "bin";
}

/**
 * Carica un'immagine nel bucket pubblico e restituisce l'URL pubblico
 * definitivo. `cartella` organizza per articolo (es. l'id dell'articolo),
 * `slug` compone un nome file leggibile.
 */
export async function caricaImmagine(
  bytes: ArrayBuffer,
  mime: string,
  cartella: string,
): Promise<EsitoUpload> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, errore: "Configurazione Supabase mancante: imposta SUPABASE_URL e SUPABASE_SECRET_KEY." };
  }
  if (!MIME_AMMESSI.has(mime)) {
    return { ok: false, errore: `Formato immagine non ammesso: ${mime}. Ammessi: PNG, JPEG, WEBP, GIF.` };
  }
  if (bytes.byteLength > DIMENSIONE_MASSIMA) {
    return { ok: false, errore: `Immagine troppo grande: ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB, massimo 10MB.` };
  }

  const nomeFile = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${estensioneDa(mime)}`;
  const percorso = `${cartella}/${nomeFile}`;

  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${percorso}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": mime,
      },
      body: bytes,
    });
  } catch (e) {
    return { ok: false, errore: `Errore di rete verso lo storage: ${e instanceof Error ? e.message : "sconosciuto"}.` };
  }

  if (!r.ok) {
    const testo = await r.text().catch(() => "");
    return { ok: false, errore: `Storage ha risposto ${r.status}: ${testo.slice(0, 200) || "nessun dettaglio"}.` };
  }

  return { ok: true, url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${percorso}`, path: percorso };
}

import "server-only";
import type { Brand, Formato } from "@/lib/brand";
import { BRAND_LABEL, VALORI_ASSE, asseVarianteDeterministico, type AsseVariante } from "@/lib/brand";
import {
  COSTO_EUR_PER_CREDITO,
  CREDITI_PER_VARIANTE,
  QUALITA_LABEL,
  costoStimato,
  type QualitaImmagine,
} from "@/lib/higgsfield-shared";

/**
 * Generazione delle varianti creative + GATE DI COSTO obbligatorio.
 *
 * 1 credito = €0,0330, misurato (vedi memoria reference_higgsfield_costi_euro,
 * campionato da 774 preventivi reali dell'API costi Higgsfield). Per gpt_image_2
 * i due costi DOCUMENTATI sono: default 2k/high = 7 crediti/immagine, economico
 * 1k/low = 0,5 crediti/immagine. Non si inventano numeri intermedi.
 *
 * Stato reale di questo ambiente: nessuna HIGGSFIELD_API_KEY è stata fornita a
 * questa app (solo Supabase e OpenAI, per istruzione esplicita). generaVariante()
 * quindi degrada SEMPRE a "non collegato" finché quella chiave non arriva — è
 * il comportamento corretto per "il degrado si dichiara", non un bug: il
 * prompt e il costo restano comunque calcolati e visibili, pronti per quando
 * la chiave ci sarà (o per un worker esterno che legge la coda, come fa già
 * ~/alkemia-sheis-console per lo stesso motivo).
 */

export type { QualitaImmagine };
export { COSTO_EUR_PER_CREDITO, CREDITI_PER_VARIANTE, QUALITA_LABEL, costoStimato };

const BRAND_PROMPT: Record<Brand, { palette: string; soggetto: string; segno: string }> = {
  "sheis-color": {
    palette: "warm bone and near-black ink tones with restrained desaturated gold accents",
    soggetto: "an editorial still-life of a professional hair-colour tube resting beside a fanned-out colour swatch chart",
    segno: "evoke the depth of an 83-shade professional colour range, ammonia-free and precise",
  },
  babilon: {
    palette: "soft botanical greens, earthy neutrals and warm bone light",
    soggetto: "an editorial still-life of a professional hair-care bottle among natural botanical elements, dried leaves and raw stone",
    segno: "evoke 99% natural-origin, honest and quiet, nothing artificial in frame",
  },
  younic: {
    palette: "calm spa neutrals, warm greys and a single soft gold highlight",
    soggetto: "an editorial still-life of professional hair-treatment vessels arranged on a clean surface",
    segno: "evoke a structured three-phase professional treatment, clinical yet warm",
  },
};

function aspectRatioDa(formato: Formato): "1:1" | "4:5" | "9:16" {
  if (formato === "video") return "9:16";
  return "4:5";
}

export type SpecVariante = { indice: 1 | 2 | 3; asse: AsseVariante; angoloVisivo: string; prompt: string };

/**
 * Costruisce le 3 varianti deterministicamente: sceglie UN asse dichiarato
 * (inquadratura | ambientazione | luce, mai a caso — SPEC.md) e ne applica i
 * 3 valori fissi, uno per variante, tenendo fisso tutto il resto.
 */
export function costruisciVarianti(input: {
  brand: Brand;
  formato: Formato;
  angolo: string;
  hook: string;
}): SpecVariante[] {
  const asse = asseVarianteDeterministico(input.brand, input.formato);
  const valori = VALORI_ASSE[asse];
  const b = BRAND_PROMPT[input.brand];
  const ar = aspectRatioDa(input.formato);
  const clean = ar === "9:16" ? "keep the lower third clean for on-screen text" : "keep a clean empty area in the upper third for headline text";

  return valori.map((valore, i) => ({
    indice: (i + 1) as 1 | 2 | 3,
    asse,
    angoloVisivo: `${asse}: ${valore}`,
    prompt: [
      `Luxury editorial product photograph, ${ar} aspect ratio, ${BRAND_LABEL[input.brand]} professional hair-care.`,
      `${b.soggetto}.`,
      `Palette: ${b.palette}. Variation axis (${asse}): ${valore}.`,
      `Creative angle: ${input.angolo}. Mood cue from the hook: "${input.hook}".`,
      `${b.segno}.`,
      `Composition: ${clean}. Minimal, sophisticated, B2B professional register — speaks to distributors and salons, never to a retail consumer.`,
      `Strict constraints: no price, no percentages or numbers rendered as graphics, no shop or e-commerce cues, no logos, no on-image text. Photorealistic, high resolution.`,
    ].join(" "),
  }));
}

export type EsitoGenerazione =
  | { ok: true; assetUrl: string; costoCrediti: number; costoEur: number }
  | { ok: false; errore: string; tettoRaggiunto: boolean };

/**
 * Tenta la generazione reale su Higgsfield. Con la configurazione odierna
 * (nessuna HIGGSFIELD_API_KEY) restituisce SEMPRE il degrado dichiarato.
 */
export async function generaImmagine(
  prompt: string,
  qualita: QualitaImmagine,
): Promise<EsitoGenerazione> {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;
  const crediti = CREDITI_PER_VARIANTE[qualita];
  const eur = Math.round(crediti * COSTO_EUR_PER_CREDITO * 100) / 100;

  if (!apiKey || !apiSecret) {
    return {
      ok: false,
      tettoRaggiunto: false,
      errore:
        "Higgsfield non è collegato in questo ambiente: mancano HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET nelle variabili del server. " +
        "Il prompt e il costo stimato restano pronti; la generazione reale può partire da un worker con quelle credenziali.",
    };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let r: Response;
    try {
      r = await fetch("https://fnf.higgsfield.ai/agents/jobs", {
        method: "POST",
        headers: {
          "hf-api-key": apiKey,
          "hf-secret": apiSecret,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt_image_2",
          params: { prompt, quality: qualita === "2k_high" ? "high" : "low", resolution: qualita === "2k_high" ? "2k" : "1k" },
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const testo = await r.text();
    let corpo: Record<string, unknown> = {};
    try {
      corpo = JSON.parse(testo) as Record<string, unknown>;
    } catch {
      /* risposta non JSON: gestita sotto come errore generico */
    }

    if (!r.ok) {
      const errorType = typeof corpo.error_type === "string" ? corpo.error_type : undefined;
      if (errorType === "grace_daily_limit_reached") {
        return {
          ok: false,
          tettoRaggiunto: true,
          errore:
            "Higgsfield ha raggiunto il tetto giornaliero di generazioni (oltre i crediti disponibili). " +
            "Questa variante resta in errore; le altre in coda non partono. Riprova domani.",
        };
      }
      return {
        ok: false,
        tettoRaggiunto: false,
        errore: `Higgsfield ha risposto ${r.status}: ${testo.slice(0, 200) || "nessun dettaglio"}.`,
      };
    }

    const assetUrl = typeof corpo.url === "string" ? corpo.url : typeof corpo.asset_url === "string" ? corpo.asset_url : "";
    if (!assetUrl) {
      return {
        ok: false,
        tettoRaggiunto: false,
        errore: "Higgsfield ha risposto senza un URL di asset utilizzabile. Verifica manualmente il job.",
      };
    }

    return { ok: true, assetUrl, costoCrediti: crediti, costoEur: eur };
  } catch (e) {
    return {
      ok: false,
      tettoRaggiunto: false,
      errore: `Errore di rete verso Higgsfield: ${e instanceof Error ? e.message : "sconosciuto"}. Riprova.`,
    };
  }
}

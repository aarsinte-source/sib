import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Il ponte fra lo Studio e il media buyer.
 *
 * ⚠️ Perché esiste. La pagina Campagne salvava una riga in tabella e basta:
 * nome, obiettivo, budget, stato «bloccata». Sembrava un media buyer e non lo
 * era — nessun blueprint scelto, nessun pubblico costruito, nessun controllo
 * sul tetto di spesa, nessun testo passato dal filtro di marca. Il motore vero
 * (`campagna_da_brief.mjs`) esisteva già, completo e collaudato, e nessuno lo
 * chiamava: chi scriveva un brief nell'interfaccia otteneva un promemoria, non
 * una campagna.
 *
 * Qui si chiama davvero. Il motore fa il suo lavoro — analizza il brief,
 * sceglie fra i sei blueprint, costruisce il payload esatto per Meta, verifica
 * il tetto di spesa e i guardrail di marca — e scrive lui stesso in
 * `sheis_campagne`. Lo Studio legge il risultato e lo mostra.
 *
 * ⚠️ Non lancia mai niente su Meta. Il motore ha una tripla chiusura (LIVE=1 +
 * `--live` + conferma battuta a mano) e questo ponte non passa nessuna delle
 * tre: da qui esce solo una simulazione ispezionabile.
 */

const PERCORSO_MOTORE =
  process.env.SHEIS_ADS_PATH ?? join(process.env.HOME ?? "", "alkemia-sheis-ads");

const SCRIPT = join(PERCORSO_MOTORE, "campagna_da_brief.mjs");

/** Il motore è raggiungibile? Se non lo è va detto, non aggirato in silenzio. */
export function motoreDisponibile(): { ok: true } | { ok: false; motivo: string } {
  if (!existsSync(SCRIPT)) {
    return {
      ok: false,
      motivo:
        `Il motore campagne non è raggiungibile in ${PERCORSO_MOTORE}. ` +
        `È un repository separato (alkemia-sheis-ads): se lo Studio gira su un'altra ` +
        `macchina, imposta SHEIS_ADS_PATH sul percorso giusto. Finché manca, da qui ` +
        `si può registrare la richiesta ma non costruire la campagna.`,
    };
  }
  return { ok: true };
}

export type EsitoMotore = {
  ok: boolean;
  /** Quello che il motore ha stampato: si mostra così com'è, senza riassumerlo. */
  resoconto: string;
  /** La campagna completa: brief, segnali, punteggi dei blueprint, payload Meta. */
  campagna: unknown | null;
  /** L'id della riga scritta in sheis_campagne, se il motore ci è arrivato. */
  id: string | null;
};

// Un brief è testo libero scritto da una persona: nessun limite è "giusto", ma
// oltre una certa lunghezza non è più un brief ed è meglio dirlo subito che
// lasciar girare il motore per niente.
const BRIEF_MAX = 4000;

export async function costruisciDaBrief(brief: string): Promise<EsitoMotore> {
  const disponibile = motoreDisponibile();
  if (!disponibile.ok) {
    return { ok: false, resoconto: disponibile.motivo, campagna: null, id: null };
  }

  const cartella = await mkdtemp(join(tmpdir(), "sheis-campagna-"));
  const uscita = join(cartella, "campagna.json");

  try {
    const resoconto = await esegui(SCRIPT, ["--brief", brief.slice(0, BRIEF_MAX), "--out", uscita]);
    let campagna: unknown = null;
    try {
      campagna = JSON.parse(await readFile(uscita, "utf8"));
    } catch {
      // Il motore può fermarsi prima di scrivere il file (brief non
      // interpretabile, budget fuori dal tetto). Il resoconto lo spiega già in
      // italiano: non serve un secondo messaggio che dica la stessa cosa peggio.
    }
    const id = resoconto.match(/id ([0-9a-f-]{36})/i)?.[1] ?? null;
    return { ok: campagna !== null, resoconto: pulisci(resoconto), campagna, id };
  } finally {
    await rm(cartella, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** I codici colore del terminale, in una pagina web, sono solo rumore. */
function pulisci(testo: string): string {
  // eslint-disable-next-line no-control-regex
  return testo.replace(/\[[0-9;]*m/g, "");
}

function esegui(script: string, argomenti: string[]): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const p = spawn("node", [script, ...argomenti], {
      cwd: PERCORSO_MOTORE,
      // ⚠️ Nessun LIVE nell'ambiente del figlio, mai. Anche se qualcuno lo
      // esportasse nella shell dello Studio, da qui non deve passare: la
      // decisione di spendere denaro non si eredita da una variabile.
      env: { ...process.env, LIVE: "" },
    });
    let uscita = "";
    p.stdout.on("data", (d) => (uscita += d.toString()));
    p.stderr.on("data", (d) => (uscita += d.toString()));
    p.on("error", (e) => rifiuta(new Error(`Il motore campagne non è partito: ${e.message}`)));
    // Il codice di uscita non decide da solo: il motore esce con 0 anche quando
    // la campagna resta «bloccata», che è un esito legittimo e informativo.
    p.on("close", () => risolvi(uscita));
  });
}

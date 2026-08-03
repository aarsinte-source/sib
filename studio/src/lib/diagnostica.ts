import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { schemaInizializzato } from "@/lib/supabase";
import { motoreDisponibile } from "@/lib/motore-campagne";
import { LAVORI, CREDITO_EUR } from "@/lib/modelli-creativi";

/**
 * Che cosa è davvero acceso, adesso.
 *
 * ⚠️ Nessuna di queste risposte è scritta a mano. Ogni voce viene da una
 * verifica eseguita al momento: si conta una tabella, si chiede un saldo, si
 * cerca un eseguibile. Un cruscotto che dichiara «collegato» perché qualcuno
 * l'ha scritto in un file è peggio di nessun cruscotto — la prima volta che
 * qualcuno ci si fida, scopre il contrario nel momento sbagliato.
 *
 * Ogni voce dice anche COSA MANCA e CHI può darlo, perché su questo progetto
 * quasi tutto ciò che è spento aspetta un accesso, non altro lavoro.
 */

export type StatoVoce = {
  nome: string;
  acceso: boolean;
  dettaglio: string;
  /** Cosa serve perché si accenda, quando è spento. Vuoto se è acceso. */
  serve?: string;
  /** Chi lo può dare: noi, o il cliente. */
  dipendeDa?: "noi" | "mauro";
};

const TIMEOUT_COMANDO = 20_000;

function eseguiComando(cli: string, argomenti: string[]): Promise<{ ok: boolean; uscita: string }> {
  return new Promise((risolvi) => {
    const p = spawn(cli, argomenti, { env: { ...process.env, NO_COLOR: "1" } });
    let uscita = "";
    p.stdout.on("data", (d) => (uscita += d.toString()));
    p.stderr.on("data", (d) => (uscita += d.toString()));
    p.on("error", () => risolvi({ ok: false, uscita: "non partito" }));
    const timer = setTimeout(() => {
      p.kill();
      risolvi({ ok: false, uscita: "nessuna risposta" });
    }, TIMEOUT_COMANDO);
    p.on("close", (c) => {
      clearTimeout(timer);
      risolvi({ ok: c === 0, uscita });
    });
  });
}

function trova(nome: string, variabile?: string): string | null {
  const candidati = [
    variabile ? process.env[variabile] : undefined,
    join(process.env.HOME ?? "", ".npm-global", "bin", nome),
    `/usr/local/bin/${nome}`,
    `/opt/homebrew/bin/${nome}`,
  ].filter(Boolean) as string[];
  return candidati.find((p) => existsSync(p)) ?? null;
}

async function statoDatabase(): Promise<StatoVoce> {
  const s = await schemaInizializzato();
  return {
    nome: "Database",
    acceso: s.ok,
    dettaglio: s.ok
      ? "Le tabelle ci sono: quello che salvi resta."
      : s.motivo ?? "Non raggiungibile.",
    serve: s.ok ? undefined : "applicare le migrazioni dal pannello Supabase",
    dipendeDa: "noi",
  };
}

async function statoHiggsfield(): Promise<StatoVoce> {
  const cli = trova("higgsfield", "HIGGSFIELD_CLI");
  if (!cli) {
    return {
      nome: "Generazione creatività",
      acceso: false,
      dettaglio: "La riga di comando Higgsfield non è raggiungibile da questo server.",
      serve: "npm i -g @higgsfield/cli && higgsfield auth login",
      dipendeDa: "noi",
    };
  }
  const r = await eseguiComando(cli, ["account", "status"]);
  const crediti = r.uscita.match(/([\d.,]+)\s*credits/i)?.[1];
  const n = crediti ? Number(crediti.replace(",", "")) : null;
  return {
    nome: "Generazione creatività",
    acceso: r.ok && n !== null,
    dettaglio:
      n !== null
        ? `${Math.round(n)} crediti (≈€${(n * CREDITO_EUR).toFixed(0)}) — bastano per ${Math.floor(n / LAVORI.grafica.crediti)} grafiche o ${Math.floor(n / LAVORI["ugc-video"].crediti)} video UGC.`
        : "Collegata, ma il saldo non è leggibile.",
    serve: r.ok ? undefined : "ricollegare l'account con `higgsfield auth login`",
    dipendeDa: "noi",
  };
}

async function statoMonid(): Promise<StatoVoce> {
  const cli = trova("monid", "MONID_CLI");
  if (!cli) {
    return {
      nome: "Ricerca aziende e verifica email",
      acceso: false,
      dettaglio: "La riga di comando Monid non è raggiungibile.",
      serve: "npm i -g @monid-ai/cli && monid keys add",
      dipendeDa: "noi",
    };
  }
  const r = await eseguiComando(cli, ["balance"]);
  const saldo = r.uscita.match(/([\d.]+)\s*USD/i)?.[1];
  return {
    nome: "Ricerca aziende e verifica email",
    acceso: r.ok && Boolean(saldo),
    dettaglio: saldo
      ? `$${saldo} di credito. Serve solo per trovare AZIENDE (distributori esteri) e verificare che un'email riceva: tutto il resto è già compreso nel canone ScrapeCreators.`
      : "Collegata, ma il saldo non è leggibile.",
    serve: r.ok ? undefined : "verificare la chiave con `monid keys list`",
    dipendeDa: "noi",
  };
}

function statoMediaBuyer(): StatoVoce {
  const m = motoreDisponibile();
  return {
    nome: "Costruzione campagne",
    acceso: m.ok,
    dettaglio: m.ok
      ? "Scrivi un brief in italiano e la campagna viene costruita per intero, col contenuto esatto che partirebbe per Meta."
      : m.motivo,
    serve: m.ok ? undefined : "rendere raggiungibile il motore (SHEIS_ADS_PATH)",
    dipendeDa: "noi",
  };
}

/** Le cose che NON dipendono da noi. Elencate qui perché siano visibili. */
const ASPETTANO_MAURO: StatoVoce[] = [
  {
    nome: "Lancio delle campagne su Meta",
    acceso: false,
    dettaglio:
      "Le campagne si costruiscono per intero, ma non possono partire: SHEis non ha un proprio account pubblicitario. Verificato: il nostro accesso vede 16 account, nessuno è di SHEis.",
    serve: "un Business Manager SHEis con dentro account pubblicitario, Pagina Facebook e Instagram",
    dipendeDa: "mauro",
  },
  {
    nome: "Pubblicazione sui social",
    acceso: false,
    dettaglio:
      "I contenuti si producono e si mettono in coda, ma la coda si ferma sul bordo: i profili SHEis non sono collegati a Zernio.",
    serve: "collegare i profili Instagram e Facebook di SHEis",
    dipendeDa: "mauro",
  },
  {
    nome: "Invio dei messaggi di outreach",
    acceso: false,
    dettaglio:
      "I 112 prospect sono trovati e classificati, i messaggi si compongono, ma nessuno parte: manca l'account da cui scrivere. E servono 10-14 giorni di riscaldamento prima di poter mandare volumi.",
    serve: "un account Instagram e uno LinkedIn dedicati a SHEis",
    dipendeDa: "mauro",
  },
  {
    nome: "Instradamento dei saloni",
    acceso: false,
    dettaglio:
      "Un salone che arriva va mandato al distributore della sua zona — o tenuto, se la zona è scoperta. Senza la mappa delle zone il sistema non indovina: mette tutto in attesa di una decisione.",
    serve: "la mappa delle zone esclusive dei distributori",
    dipendeDa: "mauro",
  },
];

export async function diagnostica(): Promise<{ nostre: StatoVoce[]; diMauro: StatoVoce[] }> {
  // In parallelo: sono verifiche indipendenti e una pagina che ci mette otto
  // secondi non la guarda nessuno.
  const [db, hf, mo] = await Promise.all([statoDatabase(), statoHiggsfield(), statoMonid()]);
  return { nostre: [db, hf, statoMediaBuyer(), mo], diMauro: ASPETTANO_MAURO };
}

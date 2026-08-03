"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Card, H2, Label } from "@/components/ui";

/**
 * La console di ricerca: passo 1 della procedura.
 *
 * TRE SCELTE DI PROGETTO, TUTTE PER LO STESSO MOTIVO
 * ---------------------------------------------------
 * 1. **Il piano si vede prima di eseguirlo.** Appena scegli piattaforme e
 *    tipo, la pagina chiede al server cosa verrebbe interrogato e quanto
 *    costerebbe. Non è una stima: è lo stesso calcolo che poi verrà eseguito,
 *    sulla stessa fonte dati.
 * 2. **L'attesa è dichiarata.** Una passata completa impiega circa due minuti
 *    (55s di raccolta + 50s di lettura, misurati). La pagina lo dice invece di
 *    mostrare una rotellina muta.
 * 3. **Se l'esecutore è spento, si vede.** Senza, una ricerca resterebbe «in
 *    coda» per sempre e sembrerebbe un guasto del portale.
 */

type Passo = {
  capacita: string;
  fonte: string;
  cosa: string;
  costo: string;
  aConsumo: boolean;
  piattaforme: string[];
};
type Piano = { passi: Passo[]; saltati: string[]; aCanone: number; aConsumo: number };
type Pillar = {
  nome: string;
  descrizione: string;
  obiettivo: string;
  quota_pct: number;
  esempi?: string[];
  lessico?: string[];
};
type Sintesi = {
  pain?: string[];
  desideri?: string[];
  lessico?: string[];
  angoli?: string[];
  cosa_funziona?: string[];
  concorrenti_attivi?: Array<{ nome?: string; dove?: string; segnale?: string }>;
  pillar?: Pillar[];
  buchi?: string[];
  errore?: string;
};
type Ricerca = {
  id: string;
  tema: string;
  piattaforme: string[];
  tipo: string;
  paesi: string[];
  stato: string;
  sintesi: Sintesi | null;
  risultati: { chiamate_a_canone?: number; costo_monid_eur?: number } | null;
  fonti_usate: string[] | null;
  errore: string | null;
  created_at: string;
};
type Coda = { esecutoreVivo: boolean; inAttesa: number; inCorso: number; nota: string };

const PIATTAFORME = [
  { id: "instagram", nome: "Instagram" },
  { id: "facebook", nome: "Facebook" },
  { id: "tiktok", nome: "TikTok" },
  { id: "youtube", nome: "YouTube" },
  { id: "linkedin", nome: "LinkedIn" },
  { id: "google", nome: "Google" },
];

const TIPI = [
  { id: "entrambi", nome: "Organico e pubblicitario" },
  { id: "organico", nome: "Solo organico" },
  { id: "pubblicitario", nome: "Solo pubblicitario" },
];

const PAESI = [
  { id: "it", nome: "Italia" },
  { id: "es", nome: "Spagna" },
];

const OBIETTIVO_COLORE: Record<string, string> = {
  attrazione: "#B45309",
  consapevolezza: "#1D4ED8",
  fiducia: "#047857",
  vendita: "#9333EA",
};

export default function RicercaClient({ ruolo }: { ruolo: string }) {
  const [tema, setTema] = useState("");
  const [piattaforme, setPiattaforme] = useState<string[]>(["instagram", "facebook", "tiktok"]);
  const [tipo, setTipo] = useState("entrambi");
  const [paesi, setPaesi] = useState<string[]>(["it"]);
  const [conDomanda, setConDomanda] = useState(true);
  const [conAziende, setConAziende] = useState(false);

  const [piano, setPiano] = useState<Piano | null>(null);
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [coda, setCoda] = useState<Coda | null>(null);
  const [storico, setStorico] = useState<Ricerca[]>([]);
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [attesaSec, setAttesaSec] = useState(0);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const puoLanciare = ruolo === "mauro" || ruolo === "marketing" || ruolo === "dipendente";

  /* --------------------------------------------------- anteprima del piano */
  const aggiornaPiano = useCallback(async () => {
    if (piattaforme.length === 0) {
      setPiano(null);
      return;
    }
    const r = await fetch("/api/ricerca", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tema: tema || "anteprima", piattaforme, tipo, conDomanda, conAziende, soloPiano: true }),
    });
    const j = await r.json();
    setPiano(r.ok ? j.piano : null);
  }, [piattaforme, tipo, conDomanda, conAziende, tema]);

  useEffect(() => {
    void aggiornaPiano();
  }, [aggiornaPiano]);

  useEffect(() => {
    void fetch("/api/ricerca")
      .then((r) => (r.ok ? r.json() : { ricerche: [] }))
      .then((j) => setStorico(j.ricerche ?? []))
      .catch(() => {});
  }, []);

  /* ------------------------------------------------------------ esecuzione */
  const segui = useCallback((id: string) => {
    if (timer.current) clearInterval(timer.current);
    setAttesaSec(0);
    timer.current = setInterval(async () => {
      setAttesaSec((s) => s + 3);
      const r = await fetch(`/api/ricerca/${id}`);
      if (!r.ok) return;
      const j = await r.json();
      setRicerca(j.ricerca);
      setCoda(j.coda);
      if (j.ricerca?.stato === "completata" || j.ricerca?.stato === "fallita") {
        if (timer.current) clearInterval(timer.current);
        setInCorso(false);
      }
    }, 3000);
  }, []);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function lancia() {
    setErrore("");
    if (!tema.trim()) {
      setErrore("Scrivi il tema da analizzare.");
      return;
    }
    setInCorso(true);
    setRicerca(null);
    const r = await fetch("/api/ricerca", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tema, piattaforme, tipo, paesi, conDomanda, conAziende }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErrore(j.error ?? "Non è stato possibile avviare la ricerca.");
      setInCorso(false);
      return;
    }
    setRicerca(j.ricerca);
    segui(j.ricerca.id);
  }

  function commuta(lista: string[], set: (v: string[]) => void, id: string) {
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  const sintesi = ricerca?.sintesi;

  return (
    <div className="space-y-8">
      {/* ─────────────────────────────────────────────── impostazioni */}
      <Card>
        <div className="space-y-5">
          <div>
            <Label htmlFor="tema">Cosa analizziamo</Label>
            <input
              id="tema"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="es. colorazione professionale senza ammoniaca"
              className="mt-1 w-full rounded-md border border-[var(--bordo)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <Label>Dove cercare</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PIATTAFORME.map((p) => (
                <button
                  key={p.id}
                  onClick={() => commuta(piattaforme, setPiattaforme, p.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    piattaforme.includes(p.id)
                      ? "border-[var(--accento)] bg-[var(--accento)] text-white"
                      : "border-[var(--bordo)] text-[var(--on-surface-2)] hover:border-[var(--on-surface-3)]"
                  }`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <Label>Che tipo di analisi</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIPI.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      tipo === t.id
                        ? "border-[var(--accento)] bg-[var(--accento)] text-white"
                        : "border-[var(--bordo)] text-[var(--on-surface-2)] hover:border-[var(--on-surface-3)]"
                    }`}
                  >
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Mercati</Label>
              <div className="mt-2 flex gap-2">
                {PAESI.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => commuta(paesi, setPaesi, p.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      paesi.includes(p.id)
                        ? "border-[var(--accento)] bg-[var(--accento)] text-white"
                        : "border-[var(--bordo)] text-[var(--on-surface-2)]"
                    }`}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={conDomanda} onChange={(e) => setConDomanda(e.target.checked)} />
              <span>Volumi di ricerca reali su Google</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={conAziende} onChange={(e) => setConAziende(e.target.checked)} />
              <span>
                Cerca anche aziende per settore e paese
                <span className="ml-1 text-[var(--on-surface-3)]">— consuma saldo Monid</span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* ─────────────────────────────────── il piano, PRIMA di eseguirlo */}
      {piano && (
        <Card>
          <H2>Cosa verrà interrogato</H2>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            {piano.aCanone} interrogazioni già comprese nel canone
            {piano.aConsumo > 0
              ? ` · ${piano.aConsumo} che consumano saldo Monid`
              : " · nessuna che consumi saldo"}
            .
          </p>

          <div className="mt-4 space-y-1.5">
            {piano.passi.map((p) => (
              <div key={p.capacita} className="flex items-start gap-3 text-sm">
                <Badge colore={p.aConsumo ? "#B45309" : "#047857"}>
                  {p.aConsumo ? "a consumo" : "a canone"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.capacita}</span>
                  {p.piattaforme.length > 1 && (
                    <span className="ml-2 text-[var(--on-surface-3)]">
                      una sola chiamata per {p.piattaforme.join(" e ")}
                    </span>
                  )}
                  <div className="text-[var(--on-surface-3)]">{p.cosa}</div>
                </div>
              </div>
            ))}
          </div>

          {piano.saltati.length > 0 && (
            <div className="mt-4 rounded-md border border-[var(--bordo)] p-3 text-sm text-[var(--on-surface-2)]">
              <div className="font-medium">Non coperto da nessuna fonte</div>
              <ul className="mt-1 list-inside list-disc text-[var(--on-surface-3)]">
                {piano.saltati.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Button onClick={lancia} disabled={!puoLanciare || inCorso || !tema.trim()}>
              {inCorso ? "Ricerca in corso…" : "Avvia la ricerca"}
            </Button>
            <span className="text-sm text-[var(--on-surface-3)]">
              Richiede circa due minuti: un minuto per raccogliere, uno per leggere.
            </span>
          </div>
        </Card>
      )}

      {errore && <Banner tono="errore">{errore}</Banner>}

      {/* ─────────────────────────────────────────────────────── in corso */}
      {ricerca && ricerca.stato !== "completata" && ricerca.stato !== "fallita" && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">«{ricerca.tema}» — {ricerca.stato.replace("_", " ")}</div>
              <div className="text-sm text-[var(--on-surface-3)]">
                {attesaSec}s · {ricerca.piattaforme.join(", ")}
              </div>
            </div>
          </div>
          {coda && !coda.esecutoreVivo && coda.nota && (
            <div className="mt-4">
              <Banner tono="attenzione" titolo="Nessuno sta lavorando questa coda">
                {coda.nota}
              </Banner>
            </div>
          )}
        </Card>
      )}

      {ricerca?.stato === "fallita" && (
        <Banner tono="errore" titolo="La ricerca non è arrivata in fondo">
          {ricerca.errore ?? "Motivo non dichiarato."}
        </Banner>
      )}

      {/* ────────────────────────────────────────────────────── risultato */}
      {sintesi && !sintesi.errore && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2>Cosa dicono i dati</H2>
              <span className="text-sm text-[var(--on-surface-3)]">
                {ricerca?.risultati?.chiamate_a_canone ?? 0} chiamate a canone ·{" "}
                {(ricerca?.risultati?.costo_monid_eur ?? 0) > 0
                  ? `€${ricerca?.risultati?.costo_monid_eur} di saldo Monid`
                  : "nessun saldo consumato"}
              </span>
            </div>

            {sintesi.cosa_funziona && sintesi.cosa_funziona.length > 0 && (
              <div className="mt-5">
                <div className="text-sm font-medium">Cosa sta funzionando, e da quanto</div>
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--on-surface-2)]">
                  {sintesi.cosa_funziona.map((c, i) => (
                    <li key={i} className="border-l-2 border-[var(--bordo)] pl-3">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <Elenco titolo="Problemi" voci={sintesi.pain} />
              <Elenco titolo="Desideri" voci={sintesi.desideri} />
              <Elenco titolo="Angoli utilizzabili" voci={sintesi.angoli} />
              <div>
                <div className="text-sm font-medium">Lessico reale del mestiere</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(sintesi.lessico ?? []).map((l) => (
                    <span
                      key={l}
                      className="rounded border border-[var(--bordo)] px-2 py-0.5 text-xs text-[var(--on-surface-2)]"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {sintesi.concorrenti_attivi && sintesi.concorrenti_attivi.length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium">Chi sta pagando, adesso</div>
                <div className="mt-2 space-y-1 text-sm text-[var(--on-surface-2)]">
                  {sintesi.concorrenti_attivi.map((c, i) => (
                    <div key={i}>
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-[var(--on-surface-3)]">
                        {" "}— {c.dove} · {c.segnale}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sintesi.buchi && sintesi.buchi.length > 0 && (
              <div className="mt-6 rounded-md border border-[var(--bordo)] p-3">
                <div className="text-sm font-medium">Cosa NON si è potuto misurare</div>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--on-surface-3)]">
                  {sintesi.buchi.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ─────────────────────────────────────────── i pilastri */}
          {sintesi.pillar && sintesi.pillar.length > 0 && (
            <Card>
              <H2>Pilastri di contenuto</H2>
              <p className="mt-1 text-sm text-[var(--on-surface-2)]">
                Non sono categorie generiche: nascono da cosa i dati dicono che funziona in questo
                mercato. Le quote sommano a 100 e governano il piano a 30 giorni.
              </p>
              <div className="mt-5 space-y-4">
                {sintesi.pillar.map((p) => (
                  <div key={p.nome} className="rounded-md border border-[var(--bordo)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.nome}</span>
                      <Badge colore={OBIETTIVO_COLORE[p.obiettivo] ?? "#555"}>{p.obiettivo}</Badge>
                      <span className="text-sm text-[var(--on-surface-3)]">{p.quota_pct}% del piano</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--on-surface-2)]">{p.descrizione}</p>
                    {p.esempi && p.esempi.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sm text-[var(--on-surface-3)]">
                        {p.esempi.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <a href={`/piano?ricerca=${ricerca?.id}`}>
                  <Button>Costruisci il piano a 30 giorni da questa analisi</Button>
                </a>
              </div>
            </Card>
          )}
        </div>
      )}

      {sintesi?.errore && (
        <Banner tono="attenzione" titolo="I dati ci sono, la lettura no">
          {sintesi.errore} I dati grezzi sono salvati: la sintesi si può rigenerare senza pagare di
          nuovo le fonti.
        </Banner>
      )}

      {/* ───────────────────────────────────────────────────── storico */}
      {storico.length > 0 && (
        <Card>
          <H2>Ricerche precedenti</H2>
          <div className="mt-3 space-y-1.5 text-sm">
            {storico.slice(0, 10).map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setRicerca(r);
                  if (r.stato === "in_attesa" || r.stato === "in_corso") segui(r.id);
                }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-[var(--surface-2)]"
              >
                <span className="truncate">{r.tema}</span>
                <span className="ml-3 shrink-0 text-[var(--on-surface-3)]">
                  {r.stato} · {new Date(r.created_at).toLocaleDateString("it-IT")}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Elenco({ titolo, voci }: { titolo: string; voci?: string[] }) {
  if (!voci || voci.length === 0) return null;
  return (
    <div>
      <div className="text-sm font-medium">{titolo}</div>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--on-surface-2)]">
        {voci.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { Ruolo } from "@/lib/ruoli";
import { Badge, Banner, Button, Card, H2 } from "@/components/ui";
import ContenutoCard, { type ContenutoDTO } from "@/components/piano/ContenutoCard";

/**
 * Fasi 3, 4 e 5: il piano a trenta giorni, i suoi testi, le sue approvazioni.
 *
 * TRE COSE CHE QUESTA PAGINA MOSTRA E CHE PRIMA NON SI VEDEVANO
 * -------------------------------------------------------------
 * 1. **La resa dei pilastri**: quota chiesta contro quota ottenuta. Chiedere a
 *    un modello di rispettare le quote non è una garanzia, è una richiesta:
 *    contarlo dopo è l'unico modo di sapere se è stata ascoltata.
 * 2. **Quanti testi mancano**, distinti per tipo. La didascalia, il parlato del
 *    video e il testo grafico sono tre mestieri diversi e si contano separati:
 *    un piano «con i testi» in cui manca ogni testo grafico non è pronto.
 * 3. **I testi si scrivono a gruppi.** Trenta contenuti per tre testi in una
 *    risposta sola si troncherebbero a metà, e la qualità cadrebbe dopo i primi
 *    cinque. Il gruppo è sei, e la pagina lo dice invece di far sembrare che
 *    stia andando lento.
 */

type Pillar = { id: string; nome: string; descrizione: string; obiettivo: string; quota_pct: number };
type Resa = { nome: string; quotaChiesta: number; giorniAssegnati: number; quotaReale: number; scarto: number };
type Conteggi = {
  totali: number; conTesti: number; senzaTesti: number; conGrafica: number;
  video: number; senzaUgc: number; inAttesa: number; approvati: number; scartati: number;
};

type Contenuto = ContenutoDTO & {
  giorno?: number | null;
  pillarNome?: string | null;
  brandLabel?: string;
  copy_ugc?: string | null;
  copy_grafica?: { titolo?: string; sottotitolo?: string; cta?: string } | null;
};

const OBIETTIVO_COLORE: Record<string, string> = {
  attrazione: "#B45309",
  consapevolezza: "#1D4ED8",
  fiducia: "#047857",
  vendita: "#9333EA",
};

export default function PianoClient({ ruolo }: { ruolo: Ruolo }) {
  const [piano, setPiano] = useState<{ id: string; titolo: string } | null>(null);
  const [pillar, setPillar] = useState<Pillar[]>([]);
  const [resa, setResa] = useState<Resa[]>([]);
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [conteggi, setConteggi] = useState<Conteggi | null>(null);
  const [analisiDisponibile, setAnalisiDisponibile] = useState<{ tema: string; pillar: number } | null>(null);
  const [messaggio, setMessaggio] = useState("");
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState("");
  const [soloDaDecidere, setSoloDaDecidere] = useState(false);

  const puoApprovare = ruolo === "mauro" || ruolo === "marketing";

  const carica = useCallback(async () => {
    const r = await fetch("/api/piano/corrente");
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErrore(j.error ?? "Non è stato possibile caricare il piano.");
      return;
    }
    const j = await r.json();
    setPiano(j.piano);
    setPillar(j.pillar ?? []);
    setResa(j.resa ?? []);
    setContenuti(j.contenuti ?? []);
    setConteggi(j.conteggi ?? null);
    setAnalisiDisponibile(j.analisiDisponibile ?? null);
    setMessaggio(j.messaggio ?? "");
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function generaPiano() {
    setInCorso("piano");
    setErrore("");
    const r = await fetch("/api/piano/genera", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    setInCorso("");
    if (!r.ok) setErrore(j.error ?? "Non è stato possibile generare il piano.");
    else void carica();
  }

  /**
   * Scrive i testi a gruppi finché ne restano. Il ciclo sta qui e non nel
   * server perché così ogni gruppo che arriva si vede subito: un'attesa di
   * cinque minuti senza niente sullo schermo si legge come un blocco.
   */
  async function scriviTesti() {
    if (!piano) return;
    setInCorso("testi");
    setErrore("");
    for (let giro = 0; giro < 8; giro++) {
      const r = await fetch("/api/piano/testi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pianoId: piano.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErrore(j.error ?? "La scrittura dei testi si è fermata.");
        break;
      }
      await carica();
      if (j.completo || j.fatti === 0) break;
    }
    setInCorso("");
  }


  async function approvaTuttiConTesti() {
    const daFare = contenuti.filter((c) => c.stato === "in_attesa" && (c.copy ?? "").trim());
    setInCorso("approva");
    for (const c of daFare) {
      await fetch(`/api/contenuti/${c.id}/approva`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    }
    setInCorso("");
    void carica();
  }

  const mostrati = soloDaDecidere
    ? contenuti.filter((c) => c.stato === "in_attesa" || c.stato === "modificato")
    : contenuti;

  /* ── nessun piano ancora ────────────────────────────────────────────── */
  if (!piano) {
    return (
      <div className="space-y-5">
        <Card>
          <H2>Nessun piano ancora</H2>
          <p className="mt-2 text-sm text-[var(--on-surface-2)]">{messaggio}</p>
          {analisiDisponibile ? (
            <div className="mt-4">
              <Button onClick={generaPiano} disabled={inCorso === "piano"}>
                {inCorso === "piano"
                  ? "Costruisco i trenta giorni…"
                  : `Genera il piano da «${analisiDisponibile.tema}»`}
              </Button>
              <p className="mt-2 text-xs text-[var(--on-surface-3)]">
                {analisiDisponibile.pillar} pilastri dall&apos;analisi. Richiede circa un minuto.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <a href="/ricerca">
                <Button>Vai all&apos;analisi di mercato</Button>
              </a>
            </div>
          )}
        </Card>
        {errore && <Banner tono="errore">{errore}</Banner>}
      </div>
    );
  }

  /* ── il piano ───────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <H2>{piano.titolo}</H2>
          <span className="text-sm text-[var(--on-surface-3)]">
            {conteggi?.totali ?? 0} giorni · {conteggi?.approvati ?? 0} approvati
          </span>
        </div>

        {conteggi && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              didascalie <strong>{conteggi.conTesti}</strong>/{conteggi.totali}
            </span>
            <span>
              testi grafici <strong>{conteggi.conGrafica}</strong>/{conteggi.totali}
            </span>
            <span>
              parlato video <strong>{conteggi.video - conteggi.senzaUgc}</strong>/{conteggi.video}
            </span>
            {conteggi.inAttesa > 0 && <Badge colore="#1D4ED8">{conteggi.inAttesa} da decidere</Badge>}
            {conteggi.scartati > 0 && (
              <span className="text-[var(--on-surface-3)]">{conteggi.scartati} scartati</span>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {conteggi && conteggi.senzaTesti > 0 && (
            <Button onClick={scriviTesti} disabled={!!inCorso}>
              {inCorso === "testi"
                ? "Scrivo…"
                : `Scrivi i testi mancanti (${conteggi.senzaTesti})`}
            </Button>
          )}
          {puoApprovare && conteggi && conteggi.inAttesa > 0 && conteggi.conTesti > 0 && (
            <Button variant="ghost" onClick={approvaTuttiConTesti} disabled={!!inCorso}>
              {inCorso === "approva" ? "Approvo…" : "Approva tutti quelli che hanno i testi"}
            </Button>
          )}
          <Button variant="ghost" onClick={generaPiano} disabled={!!inCorso}>
            Rigenera il piano da capo
          </Button>
        </div>

        {inCorso === "testi" && (
          <p className="mt-3 text-xs text-[var(--on-surface-3)]">
            Si procede a gruppi di sei: trenta contenuti per tre testi in una risposta sola si
            troncherebbero a metà, e la qualità cadrebbe dopo i primi cinque.
          </p>
        )}
      </Card>

      {/* ── i pilastri, con la resa vera ───────────────────────────────── */}
      {pillar.length > 0 && (
        <Card>
          <H2>Pilastri e resa</H2>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            A sinistra la quota chiesta, a destra quella ottenuta. Uno scarto grande è la differenza
            fra un piano equilibrato e un mese passato a dire sempre la stessa cosa.
          </p>
          <div className="mt-4 space-y-2.5">
            {resa.map((r) => {
              const grande = Math.abs(r.scarto) > 8;
              return (
                <div key={r.nome} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="min-w-[14rem] flex-1 truncate">{r.nome}</span>
                  <span className="text-[var(--on-surface-3)]">
                    {r.quotaChiesta}% → <strong>{r.quotaReale}%</strong> ({r.giorniAssegnati} giorni)
                  </span>
                  {grande && (
                    <Badge colore="#B45309">
                      {r.scarto > 0 ? "+" : ""}
                      {r.scarto} punti
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-5 space-y-3">
            {pillar.map((p) => (
              <div key={p.id} className="rounded-md border border-[var(--bordo)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.nome}</span>
                  <Badge colore={OBIETTIVO_COLORE[p.obiettivo] ?? "#555"}>{p.obiettivo}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-[var(--on-surface-2)]">{p.descrizione}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {errore && <Banner tono="errore">{errore}</Banner>}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={soloDaDecidere}
          onChange={(e) => setSoloDaDecidere(e.target.checked)}
        />
        <span>Mostra solo quelli da decidere</span>
      </label>

      {/* ── i trenta giorni ────────────────────────────────────────────── */}
      <div className="space-y-4">
        {mostrati.map((c) => (
          <div key={c.id}>
            {c.pillarNome && (
              <div className="mb-1 pl-1 text-xs uppercase tracking-wide text-[var(--on-surface-3)]">
                giorno {c.giorno ?? "—"} · {c.pillarNome}
              </div>
            )}
            <ContenutoCard
              contenuto={c}
              ruolo={ruolo}
              onApprovato={carica}
              onRifiutato={carica}
              onModificato={carica}
            />
          </div>
        ))}
      </div>

      {mostrati.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--on-surface-2)]">
            Niente da mostrare con questo filtro.
          </p>
        </Card>
      )}
    </div>
  );
}

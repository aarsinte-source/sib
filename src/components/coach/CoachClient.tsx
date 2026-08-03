"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Card, H2 } from "@/components/ui";

/**
 * Il coach, come lo usa un agente: si scrive la situazione vera e si ottiene
 * cosa dire. Non è una ricerca nel materiale — è una risposta.
 *
 * Le frasi pronte stanno in evidenza e si copiano con un clic, perché il
 * momento in cui servono è cinque minuti prima di una chiamata, non durante
 * uno studio.
 */

type Risposta = {
  risposta: string;
  copioni: string[];
  perche: string;
  trovato: boolean;
  cosaManca: string;
  fonti: Array<{ titolo: string; posizione: number; minuto: string | null }>;
  motore: string;
};

type Scambio = { domanda: string; esito: Risposta | null; errore?: string };

type Formazione = { id: string; titolo: string; tenuta_il: string | null; caratteri: number };

const ESEMPI = [
  "Mi ha detto che costa troppo rispetto a quello che usa adesso",
  "Il salone lavora già con un altro marchio e non vuole cambiare",
  "«Ci devo pensare, mi faccia sapere» — e poi sparisce",
  "Come apro con un distributore che non mi conosce",
  "Non ho tempo di seguire tutti: come organizzo la settimana",
];

export default function CoachClient({ ruolo }: { ruolo: string }) {
  const [domanda, setDomanda] = useState("");
  const [scambi, setScambi] = useState<Scambio[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [formazioni, setFormazioni] = useState<Formazione[]>([]);
  const [buchi, setBuchi] = useState<Array<{ domanda: string }>>([]);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/coach")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setFormazioni(j.formazioni ?? []);
        setBuchi(j.buchi ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth" });
  }, [scambi]);

  async function chiedi(testo?: string) {
    const d = (testo ?? domanda).trim();
    if (!d || inCorso) return;
    setDomanda("");
    setInCorso(true);
    setScambi((s) => [...s, { domanda: d, esito: null }]);

    const r = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domanda: d }),
    });
    const j = await r.json();
    setScambi((s) => {
      const copia = [...s];
      copia[copia.length - 1] = r.ok
        ? { domanda: d, esito: j }
        : { domanda: d, esito: null, errore: j.error ?? "Non è arrivata risposta." };
      return copia;
    });
    setInCorso(false);
  }

  return (
    <div className="space-y-6">
      {formazioni.length === 0 && (
        <Banner tono="attenzione" titolo="Il materiale non è caricato">
          Il coach risponde solo citando l&apos;aula: senza il materiale non può rispondere, e
          inventare sarebbe esattamente ciò che deve evitare.
        </Banner>
      )}

      {/* ── la conversazione ───────────────────────────────────────────── */}
      {scambi.length > 0 && (
        <div className="space-y-5">
          {scambi.map((s, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accento)] px-4 py-2.5 text-sm text-white">
                  {s.domanda}
                </div>
              </div>

              {s.errore && <Banner tono="errore">{s.errore}</Banner>}

              {!s.esito && !s.errore && (
                <div className="text-sm text-[var(--on-surface-3)]">Cerco nella formazione…</div>
              )}

              {s.esito && (
                <Card>
                  {!s.esito.trovato && (
                    <div className="mb-4">
                      <Banner tono="attenzione" titolo="Su questo l'aula non è entrata nel merito">
                        {s.esito.cosaManca ||
                          "La formazione non copre questa situazione. Quello che segue è il principio più vicino, non una risposta insegnata."}
                      </Banner>
                    </div>
                  )}

                  <p className="whitespace-pre-line text-sm">{s.esito.risposta}</p>

                  {s.esito.copioni.length > 0 && (
                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-wide text-[var(--on-surface-3)]">
                        Da dire così
                      </div>
                      <div className="mt-2 space-y-2">
                        {s.esito.copioni.map((c, k) => (
                          <button
                            key={k}
                            onClick={() => navigator.clipboard?.writeText(c)}
                            title="Copia"
                            className="block w-full rounded-md border border-[var(--bordo)] bg-[var(--surface-2)] px-3 py-2 text-left text-sm italic hover:border-[var(--accento)]"
                          >
                            «{c}»
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {s.esito.perche && (
                    <p className="mt-4 border-l-2 border-[var(--bordo)] pl-3 text-sm text-[var(--on-surface-2)]">
                      {s.esito.perche}
                    </p>
                  )}

                  {s.esito.fonti.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {s.esito.fonti.map((f, k) => (
                        <span
                          key={k}
                          className="rounded border border-[var(--bordo)] px-2 py-0.5 text-xs text-[var(--on-surface-3)]"
                        >
                          {f.titolo.slice(0, 34)} · passaggio {f.posizione}
                          {f.minuto ? ` · ${f.minuto}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          ))}
          <div ref={fondo} />
        </div>
      )}

      {/* ── la domanda ─────────────────────────────────────────────────── */}
      <Card>
        <textarea
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void chiedi();
          }}
          rows={3}
          placeholder="Racconta la situazione com'è andata. «Mi ha detto che…», «non riesco a…»"
          className="w-full resize-none rounded-md border border-[var(--bordo)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => chiedi()} disabled={inCorso || domanda.trim().length < 5}>
            {inCorso ? "Cerco…" : "Chiedi al coach"}
          </Button>
          <span className="text-xs text-[var(--on-surface-3)]">⌘+Invio</span>
        </div>

        {scambi.length === 0 && (
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wide text-[var(--on-surface-3)]">
              Situazioni che capitano
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ESEMPI.map((e) => (
                <button
                  key={e}
                  onClick={() => chiedi(e)}
                  className="rounded-full border border-[var(--bordo)] px-3 py-1.5 text-left text-sm text-[var(--on-surface-2)] hover:border-[var(--accento)] hover:text-[var(--accento)]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── cosa c'è dentro ────────────────────────────────────────────── */}
      {formazioni.length > 0 && (
        <Card>
          <H2>Su cosa è allenato</H2>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            Le due giornate di formazione alla rete SHEis del 26 e 27 luglio 2026, più la sintesi
            del metodo con le citazioni. Il relatore è il formatore esterno scelto da Mauro: il
            coach cita «la formazione», mai «Mauro dice».
          </p>
          <div className="mt-4 space-y-1.5 text-sm">
            {formazioni.map((f) => (
              <div key={f.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{f.titolo}</span>
                <span className="shrink-0 text-[var(--on-surface-3)]">
                  {f.tenuta_il ?? "—"} · {(f.caratteri / 1000).toFixed(0)}k caratteri
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--on-surface-3)]">
            Per aggiungere una formazione nuova: metti la trascrizione in{" "}
            <code>clienti/sheis-beauty-aiconsult/raw/</code> e rilancia{" "}
            <code>carica_formazioni.py --carica</code>.
          </p>
        </Card>
      )}

      {/* ── i buchi, solo per chi decide la prossima aula ─────────────── */}
      {buchi.length > 0 && (ruolo === "mauro" || ruolo === "marketing") && (
        <Card>
          <div className="flex items-center gap-2">
            <H2>Domande scoperte</H2>
            <Badge colore="#B45309">{buchi.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            Situazioni che la rete ha chiesto e su cui l&apos;aula non è entrata nel merito. È
            l&apos;elenco di cosa aggiungere alla prossima giornata — misurato, non immaginato.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-[var(--on-surface-2)]">
            {buchi.slice(0, 12).map((b, i) => (
              <li key={i}>{b.domanda}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

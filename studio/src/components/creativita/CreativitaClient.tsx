"use client";

import { useCallback, useEffect, useState } from "react";
import AnteprimaSocial from "@/components/creativita/AnteprimaSocial";
import { Badge, Banner, Button, Card, H2 } from "@/components/ui";

/**
 * Fase 6: le creative.
 *
 * Il pezzo che conta è l'ANTEPRIMA: la creativa si giudica dentro un feed
 * finto, col copy sotto e la didascalia troncata dove la troncherebbe
 * Instagram. Guardata da sola, a tutto schermo e senza contesto, un'immagine
 * sembra quasi sempre buona.
 *
 * Il gate di costo è mostrato PRIMA, sempre. Novanta generazioni sono circa
 * ventuno euro in un clic: chi preme deve aver visto il numero.
 */

type Contenuto = {
  id: string;
  giorno: number | null;
  canale: string;
  brand: string;
  brandLabel: string;
  formato: string;
  lingua: string;
  pubblico: string | null;
  angolo: string;
  hook: string;
  copy: string;
  cta: string;
  hashtag: string[] | null;
  copy_ugc: string | null;
  copy_grafica: { titolo?: string; sottotitolo?: string; cta?: string } | null;
  stato: string;
};

type Variante = {
  id: string;
  contenuto_id: string;
  indice: number;
  angolo_visivo: string | null;
  asset_url: string | null;
  stato: string;
  errore: string | null;
  costo_eur: number | null;
};

type Conteggi = {
  totali: number; approvati: number; inProduzione: number; conCreative: number;
  pronte: number; approvate: number; inCorso: number; inErrore: number; spesoEur: number;
};

type Anteprima = {
  generazioni: number; costo: number; daGenerare: number; giaConCreative: number;
  approvati: number; qualitaLabel: string; nota?: string;
  dove?: { dove: string; nota: string };
};

const STATO_COLORE: Record<string, string> = {
  da_generare: "#6B7280",
  in_corso: "#B45309",
  pronta: "#1D4ED8",
  approvata: "#047857",
  scartata: "#9CA3AF",
  errore: "#B91C1C",
};

export default function CreativitaClient({ ruolo }: { ruolo: string }) {
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [varianti, setVarianti] = useState<Variante[]>([]);
  const [conteggi, setConteggi] = useState<Conteggi | null>(null);
  const [coda, setCoda] = useState<{ esecutoreVivo: boolean; nota: string; inAttesa: number } | null>(null);
  const [copertura, setCopertura] = useState<{ dove: string; nota: string } | null>(null);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [soloApprovati, setSoloApprovati] = useState(true);

  const puoDecidere = ruolo === "mauro" || ruolo === "marketing";

  const carica = useCallback(async () => {
    const r = await fetch("/api/creative");
    if (!r.ok) return;
    const j = await r.json();
    setContenuti(j.contenuti ?? []);
    setVarianti(j.varianti ?? []);
    setConteggi(j.conteggi ?? null);
    setCoda(j.coda ?? null);
    setCopertura(j.copertura ?? null);
  }, []);

  useEffect(() => {
    void carica();
    // Le generazioni arrivano da un altro processo: la pagina si aggiorna da
    // sola, altrimenti chi guarda non vedrebbe mai comparire il risultato e
    // penserebbe che non stia succedendo niente.
    const t = setInterval(() => void carica(), 12000);
    return () => clearInterval(t);
  }, [carica]);

  async function chiediAnteprima() {
    setErrore("");
    const r = await fetch("/api/piano/creative", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (!r.ok) {
      setErrore(j.error ?? "Non è stato possibile calcolare il costo.");
      return;
    }
    setAnteprima(j);
  }

  async function generaTutte(quante: number) {
    setInCorso(true);
    setErrore("");
    const r = await fetch("/api/piano/creative", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conferma: true, perContenuto: quante }),
    });
    const j = await r.json();
    setInCorso(false);
    setAnteprima(null);
    if (!r.ok) setErrore(j.error ?? "Non è stato possibile accodare.");
    else void carica();
  }

  async function generaSingola(id: string) {
    setInCorso(true);
    setErrore("");
    const r = await fetch(`/api/contenuti/${id}/varianti/genera`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conferma: true }),
    });
    const j = await r.json();
    setInCorso(false);
    if (!r.ok) setErrore(j.error ?? "Non è stato possibile accodare.");
    else void carica();
  }

  async function decidi(contenutoId: string, varianteId: string, azione: "approva" | "scarta") {
    const r = await fetch(`/api/contenuti/${contenutoId}/varianti/${varianteId}/${azione}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErrore(j.error ?? "Non è stato possibile registrare la decisione.");
      return;
    }
    void carica();
  }

  const mostrati = soloApprovati
    ? contenuti.filter(
        (c) => c.stato === "approvato" || c.stato === "in_produzione" || c.stato === "prodotto",
      )
    : contenuti;

  return (
    <div className="space-y-6">
      {conteggi && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <strong>{conteggi.approvati}</strong> contenuti approvati su {conteggi.totali}
              </span>
              <span className="text-[var(--on-surface-3)]">
                {conteggi.conCreative} con creative · {conteggi.pronte} pronte · {conteggi.approvate} scelte
              </span>
              {conteggi.inCorso > 0 && <Badge colore="#B45309">{conteggi.inCorso} in generazione</Badge>}
              {conteggi.inErrore > 0 && <Badge colore="#B91C1C">{conteggi.inErrore} in errore</Badge>}
              <span className="text-[var(--on-surface-3)]">speso finora €{conteggi.spesoEur}</span>
            </div>

            {puoDecidere && (
              <Button onClick={chiediAnteprima} disabled={inCorso || conteggi.approvati === 0}>
                Genera tutte le creative
              </Button>
            )}
          </div>
        </Card>
      )}

      {anteprima && (
        <Card className="border-[var(--accento)]">
          <H2>Prima di spendere</H2>
          <div className="mt-3 space-y-1.5 text-sm">
            <div>
              <strong>{anteprima.daGenerare}</strong> contenuti da generare ·{" "}
              <strong>{anteprima.generazioni}</strong> immagini · qualità {anteprima.qualitaLabel}
            </div>
            <div className="text-lg">
              costo stimato <strong>€{anteprima.costo}</strong>
            </div>
            {anteprima.nota && <div className="text-[var(--on-surface-3)]">{anteprima.nota}</div>}
            {anteprima.dove && (
              <div className="text-[var(--on-surface-3)]">
                Gira sul {anteprima.dove.dove}. {anteprima.dove.nota}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => generaTutte(3)} disabled={inCorso}>
              Sì, tre varianti per contenuto
            </Button>
            <Button variant="ghost" onClick={() => generaTutte(1)} disabled={inCorso}>
              Solo una per contenuto (un terzo del costo)
            </Button>
            <Button variant="ghost" onClick={() => setAnteprima(null)}>
              Annulla
            </Button>
          </div>
        </Card>
      )}

      {errore && <Banner tono="errore">{errore}</Banner>}

      {coda && !coda.esecutoreVivo && coda.nota && (
        <Banner tono="attenzione" titolo="Le generazioni sono in coda">
          {coda.nota}
        </Banner>
      )}

      {copertura && (
        <p className="text-xs text-[var(--on-surface-3)]">
          Le creative girano sul {copertura.dove}. {copertura.nota}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={soloApprovati}
          onChange={(e) => setSoloApprovati(e.target.checked)}
        />
        <span>Mostra solo i contenuti approvati</span>
      </label>

      <div className="space-y-8">
        {mostrati.map((c) => {
          const sue = varianti.filter((v) => v.contenuto_id === c.id);
          const scelta = sue.find((v) => v.stato === "approvata");
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="text-sm text-[var(--on-surface-3)]">giorno {c.giorno ?? "—"} · </span>
                  <span className="font-medium">{c.brandLabel}</span>
                  <span className="text-sm text-[var(--on-surface-3)]">
                    {" "}
                    · {c.canale} · {c.formato} · {c.lingua}
                    {c.pubblico ? ` · ${c.pubblico}` : ""}
                  </span>
                </div>
                {scelta && <Badge colore="#047857">variante scelta</Badge>}
              </div>

              <p className="mt-1 text-sm text-[var(--on-surface-2)]">{c.angolo}</p>

              {c.copy_ugc && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--on-surface-3)]">
                    parlato del video
                  </summary>
                  <p className="mt-2 whitespace-pre-line border-l-2 border-[var(--bordo)] pl-3 text-sm italic">
                    {c.copy_ugc}
                  </p>
                </details>
              )}

              {sue.length === 0 ? (
                <div className="mt-4 flex flex-wrap items-start gap-5">
                  <AnteprimaSocial
                    dati={{
                      canale: c.canale,
                      brand: c.brand,
                      brandLabel: c.brandLabel,
                      formato: c.formato,
                      hook: c.hook,
                      copy: c.copy,
                      cta: c.cta,
                      hashtag: c.hashtag,
                      copyGrafica: c.copy_grafica,
                      assetUrl: null,
                    }}
                  />
                  <div className="space-y-2">
                    {puoDecidere && (
                      <Button
                        onClick={() => generaSingola(c.id)}
                        disabled={inCorso || c.stato !== "approvato"}
                      >
                        Genera questa creativa
                      </Button>
                    )}
                    {c.stato !== "approvato" && (
                      <p className="max-w-xs text-xs text-[var(--on-surface-3)]">
                        Il contenuto è in stato «{c.stato}». Si genera su ciò che è già stato
                        approvato: su un testo ancora in discussione si pagherebbe due volte.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-5">
                  {sue.map((v) => (
                    <div key={v.id} className="space-y-2">
                      <AnteprimaSocial
                        dati={{
                          canale: c.canale,
                          brand: c.brand,
                          brandLabel: c.brandLabel,
                          formato: c.formato,
                          hook: c.hook,
                          copy: c.copy,
                          cta: c.cta,
                          hashtag: c.hashtag,
                          copyGrafica: c.copy_grafica,
                          assetUrl: v.asset_url,
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        <Badge colore={STATO_COLORE[v.stato] ?? "#555"}>
                          {v.stato.replace("_", " ")}
                        </Badge>
                        {v.angolo_visivo && (
                          <span className="text-xs text-[var(--on-surface-3)]">{v.angolo_visivo}</span>
                        )}
                        {v.costo_eur ? (
                          <span className="text-xs text-[var(--on-surface-3)]">€{v.costo_eur}</span>
                        ) : null}
                      </div>
                      {v.errore && <p className="px-1 text-xs text-[var(--color-blocked)]">{v.errore}</p>}
                      {puoDecidere && v.stato === "pronta" && (
                        <div className="flex gap-2 px-1">
                          <Button onClick={() => decidi(c.id, v.id, "approva")}>Scegli questa</Button>
                          <Button variant="ghost" onClick={() => decidi(c.id, v.id, "scarta")}>
                            Scarta
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {mostrati.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--on-surface-2)]">
            Nessun contenuto da mostrare. La catena comincia dall&apos;analisi di mercato e passa dal
            piano: le creative si generano su ciò che è già stato approvato.
          </p>
        </Card>
      )}
    </div>
  );
}

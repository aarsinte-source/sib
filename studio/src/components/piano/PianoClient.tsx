"use client";

import { useEffect, useState, useCallback } from "react";
import type { Ruolo } from "@/lib/ruoli";
import { Card, H2, Eyebrow, Button, Banner, inputCls } from "@/components/ui";
import ContenutoCard, { type ContenutoDTO } from "@/components/piano/ContenutoCard";
import { ETICHETTA_MOTORE } from "@/components/piano/format";

export type Analisi = {
  query: string;
  pain: string[];
  desideri: string[];
  lessico: string[];
  angoli: string[];
  fonti: string[];
  creatoIl: string;
  motore?: string;
};

type StatoGlobale = { ok: boolean; motivo?: string } | null;

const STATI_DA_DECIDERE = ["in_attesa", "modificato"] as const;

export default function PianoClient({ ruolo }: { ruolo: Ruolo }) {
  const [statoSchema, setStatoSchema] = useState<StatoGlobale>(null);
  const [tema, setTema] = useState("");
  const [analisi, setAnalisi] = useState<Analisi | null>(null);
  const [analizzando, setAnalizzando] = useState(false);
  const [generandoPiano, setGenerandoPiano] = useState(false);
  const [contenuti, setContenuti] = useState<ContenutoDTO[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [motorePiano, setMotorePiano] = useState<string | null>(null);

  const ricaricaContenuti = useCallback(async () => {
    setCaricando(true);
    try {
      const risposte = await Promise.all(
        STATI_DA_DECIDERE.map((s) => fetch(`/api/piano?stato=${s}`).then((r) => r.json())),
      );
      const tutti: ContenutoDTO[] = risposte.flatMap((j) => (Array.isArray(j.contenuti) ? j.contenuti : []));
      tutti.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setContenuti(tutti);
    } catch {
      setErrore("Errore di rete nel caricamento del piano.");
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stato");
        const j = (await r.json()) as { schema: { ok: boolean; motivo?: string } };
        setStatoSchema(j.schema);
        if (j.schema.ok) await ricaricaContenuti();
        else setCaricando(false);
      } catch {
        setStatoSchema({ ok: false, motivo: "Impossibile verificare lo stato del database." });
        setCaricando(false);
      }
    })();
  }, [ricaricaContenuti]);

  async function analizza() {
    const q = tema.trim();
    if (!q || analizzando) return;
    setAnalizzando(true);
    setErrore("");
    try {
      const r = await fetch("/api/analisi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const j = (await r.json()) as { analisi?: Analisi; error?: string };
      if (r.ok && j.analisi) setAnalisi(j.analisi);
      else setErrore(j.error || "Analisi non riuscita.");
    } catch {
      setErrore("Errore di rete: riprova.");
    } finally {
      setAnalizzando(false);
    }
  }

  async function generaPiano() {
    if (!analisi || generandoPiano) return;
    setGenerandoPiano(true);
    setErrore("");
    try {
      const r = await fetch("/api/piano/genera", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: analisi.query, analisi }),
      });
      const j = (await r.json()) as { contenuti?: ContenutoDTO[]; motore?: string; error?: string };
      if (r.ok && j.contenuti) {
        setContenuti((prev) => [...j.contenuti!, ...prev]);
        setMotorePiano(j.motore ?? null);
        setAnalisi(null);
        setTema("");
      } else {
        setErrore(j.error || "Generazione del piano non riuscita.");
      }
    } catch {
      setErrore("Errore di rete: riprova.");
    } finally {
      setGenerandoPiano(false);
    }
  }

  function rimuoviDallaLista(id: string) {
    setContenuti((prev) => prev.filter((c) => c.id !== id));
  }
  function aggiornaNellaLista(c: ContenutoDTO) {
    setContenuti((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  }

  if (statoSchema === null) {
    return <p className="text-sm text-[var(--on-surface-3)]">Verifico il database…</p>;
  }
  if (!statoSchema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {statoSchema.motivo}
      </Banner>
    );
  }

  return (
    <div className="space-y-12">
      {/* ==================================================== fase 1+2 */}
      <section>
        <Eyebrow>Fase 1 · Analisi di mercato</Eyebrow>
        <H2>Scrivi una parola. Il team studia il mercato</H2>
        <p className="mt-2 max-w-xl text-sm text-[var(--on-surface-2)]">
          Una linea prodotto, un problema, un brand — es. &ldquo;senza ammoniaca&rdquo;,
          &ldquo;formazione Accademia&rdquo;, &ldquo;BABILON&rdquo;. Sempre ottica distributore/salone.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analizza()}
            placeholder="es. senza ammoniaca"
            className={`${inputCls} flex-1`}
          />
          <Button onClick={analizza} disabled={analizzando || !tema.trim()}>
            {analizzando ? "Analizzo…" : "Analizza il mercato"}
          </Button>
        </div>

        {analisi ? (
          <div className="mt-6 space-y-5">
            {analisi.motore ? (
              <p className="text-xs text-[var(--on-surface-3)]">
                Generato con: {ETICHETTA_MOTORE[analisi.motore] ?? analisi.motore}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <BloccoAnalisi titolo="Dolori" items={analisi.pain} />
              <BloccoAnalisi titolo="Desideri" items={analisi.desideri} />
              <BloccoAnalisi titolo="Lessico reale" items={analisi.lessico} />
              <BloccoAnalisi titolo="Angoli utilizzabili" items={analisi.angoli} />
            </div>
            <Button onClick={generaPiano} disabled={generandoPiano} variant="ghost">
              {generandoPiano ? "Genero il piano…" : "Genera piano editoriale (8 post) da questa analisi"}
            </Button>
          </div>
        ) : null}
        {motorePiano ? (
          <p className="mt-3 text-xs text-[var(--on-surface-3)]">
            Ultimo piano generato con: {ETICHETTA_MOTORE[motorePiano] ?? motorePiano}
          </p>
        ) : null}
      </section>

      {errore ? <p className="text-sm text-[var(--color-blocked)]">{errore}</p> : null}

      {/* ======================================================= fase 3 */}
      <section className="border-t border-[var(--hairline)] pt-10">
        <Eyebrow>Fase 3 · Decisione</Eyebrow>
        <H2>Da decidere</H2>
        <p className="mt-2 text-sm text-[var(--on-surface-2)]">
          Approva · rifiuta · modifica (a mano o con l&apos;AI su una nota). Ogni azione finisce nel
          registro con attore e ora.
        </p>

        {caricando ? (
          <p className="mt-6 text-sm text-[var(--on-surface-3)]">Carico…</p>
        ) : contenuti.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--on-surface-3)]">
            Niente da decidere: genera un piano dall&apos;analisi qui sopra.
          </p>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {contenuti.map((c) => (
              <ContenutoCard
                key={c.id}
                contenuto={c}
                ruolo={ruolo}
                onApprovato={rimuoviDallaLista}
                onRifiutato={rimuoviDallaLista}
                onModificato={aggiornaNellaLista}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BloccoAnalisi({ titolo, items }: { titolo: string; items: string[] }) {
  return (
    <Card>
      <Eyebrow>{titolo}</Eyebrow>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--on-surface-3)]">—</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="text-sm text-[var(--on-surface-2)]">
              · {t}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

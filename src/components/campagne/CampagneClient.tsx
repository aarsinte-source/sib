"use client";

import { useEffect, useState, useCallback } from "react";
import { Banner, Card, Button, Label, inputCls, Badge } from "@/components/ui";

type Campagna = {
  id: string;
  nome: string;
  obiettivo: string | null;
  pubblico: string | null;
  brand: string | null;
  budget_giorno: number | null;
  blueprint: string | null;
  stato: string;
  motivo_blocco: string | null;
  created_at: string;
};

type StatoMotore = { ok: true } | { ok: false; motivo: string };

const ESEMPIO =
  "Voglio far conoscere BABILON ai distributori spagnoli. Budget 25 euro al giorno per due " +
  "settimane. Obiettivo: farmi arrivare richieste di contatto da chi distribuisce prodotti " +
  "professionali per capelli.";

export default function CampagneClient({ puoLanciare }: { puoLanciare: boolean }) {
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [motore, setMotore] = useState<StatoMotore | null>(null);
  const [campagne, setCampagne] = useState<Campagna[]>([]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [resoconto, setResoconto] = useState("");

  const ricarica = useCallback(async () => {
    const r = await fetch("/api/campagne");
    if (r.ok) {
      const j = (await r.json()) as { campagne?: Campagna[]; motore?: StatoMotore };
      setCampagne(j.campagne ?? []);
      if (j.motore) setMotore(j.motore);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/stato");
      const j = (await r.json()) as { schema: { ok: boolean; motivo?: string } };
      setSchema(j.schema);
      if (j.schema.ok) await ricarica();
    })();
  }, [ricarica]);

  async function costruisci() {
    if (brief.trim().length < 20) return;
    setBusy(true);
    setErrore("");
    setResoconto("");
    const r = await fetch("/api/campagne", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: brief.trim() }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      error?: string;
      resoconto?: string;
      campagne?: Campagna[];
    };
    setBusy(false);
    if (!r.ok) {
      setErrore(j.error || "Richiesta non riuscita.");
      return;
    }
    setResoconto(j.resoconto || "");
    if (j.campagne) setCampagne(j.campagne);
    else await ricarica();
  }

  if (schema === null) return <p className="text-sm text-[var(--on-surface-3)]">Verifico il database…</p>;
  if (!schema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {schema.motivo}
      </Banner>
    );
  }

  return (
    <div className="space-y-8">
      {/* Se il motore non è raggiungibile va detto PRIMA, non dopo che qualcuno
          ha scritto un brief e premuto il pulsante. */}
      {motore && !motore.ok ? (
        <Banner tono="attenzione" titolo="Motore campagne non raggiungibile">
          {motore.motivo}
        </Banner>
      ) : null}

      {puoLanciare ? (
        <Card>
          <p className="text-sm font-medium">Descrivi la campagna che vuoi</p>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            Scrivila come la spiegheresti a una persona: <em>chi</em> vuoi raggiungere, con{" "}
            <em>quale brand</em>, con <em>quanto budget</em> e per <em>ottenere cosa</em>. Il motore
            sceglie il modello di campagna, costruisce pubblico e calendario, controlla il tetto di
            spesa e prepara il contenuto esatto che partirebbe per Meta.
          </p>
          <div className="mt-3">
            <Label>Brief</Label>
            <textarea
              className={`${inputCls} min-h-32 font-normal`}
              value={brief}
              placeholder={ESEMPIO}
              onChange={(e) => setBrief(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--on-surface-3)]">
              {brief.trim().length < 20 ? (
                <>
                  Ancora troppo corto.{" "}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => setBrief(ESEMPIO)}
                  >
                    Usa l&apos;esempio
                  </button>{" "}
                  per vedere come funziona.
                </>
              ) : (
                <>Nessuna campagna verrà creata su Meta: da qui esce solo una simulazione ispezionabile.</>
              )}
            </p>
          </div>
          <div className="mt-3">
            <Button onClick={costruisci} disabled={busy || brief.trim().length < 20}>
              {busy ? "Costruisco…" : "Costruisci la campagna"}
            </Button>
          </div>
          {errore ? <p className="mt-2 text-sm text-[var(--color-blocked)]">{errore}</p> : null}
        </Card>
      ) : (
        <Banner tono="info" titolo="Ruolo di sola visualizzazione">
          Il ruolo &ldquo;dipendente&rdquo; non può lanciare campagne.
        </Banner>
      )}

      {/* Il resoconto del motore si mostra intero e testuale. Riassumerlo
          significherebbe scegliere per chi legge cosa è importante — e proprio
          le righe noiose (tetto di spesa, valori non risolti) sono quelle che
          spiegano perché una campagna resta ferma. */}
      {resoconto ? (
        <Card>
          <p className="text-sm font-medium">Cosa ha fatto il motore</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--on-surface-2)]">
            {resoconto}
          </pre>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {campagne.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{c.nome}</p>
              <Badge colore={c.stato === "bloccata" ? "var(--color-blocked)" : "var(--color-wip)"}>
                {c.stato}
              </Badge>
            </div>
            {c.obiettivo ? <p className="mt-1 text-sm text-[var(--on-surface-2)]">{c.obiettivo}</p> : null}
            <p className="mt-1 text-xs text-[var(--on-surface-3)]">
              {[
                c.brand,
                c.pubblico,
                c.budget_giorno ? `€${c.budget_giorno}/giorno` : null,
                c.blueprint ? `modello ${c.blueprint}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {c.motivo_blocco ? (
              <p className="mt-2 text-xs text-[var(--color-blocked)]">{c.motivo_blocco}</p>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

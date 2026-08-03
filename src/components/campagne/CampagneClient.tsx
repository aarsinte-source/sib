"use client";

import { useEffect, useState, useCallback } from "react";
import { Banner, Card, Button, Label, inputCls, Badge } from "@/components/ui";

type Campagna = {
  id: string;
  nome: string;
  obiettivo: string | null;
  budget_giorno: number | null;
  stato: string;
  motivo_blocco: string | null;
  created_at: string;
};

export default function CampagneClient({ puoLanciare }: { puoLanciare: boolean }) {
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [campagne, setCampagne] = useState<Campagna[]>([]);
  const [nome, setNome] = useState("");
  const [obiettivo, setObiettivo] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const ricarica = useCallback(async () => {
    const r = await fetch("/api/campagne");
    if (r.ok) {
      const j = (await r.json()) as { campagne?: Campagna[] };
      setCampagne(j.campagne ?? []);
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

  async function crea() {
    if (!nome.trim()) return;
    setBusy(true);
    setErrore("");
    const r = await fetch("/api/campagne", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), obiettivo: obiettivo.trim() || undefined, budgetGiorno: budget ? Number(budget) : undefined }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (r.ok) {
      setNome("");
      setObiettivo("");
      setBudget("");
      await ricarica();
    } else setErrore(j.error || "Richiesta non riuscita.");
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
      {puoLanciare ? (
        <Card>
          <p className="text-sm font-medium">Richiedi una campagna</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Nome</Label>
              <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label>Obiettivo</Label>
              <input className={inputCls} value={obiettivo} onChange={(e) => setObiettivo(e.target.value)} />
            </div>
            <div>
              <Label>Budget/giorno (€)</Label>
              <input className={inputCls} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <Button onClick={crea} disabled={busy || !nome.trim()}>
              {busy ? "…" : "Crea richiesta"}
            </Button>
          </div>
          {errore ? <p className="mt-2 text-sm text-[var(--color-blocked)]">{errore}</p> : null}
        </Card>
      ) : (
        <Banner tono="info" titolo="Ruolo di sola visualizzazione">
          Il ruolo &ldquo;dipendente&rdquo; non può lanciare campagne.
        </Banner>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {campagne.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{c.nome}</p>
              <Badge colore={c.stato === "bloccata" ? "var(--color-blocked)" : "var(--color-wip)"}>{c.stato}</Badge>
            </div>
            {c.obiettivo ? <p className="mt-1 text-sm text-[var(--on-surface-2)]">{c.obiettivo}</p> : null}
            {c.budget_giorno ? <p className="mt-1 text-xs text-[var(--on-surface-3)]">€{c.budget_giorno}/giorno</p> : null}
            {c.motivo_blocco ? <p className="mt-2 text-xs text-[var(--color-blocked)]">{c.motivo_blocco}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

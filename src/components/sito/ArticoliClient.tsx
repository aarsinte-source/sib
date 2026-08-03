"use client";

import { useEffect, useState, useCallback } from "react";
import { Banner, Card, Button, Label, inputCls, Badge } from "@/components/ui";

type Articolo = { id: string; slug: string; lingua: string; titolo: string; sommario: string | null; stato: string };

export default function ArticoliClient() {
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [slug, setSlug] = useState("");
  const [titolo, setTitolo] = useState("");
  const [sommario, setSommario] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [violazioni, setViolazioni] = useState<{ regola: string; descrizione: string; frase: string }[] | null>(null);

  const ricarica = useCallback(async () => {
    const r = await fetch("/api/articoli");
    if (r.ok) {
      const j = (await r.json()) as { articoli?: Articolo[] };
      setArticoli(j.articoli ?? []);
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
    if (!slug.trim() || !titolo.trim()) return;
    setBusy(true);
    setErrore("");
    setViolazioni(null);
    const r = await fetch("/api/articoli", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: slug.trim(), titolo: titolo.trim(), sommario: sommario.trim() || undefined }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; linter?: { violazioni: typeof violazioni } };
    setBusy(false);
    if (r.ok) {
      setSlug("");
      setTitolo("");
      setSommario("");
      await ricarica();
    } else {
      setErrore(j.error || "Creazione non riuscita.");
      if (j.linter?.violazioni) setViolazioni(j.linter.violazioni);
    }
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
      <Card>
        <p className="text-sm font-medium">Nuovo articolo (bozza)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Slug</Label>
            <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="es. sun-babilon-2026" />
          </div>
          <div>
            <Label>Titolo</Label>
            <input className={inputCls} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label>Sommario</Label>
          <textarea className={inputCls} rows={2} value={sommario} onChange={(e) => setSommario(e.target.value)} />
        </div>
        <div className="mt-3">
          <Button onClick={crea} disabled={busy || !slug.trim() || !titolo.trim()}>
            {busy ? "…" : "Crea bozza"}
          </Button>
        </div>
        {errore ? <p className="mt-2 text-sm text-[var(--color-blocked)]">{errore}</p> : null}
        {violazioni ? (
          <ul className="mt-2 space-y-1">
            {violazioni.map((v, i) => (
              <li key={i} className="text-xs text-[var(--color-blocked)]">
                <strong>{v.regola}</strong>: {v.descrizione} — &ldquo;{v.frase}&rdquo;
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {articoli.map((a) => (
          <Card key={a.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{a.titolo}</p>
              <Badge>{a.stato}</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--on-surface-3)]">/{a.slug} · {a.lingua}</p>
            {a.sommario ? <p className="mt-2 text-sm text-[var(--on-surface-2)]">{a.sommario}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

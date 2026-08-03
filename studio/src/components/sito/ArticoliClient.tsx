"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Banner, Card, Button, Label, inputCls, Badge } from "@/components/ui";
import { LINGUE_SITO, LINGUA_SITO_LABEL, LINGUA_FONTE, type Lingua8 } from "@/lib/articoli";

type Articolo = {
  id: string;
  slug: string;
  lingua: string;
  titolo: string;
  sommario: string | null;
  categoria: string | null;
  stato: string;
  updated_at: string;
};

const STATO_COLORE: Record<string, string> = {
  bozza: "var(--on-surface-3)",
  in_revisione: "var(--color-wip)",
  pubblicato: "var(--color-live)",
  archiviato: "var(--color-blocked)",
};

export default function ArticoliClient() {
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [slug, setSlug] = useState("");
  const [titolo, setTitolo] = useState("");
  const [sommario, setSommario] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tagTesto, setTagTesto] = useState("");
  const [lingua, setLingua] = useState<Lingua8>(LINGUA_FONTE);
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
    const tag = tagTesto
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const r = await fetch("/api/articoli", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: slug.trim(),
        lingua,
        titolo: titolo.trim(),
        sommario: sommario.trim() || undefined,
        categoria: categoria.trim() || undefined,
        tag: tag.length ? tag : undefined,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; linter?: { violazioni: typeof violazioni } };
    setBusy(false);
    if (r.ok) {
      setSlug("");
      setTitolo("");
      setSommario("");
      setCategoria("");
      setTagTesto("");
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

  // Raggruppa per slug: ogni gruppo è un articolo con le sue traduzioni.
  const gruppi = new Map<string, Articolo[]>();
  for (const a of articoli) {
    const lista = gruppi.get(a.slug) ?? [];
    lista.push(a);
    gruppi.set(a.slug, lista);
  }

  return (
    <div className="space-y-8">
      <Card>
        <p className="text-sm font-medium">Nuovo articolo (bozza)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Slug</Label>
            <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="es. sun-babilon-2026" />
          </div>
          <div>
            <Label>Titolo</Label>
            <input className={inputCls} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </div>
          <div>
            <Label>Lingua</Label>
            <select className={inputCls} value={lingua} onChange={(e) => setLingua(e.target.value as Lingua8)}>
              {LINGUE_SITO.map((l) => (
                <option key={l} value={l}>
                  {LINGUA_SITO_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Categoria</Label>
            <input className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="es. SHEis Color" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Sommario</Label>
            <textarea className={inputCls} rows={2} value={sommario} onChange={(e) => setSommario(e.target.value)} />
          </div>
          <div>
            <Label>Tag (separati da virgola)</Label>
            <input className={inputCls} value={tagTesto} onChange={(e) => setTagTesto(e.target.value)} placeholder="senza ammoniaca, colorazione professionale" />
          </div>
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
        {[...gruppi.entries()].map(([slugGruppo, versioni]) => (
          <Card key={slugGruppo}>
            <p className="text-xs text-[var(--on-surface-3)]">/{slugGruppo}</p>
            <ul className="mt-2 space-y-2">
              {versioni.map((a) => (
                <li key={a.id}>
                  <Link href={`/sito/${a.id}`} className="flex items-center justify-between gap-2 hover:underline">
                    <span className="text-sm">
                      {LINGUA_SITO_LABEL[a.lingua as Lingua8] ?? a.lingua} — <span className="font-medium">{a.titolo}</span>
                    </span>
                    <Badge colore={STATO_COLORE[a.stato] ?? "var(--on-surface-3)"}>{a.stato}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

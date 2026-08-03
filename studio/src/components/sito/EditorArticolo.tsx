"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Ruolo } from "@/lib/ruoli";
import {
  LINGUE_SITO,
  LINGUA_SITO_LABEL,
  TIPI_BLOCCO,
  TIPO_BLOCCO_LABEL,
  bloccoVuoto,
  type Blocco,
  type TipoBlocco,
  type Lingua8,
} from "@/lib/articoli";
import { Banner, Card, Eyebrow, H2, Button, Label, inputCls, Badge, AzioneBloccata } from "@/components/ui";
import BloccoEditor from "@/components/sito/BloccoEditor";

type ArticoloDTO = {
  id: string;
  slug: string;
  lingua: string;
  titolo: string;
  sommario: string | null;
  blocchi: Blocco[];
  copertina: { src: string; alt: string } | null;
  categoria: string | null;
  tag: string[] | null;
  stato: "bozza" | "in_revisione" | "pubblicato" | "archiviato";
  fonte_lingua: string | null;
  pubblicato_il: string | null;
};

type ViolazioneLinter = { regola: string; descrizione: string; frase: string };

export default function EditorArticolo({ id, ruolo }: { id: string; ruolo: Ruolo }) {
  const router = useRouter();
  const [schema, setSchema] = useState<{ ok: boolean; motivo?: string } | null>(null);
  const [articolo, setArticolo] = useState<ArticoloDTO | null>(null);
  const [traduzioni, setTraduzioni] = useState<ArticoloDTO[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState("");

  const [titolo, setTitolo] = useState("");
  const [sommario, setSommario] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tagTesto, setTagTesto] = useState("");
  const [copertinaSrc, setCopertinaSrc] = useState("");
  const [copertinaAlt, setCopertinaAlt] = useState("");
  const [blocchi, setBlocchi] = useState<Blocco[]>([]);
  const [tipoNuovoBlocco, setTipoNuovoBlocco] = useState<TipoBlocco>("paragrafo");
  const [inDrag, setInDrag] = useState<number | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [pubblicando, setPubblicando] = useState(false);
  const [errore, setErrore] = useState("");
  const [violazioni, setViolazioni] = useState<ViolazioneLinter[] | null>(null);
  const [salvatoOra, setSalvatoOra] = useState<string | null>(null);

  const [linguaTraduzione, setLinguaTraduzione] = useState<Lingua8 | "">("");
  const [traducendo, setTraducendo] = useState(false);

  const puoPubblicare = ruolo === "mauro" || ruolo === "marketing";

  const carica = useCallback(async () => {
    setCaricando(true);
    const r = await fetch(`/api/articoli/${id}`);
    const j = (await r.json().catch(() => ({}))) as { articolo?: ArticoloDTO; traduzioni?: ArticoloDTO[]; error?: string };
    if (r.ok && j.articolo) {
      setArticolo(j.articolo);
      setTraduzioni(j.traduzioni ?? []);
      setTitolo(j.articolo.titolo);
      setSommario(j.articolo.sommario ?? "");
      setCategoria(j.articolo.categoria ?? "");
      setTagTesto((j.articolo.tag ?? []).join(", "));
      setCopertinaSrc(j.articolo.copertina?.src ?? "");
      setCopertinaAlt(j.articolo.copertina?.alt ?? "");
      setBlocchi(j.articolo.blocchi ?? []);
    } else {
      setErroreCaricamento(j.error || "Articolo non trovato.");
    }
    setCaricando(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/stato");
      const j = (await r.json()) as { schema: { ok: boolean; motivo?: string } };
      setSchema(j.schema);
      if (j.schema.ok) await carica();
      else setCaricando(false);
    })();
  }, [carica]);

  function aggiornaBlocco(indice: number, b: Blocco) {
    setBlocchi((prev) => prev.map((x, i) => (i === indice ? b : x)));
  }
  function rimuoviBlocco(indice: number) {
    setBlocchi((prev) => prev.filter((_, i) => i !== indice));
  }
  function spostaBlocco(daIndice: number, aIndice: number) {
    setBlocchi((prev) => {
      const nuovo = [...prev];
      const [tolto] = nuovo.splice(daIndice, 1);
      nuovo.splice(aIndice, 0, tolto);
      return nuovo;
    });
  }
  function aggiungiBlocco() {
    setBlocchi((prev) => [...prev, bloccoVuoto(tipoNuovoBlocco)]);
  }

  async function salva() {
    setSalvando(true);
    setErrore("");
    setViolazioni(null);
    setSalvatoOra(null);
    const tag = tagTesto.split(",").map((t) => t.trim()).filter(Boolean);
    const r = await fetch(`/api/articoli/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titolo,
        sommario,
        categoria: categoria || null,
        tag,
        copertina: copertinaSrc || copertinaAlt ? { src: copertinaSrc, alt: copertinaAlt } : null,
        blocchi,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { articolo?: ArticoloDTO; error?: string };
    setSalvando(false);
    if (r.ok && j.articolo) {
      setArticolo(j.articolo);
      setSalvatoOra(new Date().toLocaleTimeString("it-IT"));
    } else {
      setErrore(j.error || "Salvataggio non riuscito.");
    }
  }

  async function pubblica() {
    setPubblicando(true);
    setErrore("");
    setViolazioni(null);
    // Salva prima, così il gate di pubblicazione linta l'ultima versione.
    await salva();
    const r = await fetch(`/api/articoli/${id}/pubblica`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { articolo?: ArticoloDTO; error?: string; linter?: { violazioni: ViolazioneLinter[] } };
    setPubblicando(false);
    if (r.ok && j.articolo) {
      setArticolo(j.articolo);
    } else {
      setErrore(j.error || "Pubblicazione non riuscita.");
      if (j.linter?.violazioni) setViolazioni(j.linter.violazioni);
    }
  }

  async function traduci() {
    if (!linguaTraduzione) return;
    setTraducendo(true);
    setErrore("");
    const r = await fetch(`/api/articoli/${id}/traduci`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lingua: linguaTraduzione }),
    });
    const j = (await r.json().catch(() => ({}))) as { articolo?: ArticoloDTO; error?: string };
    setTraducendo(false);
    if (r.ok && j.articolo) {
      router.push(`/sito/${j.articolo.id}`);
    } else {
      setErrore(j.error || "Traduzione non riuscita.");
    }
  }

  if (schema === null || caricando) return <p className="text-sm text-[var(--on-surface-3)]">Carico…</p>;
  if (!schema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {schema.motivo}
      </Banner>
    );
  }
  if (erroreCaricamento || !articolo) {
    return (
      <Banner tono="errore" titolo="Non trovato">
        {erroreCaricamento || "Articolo non trovato."}
      </Banner>
    );
  }

  const lingueMancanti = LINGUE_SITO.filter((l) => l !== articolo.lingua && !traduzioni.some((t) => t.lingua === l));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>{LINGUA_SITO_LABEL[articolo.lingua as Lingua8] ?? articolo.lingua}</Badge>
        <Badge colore={articolo.stato === "pubblicato" ? "var(--color-live)" : "var(--on-surface-3)"}>{articolo.stato}</Badge>
        <span className="text-xs text-[var(--on-surface-3)]">/{articolo.slug}</span>
        {salvatoOra ? <span className="text-xs text-[var(--on-surface-3)]">Salvato alle {salvatoOra}</span> : null}
      </div>

      {traduzioni.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {traduzioni.map((t) => (
            <a
              key={t.id}
              href={`/sito/${t.id}`}
              className={`rounded-full border px-3 py-1 text-xs ${t.id === articolo.id ? "border-[var(--accent-ink)] text-[var(--accent-ink)]" : "border-[var(--hairline-strong)] text-[var(--on-surface-3)]"}`}
            >
              {LINGUA_SITO_LABEL[t.lingua as Lingua8] ?? t.lingua}
            </a>
          ))}
        </div>
      ) : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Titolo</Label>
            <input className={inputCls} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </div>
          <div>
            <Label>Categoria</Label>
            <input className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label>Sommario</Label>
          <textarea className={inputCls} rows={2} value={sommario} onChange={(e) => setSommario(e.target.value)} />
        </div>
        <div className="mt-3">
          <Label>Tag (separati da virgola)</Label>
          <input className={inputCls} value={tagTesto} onChange={(e) => setTagTesto(e.target.value)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Copertina — URL immagine</Label>
            <input className={inputCls} value={copertinaSrc} onChange={(e) => setCopertinaSrc(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>Copertina — testo alternativo</Label>
            <input className={inputCls} value={copertinaAlt} onChange={(e) => setCopertinaAlt(e.target.value)} />
          </div>
        </div>
      </Card>

      <section>
        <Eyebrow>Contenuto</Eyebrow>
        <H2>Blocchi</H2>
        <p className="mt-1 text-xs text-[var(--on-surface-3)]">Trascina per riordinare.</p>

        <div className="mt-4 space-y-4">
          {blocchi.map((b, i) => (
            <BloccoEditor
              key={i}
              blocco={b}
              indice={i}
              articoloId={id}
              onCambia={(nuovo) => aggiornaBlocco(i, nuovo)}
              onRimuovi={() => rimuoviBlocco(i)}
              onSposta={spostaBlocco}
              inDrag={inDrag}
              setInDrag={setInDrag}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
          <select value={tipoNuovoBlocco} onChange={(e) => setTipoNuovoBlocco(e.target.value as TipoBlocco)} className={`${inputCls} w-auto`}>
            {TIPI_BLOCCO.map((t) => (
              <option key={t} value={t}>
                {TIPO_BLOCCO_LABEL[t]}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={aggiungiBlocco}>
            + aggiungi blocco
          </Button>
        </div>
      </section>

      {violazioni ? (
        <div className="rounded-md border border-[color-mix(in_oklab,var(--color-blocked)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-blocked)_7%,transparent)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-blocked)]">Linter — bloccato</p>
          <ul className="mt-1.5 space-y-1.5">
            {violazioni.map((v, i) => (
              <li key={i} className="text-xs text-[var(--on-surface-2)]">
                <strong>{v.regola}</strong>: {v.descrizione} — <em>&ldquo;{v.frase}&rdquo;</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {errore ? <p className="text-sm text-[var(--color-blocked)]">{errore}</p> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-6">
        <Button onClick={salva} disabled={salvando}>
          {salvando ? "Salvo…" : "Salva bozza"}
        </Button>
        {puoPubblicare ? (
          <Button variant="ghost" onClick={pubblica} disabled={pubblicando || articolo.stato === "pubblicato"}>
            {pubblicando ? "Pubblico…" : articolo.stato === "pubblicato" ? "Già pubblicato" : "Pubblica"}
          </Button>
        ) : (
          <AzioneBloccata motivo='Il ruolo "dipendente" scrive e propone ma non pubblica: serve marketing o mauro.' />
        )}
      </div>

      {lingueMancanti.length > 0 ? (
        <div className="border-t border-[var(--hairline)] pt-6">
          <Eyebrow>Traduzione</Eyebrow>
          <p className="mt-1 text-sm text-[var(--on-surface-2)]">
            Duplica questo articolo in un&apos;altra lingua come bozza da tradurre (fonte tracciata: italiano).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={linguaTraduzione} onChange={(e) => setLinguaTraduzione(e.target.value as Lingua8)} className={`${inputCls} w-auto`}>
              <option value="">Scegli lingua…</option>
              {lingueMancanti.map((l) => (
                <option key={l} value={l}>
                  {LINGUA_SITO_LABEL[l]}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={traduci} disabled={!linguaTraduzione || traducendo}>
              {traducendo ? "…" : "Crea traduzione"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

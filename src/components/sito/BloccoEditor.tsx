"use client";

import { useRef, useState } from "react";
import type { Blocco } from "@/lib/articoli";
import { TIPO_BLOCCO_LABEL } from "@/lib/articoli";
import { Button, Label, inputCls } from "@/components/ui";

/**
 * Un blocco, editabile e trascinabile. Il drag-and-drop nativo HTML5 (nessuna
 * libreria) basta: `draggable` + onDragStart/onDragOver/onDrop, chiamando
 * indietro `onSposta(daIndice, aIndice)`.
 */
export default function BloccoEditor({
  blocco,
  indice,
  articoloId,
  onCambia,
  onRimuovi,
  onSposta,
  inDrag,
  setInDrag,
}: {
  blocco: Blocco;
  indice: number;
  articoloId: string;
  onCambia: (b: Blocco) => void;
  onRimuovi: () => void;
  onSposta: (daIndice: number, aIndice: number) => void;
  inDrag: number | null;
  setInDrag: (i: number | null) => void;
}) {
  const [caricando, setCaricando] = useState(false);
  const [erroreUpload, setErroreUpload] = useState("");
  const inputFileRef = useRef<HTMLInputElement>(null);

  async function caricaFile(file: File) {
    setCaricando(true);
    setErroreUpload("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`/api/articoli/${articoloId}/immagine`, { method: "POST", body: form });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && j.url && blocco.tipo === "immagine") {
        onCambia({ tipo: "immagine", contenuto: { ...blocco.contenuto, src: j.url } });
      } else {
        setErroreUpload(j.error || "Caricamento non riuscito.");
      }
    } catch {
      setErroreUpload("Errore di rete: riprova.");
    } finally {
      setCaricando(false);
    }
  }

  return (
    <div
      draggable
      onDragStart={() => setInDrag(indice)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (inDrag !== null && inDrag !== indice) onSposta(inDrag, indice);
        setInDrag(null);
      }}
      onDragEnd={() => setInDrag(null)}
      className={`rounded-md border p-4 transition ${
        inDrag === indice ? "opacity-40" : "border-[var(--hairline)]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="cursor-grab text-xs text-[var(--on-surface-3)]" title="Trascina per riordinare">
          ⠿ {TIPO_BLOCCO_LABEL[blocco.tipo]}
        </span>
        <button type="button" onClick={onRimuovi} className="text-xs text-[var(--color-blocked)] hover:underline">
          Rimuovi
        </button>
      </div>

      {blocco.tipo === "paragrafo" || blocco.tipo === "citazione" ? (
        <textarea
          className={inputCls}
          rows={blocco.tipo === "citazione" ? 2 : 4}
          value={blocco.contenuto}
          onChange={(e) => onCambia({ tipo: blocco.tipo, contenuto: e.target.value })}
        />
      ) : blocco.tipo === "titolo" ? (
        <input className={inputCls} value={blocco.contenuto} onChange={(e) => onCambia({ tipo: "titolo", contenuto: e.target.value })} />
      ) : blocco.tipo === "elenco" ? (
        <div className="space-y-2">
          {blocco.contenuto.map((voce, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                value={voce}
                onChange={(e) => {
                  const nuovo = [...blocco.contenuto];
                  nuovo[i] = e.target.value;
                  onCambia({ tipo: "elenco", contenuto: nuovo });
                }}
              />
              <button
                type="button"
                onClick={() => onCambia({ tipo: "elenco", contenuto: blocco.contenuto.filter((_, j) => j !== i) })}
                className="shrink-0 text-xs text-[var(--color-blocked)]"
              >
                ✕
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => onCambia({ tipo: "elenco", contenuto: [...blocco.contenuto, ""] })}>
            + voce
          </Button>
        </div>
      ) : blocco.tipo === "immagine" ? (
        <div>
          {blocco.contenuto.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={blocco.contenuto.src} alt={blocco.contenuto.alt} className="mb-2 max-h-48 rounded border border-[var(--hairline)]" />
          ) : null}
          <input
            ref={inputFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) caricaFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => inputFileRef.current?.click()} disabled={caricando}>
              {caricando ? "Carico…" : blocco.contenuto.src ? "Sostituisci immagine" : "Carica immagine"}
            </Button>
            {erroreUpload ? <span className="text-xs text-[var(--color-blocked)]">{erroreUpload}</span> : null}
          </div>
          <div className="mt-2">
            <Label>Testo alternativo (alt)</Label>
            <input
              className={inputCls}
              value={blocco.contenuto.alt}
              onChange={(e) => onCambia({ tipo: "immagine", contenuto: { ...blocco.contenuto, alt: e.target.value } })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

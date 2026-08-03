"use client";

import { useEffect, useState } from "react";
import type { ContenutoDTO } from "@/components/piano/ContenutoCard";
import { Button, Badge, Banner } from "@/components/ui";
import type { QualitaImmagine } from "@/lib/higgsfield-shared";
import { QUALITA_LABEL } from "@/lib/higgsfield-shared";

type VarianteDTO = {
  id: string;
  contenuto_id: string;
  indice: number;
  prompt: string;
  angolo_visivo: string | null;
  asset_url: string | null;
  provider: string | null;
  costo_crediti: number | null;
  costo_eur: number | null;
  stato: "da_generare" | "in_corso" | "pronta" | "approvata" | "scartata" | "errore";
  errore: string | null;
};

type Anteprima = {
  qualita: QualitaImmagine;
  qualitaLabel: string;
  costo: { crediti: number; eur: number };
  varianti: { indice: number; angoloVisivo: string }[];
};

const COLORE: Record<VarianteDTO["stato"], string> = {
  da_generare: "var(--on-surface-3)",
  in_corso: "var(--color-wip)",
  pronta: "var(--color-live)",
  approvata: "var(--color-live)",
  scartata: "var(--color-blocked)",
  errore: "var(--color-blocked)",
};

export default function VariantiPanel({
  contenuto,
  puoLanciare,
  onCambiato,
}: {
  contenuto: ContenutoDTO;
  puoLanciare: boolean;
  onCambiato: () => void;
}) {
  const [varianti, setVarianti] = useState<VarianteDTO[] | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [qualita, setQualita] = useState<QualitaImmagine>("2k_high");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [riprovando, setRiprovando] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/contenuti/${contenuto.id}/varianti`);
      const j = (await r.json()) as { varianti?: VarianteDTO[] };
      setVarianti(j.varianti ?? []);
      setCaricando(false);
    })();
  }, [contenuto.id]);

  async function chiediAnteprima() {
    setErrore("");
    const r = await fetch(`/api/contenuti/${contenuto.id}/varianti/genera`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qualita, conferma: false }),
    });
    const j = (await r.json()) as Anteprima & { error?: string };
    if (r.ok) setAnteprima(j);
    else setErrore(j.error || "Anteprima non riuscita.");
  }

  async function confermaGenerazione() {
    setBusy(true);
    setErrore("");
    try {
      const r = await fetch(`/api/contenuti/${contenuto.id}/varianti/genera`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qualita, conferma: true }),
      });
      const j = (await r.json()) as { varianti?: VarianteDTO[]; error?: string };
      if (r.ok && j.varianti) {
        setVarianti(j.varianti);
        setAnteprima(null);
        onCambiato();
      } else {
        setErrore(j.error || "Generazione non riuscita.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function approva(varianteId: string) {
    setBusy(true);
    setErrore("");
    const r = await fetch(`/api/contenuti/${contenuto.id}/varianti/${varianteId}/approva`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (r.ok) {
      setVarianti((prev) => prev?.map((v) => (v.id === varianteId ? { ...v, stato: "approvata" } : v)) ?? null);
      onCambiato();
    } else setErrore(j.error || "Approvazione variante non riuscita.");
  }

  async function scarta(varianteId: string) {
    setBusy(true);
    const r = await fetch(`/api/contenuti/${contenuto.id}/varianti/${varianteId}/scarta`, { method: "POST" });
    setBusy(false);
    if (r.ok) setVarianti((prev) => prev?.map((v) => (v.id === varianteId ? { ...v, stato: "scartata" } : v)) ?? null);
  }

  /** Chiude il vicolo cieco: nessuna variante è utilizzabile, si cancellano e si riparte da capo. */
  async function riprova() {
    setRiprovando(true);
    setErrore("");
    const r = await fetch(`/api/contenuti/${contenuto.id}/varianti/riprova`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setRiprovando(false);
    if (r.ok) {
      setVarianti([]);
      onCambiato();
    } else {
      setErrore(j.error || "Non è stato possibile ritentare.");
    }
  }

  if (caricando) return <p className="mt-4 text-xs text-[var(--on-surface-3)]">Carico le varianti…</p>;

  if (varianti && varianti.length > 0) {
    const nessunaUtilizzabile = varianti.every((v) => v.stato !== "pronta" && v.stato !== "approvata");
    return (
      <div className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {varianti.map((v) => (
            <div key={v.id} className="rounded-md border border-[var(--hairline)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-[var(--on-surface-3)]">Variante {v.indice}</span>
                <Badge colore={COLORE[v.stato]}>{v.stato}</Badge>
              </div>
              <p className="text-xs text-[var(--on-surface-2)]">{v.angolo_visivo}</p>
              {v.asset_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.asset_url} alt={`Variante ${v.indice}`} className="mt-2 w-full rounded border border-[var(--hairline)]" />
              ) : null}
              {v.errore ? <p className="mt-2 text-xs text-[var(--color-blocked)]">{v.errore}</p> : null}
              {v.stato === "pronta" && puoLanciare ? (
                <div className="mt-2 flex gap-1.5">
                  <Button onClick={() => approva(v.id)} disabled={busy}>
                    Approva
                  </Button>
                  <Button variant="ghost" onClick={() => scarta(v.id)} disabled={busy}>
                    Scarta
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {puoLanciare && nessunaUtilizzabile ? (
          <div className="mt-3">
            <Button variant="ghost" onClick={riprova} disabled={busy || riprovando}>
              {riprovando ? "Ripristino…" : "Nessuna variante riuscita — cancella e riprova"}
            </Button>
          </div>
        ) : null}
        {errore ? <p className="mt-2 text-xs text-[var(--color-blocked)]">{errore}</p> : null}
      </div>
    );
  }

  if (!puoLanciare) {
    return <p className="mt-4 text-xs text-[var(--on-surface-3)]">Nessuna variante ancora generata.</p>;
  }

  return (
    <div className="mt-4">
      {!anteprima ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={qualita}
            onChange={(e) => setQualita(e.target.value as QualitaImmagine)}
            className="rounded-md border border-[var(--hairline-strong)] px-2 py-1.5 text-xs"
          >
            {(Object.keys(QUALITA_LABEL) as QualitaImmagine[]).map((q) => (
              <option key={q} value={q}>
                {QUALITA_LABEL[q]}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={chiediAnteprima}>
            Calcola costo e genera 3 varianti
          </Button>
        </div>
      ) : (
        <Banner tono="attenzione" titolo={`Gate di costo — ${anteprima.qualitaLabel}`}>
          <p>
            3 varianti × {anteprima.costo.crediti / 3} crediti = <strong>{anteprima.costo.crediti} crediti</strong> ≈{" "}
            <strong>€{anteprima.costo.eur.toFixed(2)}</strong> (1 credito = €0,033, misurato).
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {anteprima.varianti.map((v) => (
              <li key={v.indice}>
                Variante {v.indice}: {v.angoloVisivo}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button onClick={confermaGenerazione} disabled={busy}>
              {busy ? "Genero…" : `Conferma e spendi €${anteprima.costo.eur.toFixed(2)}`}
            </Button>
            <Button variant="ghost" onClick={() => setAnteprima(null)} disabled={busy}>
              Annulla
            </Button>
          </div>
        </Banner>
      )}
      {errore ? <p className="mt-2 text-xs text-[var(--color-blocked)]">{errore}</p> : null}
    </div>
  );
}

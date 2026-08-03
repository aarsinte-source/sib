"use client";

import { useEffect, useState, useCallback } from "react";
import type { Ruolo } from "@/lib/ruoli";
import { Banner, Card, Eyebrow, H2, Button, Badge, inputCls } from "@/components/ui";
import { metaRiga } from "@/components/piano/format";
import type { ContenutoDTO } from "@/components/piano/ContenutoCard";

type Pubblicazione = {
  id: string;
  contenuto_id: string;
  canale: string;
  programmato_per: string | null;
  stato: "in_coda" | "inviato" | "pubblicato" | "fallito" | "bloccato";
  motivo_blocco: string | null;
  created_at: string;
};

type StatoGlobale = { ok: boolean; motivo?: string } | null;

const COLORE_PUB: Record<Pubblicazione["stato"], string> = {
  in_coda: "var(--color-wip)",
  inviato: "var(--color-ready)",
  pubblicato: "var(--color-live)",
  fallito: "var(--color-blocked)",
  bloccato: "var(--color-blocked)",
};

export default function CalendarioClient({ ruolo }: { ruolo: Ruolo }) {
  const [statoSchema, setStatoSchema] = useState<StatoGlobale>(null);
  const [coda, setCoda] = useState<Pubblicazione[]>([]);
  const [pronti, setPronti] = useState<ContenutoDTO[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [quando, setQuando] = useState<Record<string, string>>({});
  const [errore, setErrore] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const puoProgrammare = ruolo === "mauro" || ruolo === "marketing";

  const ricarica = useCallback(async () => {
    setCaricando(true);
    const [rc, rp] = await Promise.all([fetch("/api/calendario"), fetch("/api/piano?stato=prodotto")]);
    const jc = (await rc.json()) as { coda?: Pubblicazione[] };
    const jp = (await rp.json()) as { contenuti?: ContenutoDTO[] };
    setCoda(jc.coda ?? []);
    setPronti(jp.contenuti ?? []);
    setCaricando(false);
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/stato");
      const j = (await r.json()) as { schema: { ok: boolean; motivo?: string } };
      setStatoSchema(j.schema);
      if (j.schema.ok) await ricarica();
      else setCaricando(false);
    })();
  }, [ricarica]);

  const inCoda = new Set(coda.map((p) => p.contenuto_id));

  async function programma(c: ContenutoDTO) {
    const q = quando[c.id];
    if (!q) {
      setErrore("Scegli data e ora prima di mettere in coda.");
      return;
    }
    setBusyId(c.id);
    setErrore("");
    const r = await fetch("/api/calendario/programma", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contenutoId: c.id, canale: c.canale, quando: new Date(q).toISOString() }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (r.ok) await ricarica();
    else setErrore(j.error || "Messa in coda non riuscita.");
  }

  if (statoSchema === null) return <p className="text-sm text-[var(--on-surface-3)]">Verifico il database…</p>;
  if (!statoSchema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {statoSchema.motivo}
      </Banner>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <Eyebrow>Pronti da programmare</Eyebrow>
        <H2>Contenuti con variante scelta</H2>
        {caricando ? (
          <p className="mt-4 text-sm text-[var(--on-surface-3)]">Carico…</p>
        ) : pronti.filter((c) => !inCoda.has(c.id)).length === 0 ? (
          <p className="mt-4 text-sm text-[var(--on-surface-3)]">Niente in attesa: approva una variante in Creatività.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {pronti
              .filter((c) => !inCoda.has(c.id))
              .map((c) => (
                <Card key={c.id}>
                  <p className="text-xs text-[var(--on-surface-3)]">{metaRiga(c)}</p>
                  <p className="display mt-1 text-base">{c.hook}</p>
                  {puoProgrammare ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        className={`${inputCls} w-auto`}
                        value={quando[c.id] ?? ""}
                        onChange={(e) => setQuando((q) => ({ ...q, [c.id]: e.target.value }))}
                      />
                      <Button onClick={() => programma(c)} disabled={busyId === c.id}>
                        {busyId === c.id ? "…" : "Metti in coda"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--on-surface-3)]">Solo Mauro o Marketing possono programmare.</p>
                  )}
                </Card>
              ))}
          </div>
        )}
        {errore ? <p className="mt-2 text-sm text-[var(--color-blocked)]">{errore}</p> : null}
      </section>

      <section className="border-t border-[var(--hairline)] pt-8">
        <Eyebrow>Coda di pubblicazione</Eyebrow>
        <H2>Verso Zernio</H2>
        {coda.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--on-surface-3)]">Coda vuota.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {coda.map((p) => (
              <li key={p.id} className="rounded-md border border-[var(--hairline)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {p.canale} · {p.programmato_per ? new Date(p.programmato_per).toLocaleString("it-IT") : "—"}
                  </span>
                  <Badge colore={COLORE_PUB[p.stato]}>{p.stato}</Badge>
                </div>
                {p.motivo_blocco ? <p className="mt-1.5 text-xs text-[var(--color-blocked)]">{p.motivo_blocco}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import type { Ruolo } from "@/lib/ruoli";
import { Banner, Card, Badge } from "@/components/ui";
import { metaRiga, labelStato } from "@/components/piano/format";
import type { ContenutoDTO } from "@/components/piano/ContenutoCard";
import VariantiPanel from "@/components/creativita/VariantiPanel";

type StatoGlobale = { ok: boolean; motivo?: string } | null;

const STATI = ["approvato", "in_produzione", "errore"] as const;

export default function CreativitaClient({ ruolo }: { ruolo: Ruolo }) {
  const [statoSchema, setStatoSchema] = useState<StatoGlobale>(null);
  const [contenuti, setContenuti] = useState<ContenutoDTO[]>([]);
  const [caricando, setCaricando] = useState(true);

  const ricarica = useCallback(async () => {
    setCaricando(true);
    const risposte = await Promise.all(STATI.map((s) => fetch(`/api/piano?stato=${s}`).then((r) => r.json())));
    const tutti: ContenutoDTO[] = risposte.flatMap((j) => (Array.isArray(j.contenuti) ? j.contenuti : []));
    tutti.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    setContenuti(tutti);
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

  if (statoSchema === null) return <p className="text-sm text-[var(--on-surface-3)]">Verifico il database…</p>;
  if (!statoSchema.ok) {
    return (
      <Banner tono="attenzione" titolo="Database non ancora inizializzato">
        {statoSchema.motivo}
      </Banner>
    );
  }

  const puoLanciare = ruolo === "mauro" || ruolo === "marketing";

  return (
    <div className="space-y-5">
      {!puoLanciare ? (
        <Banner tono="info" titolo="Ruolo di sola visualizzazione qui">
          Il ruolo &ldquo;dipendente&rdquo; può proporre e vedere, ma generare varianti spende
          crediti: solo Mauro o Marketing possono lanciarla.
        </Banner>
      ) : null}

      {caricando ? (
        <p className="text-sm text-[var(--on-surface-3)]">Carico…</p>
      ) : contenuti.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-2)]">
            Nessun contenuto approvato in attesa di creatività. Approva un contenuto in{" "}
            <strong>Piano</strong> per vederlo qui.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {contenuti.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--on-surface-3)]">{metaRiga(c)}</p>
                  <p className="display mt-1 text-lg">{c.hook}</p>
                </div>
                <Badge>{labelStato(c.stato)}</Badge>
              </div>
              <VariantiPanel contenuto={c} puoLanciare={puoLanciare} onCambiato={ricarica} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import { schemaInizializzato } from "@/lib/supabase";
import { listaCandidati, SchemaNotInitializedError, type Candidato } from "@/lib/dati";
import { Eyebrow, H1, Banner, Card, Badge } from "@/components/ui";

export const metadata = { title: "Outreach" };

type RisultatoCandidati = { ok: true; candidati: Candidato[] } | { ok: false; errore: string };

/** Nessun JSX qui dentro: solo dati o errore. Il rendering avviene fuori dal try/catch. */
async function caricaCandidati(): Promise<RisultatoCandidati> {
  try {
    return { ok: true, candidati: await listaCandidati(50) };
  } catch (e) {
    if (e instanceof SchemaNotInitializedError) return { ok: false, errore: e.message };
    return { ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto." };
  }
}

export default async function OutreachPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  const schema = await schemaInizializzato();
  const risultato = schema.ok ? await caricaCandidati() : null;

  return (
    <div>
      <Eyebrow>Sola lettura</Eyebrow>
      <H1>Outreach</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Specchio dei candidati scoperti dal motore di discovery. La verità operativa vive nello
        SQLite del motore outreach: qui arriva la copia, per consultazione — non è la fonte.
      </p>

      <div className="mt-6">
        {!schema.ok ? (
          <Banner tono="attenzione" titolo="Database non ancora inizializzato">
            {schema.motivo}
          </Banner>
        ) : !risultato?.ok ? (
          <Banner tono="attenzione" titolo="Tabella non pronta">
            {risultato?.errore}
          </Banner>
        ) : risultato.candidati.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-3)]">Nessun candidato ancora sincronizzato in questa tabella.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {risultato.candidati.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">@{c.username}</p>
                  <Badge>{c.tipo ?? "incerto"}</Badge>
                </div>
                {c.citta ? <p className="mt-1 text-xs text-[var(--on-surface-3)]">{c.citta}</p> : null}
                {c.hook ? <p className="mt-2 text-sm text-[var(--on-surface-2)]">{c.hook}</p> : null}
                <p className="mt-2 text-xs text-[var(--on-surface-3)]">Stato: {c.stato}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

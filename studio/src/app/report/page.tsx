import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import { schemaInizializzato } from "@/lib/supabase";
import { listaReport, SchemaNotInitializedError, type Report } from "@/lib/dati";
import { Eyebrow, H1, Banner, Card, Badge } from "@/components/ui";

export const metadata = { title: "Report" };

type RisultatoReport = { ok: true; report: Report[] } | { ok: false; errore: string };

/** Nessun JSX qui dentro: solo dati o errore. Il rendering avviene fuori dal try/catch. */
async function caricaReport(): Promise<RisultatoReport> {
  try {
    return { ok: true, report: await listaReport() };
  } catch (e) {
    if (e instanceof SchemaNotInitializedError) return { ok: false, errore: e.message };
    return { ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto." };
  }
}

export default async function ReportPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  const schema = await schemaInizializzato();
  const risultato = schema.ok ? await caricaReport() : null;

  return (
    <div>
      <Eyebrow>Passo 6 · lunedì 09:00</Eyebrow>
      <H1>Report</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Il report settimanale è schedulato lato motore esterno (non in questa app). Qui si consulta
        lo storico. I canali senza dati vanno dichiarati come &ldquo;spenti&rdquo;, mai mostrati come
        zeri silenziosi.
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
        ) : risultato.report.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-3)]">Nessun report ancora generato.</p>
        ) : (
          <div className="space-y-4">
            {risultato.report.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {r.tipo} · {r.periodo_da} → {r.periodo_a}
                  </p>
                  {r.inviato_il ? <Badge colore="var(--color-live)">Inviato</Badge> : <Badge colore="var(--color-wip)">Non inviato</Badge>}
                </div>
                {r.canali_spenti && r.canali_spenti.length > 0 ? (
                  <p className="mt-2 text-xs text-[var(--color-wip)]">Canali spenti: {r.canali_spenti.join(", ")}</p>
                ) : null}
                {r.markdown ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--on-surface-2)]">{r.markdown.slice(0, 400)}</p> : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

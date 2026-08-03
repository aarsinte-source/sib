import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import { quadroFasi, STATO_FASE_COLORE, STATO_FASE_LABEL } from "@/lib/fasi";
import { Badge, Banner, Card, Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Produzione" };
export const dynamic = "force-dynamic";

/**
 * La catena di produzione: sette fasi, una dopo l'altra.
 *
 * Perché una pagina sola e non sette voci di menù: perché la domanda vera di
 * chi entra non è «dove sta la funzione X», è «a che punto siamo». Sette voci
 * di menù rispondono alla prima domanda e non alla seconda, e chi le guarda
 * non ha modo di sapere che la sesta è spenta perché la quinta non è finita.
 *
 * Le fasi bloccate restano VISIBILI e spente, con scritto cosa manca. Nascondere
 * significherebbe lasciare qualcuno a cercare una funzione che c'è.
 */
export default async function ProduzionePage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  const { fasi, correnteId, coda } = await quadroFasi();
  const fatte = fasi.filter((f) => f.stato === "fatta").length;

  return (
    <div>
      <Eyebrow>La catena</Eyebrow>
      <H1>Produzione</H1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-2)]">
        Sette fasi, in ordine. Ognuna dice cosa le serve per partire e come si misura se è finita.
        Lo stato non è memorizzato: è contato adesso dal database — uno stato salvato prima o poi
        mente.
      </p>

      <div className="mt-4 flex items-center gap-3 text-sm text-[var(--on-surface-3)]">
        <span>{fatte} fasi su {fasi.length} concluse</span>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--accento)] transition-all"
            style={{ width: `${(fatte / fasi.length) * 100}%` }}
          />
        </div>
      </div>

      {!coda.esecutoreVivo && coda.nota && (
        <div className="mt-6">
          <Banner tono="attenzione" titolo="La catena non può girare da sola">
            {coda.nota}
          </Banner>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {fasi.map((f) => {
          const bloccata = f.stato === "bloccata";
          const corrente = f.id === correnteId;
          return (
            <Card
              key={f.id}
              className={
                corrente
                  ? "border-[var(--accento)] ring-1 ring-[var(--accento)]"
                  : bloccata
                    ? "opacity-60"
                    : ""
              }
            >
              <div className="flex flex-wrap items-start gap-4">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                  style={{ background: STATO_FASE_COLORE[f.stato] }}
                >
                  {f.numero}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.titolo}</span>
                    <Badge colore={STATO_FASE_COLORE[f.stato]}>{STATO_FASE_LABEL[f.stato]}</Badge>
                    {corrente && !bloccata && (
                      <span className="text-xs text-[var(--accento)]">← sei qui</span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm text-[var(--on-surface-2)]">{f.cosa}</p>

                  <div className="mt-2 text-sm">
                    <span className="text-[var(--on-surface-3)]">Stato: </span>
                    <span>{f.misura}</span>
                  </div>

                  {bloccata && f.manca.length > 0 && (
                    <div className="mt-2 text-sm text-[var(--on-surface-3)]">
                      Aspetta: {f.manca.join(", ")}.
                    </div>
                  )}

                  {!bloccata && (
                    <div className="mt-3">
                      <Link
                        href={f.percorso}
                        className="inline-flex items-center rounded-md border border-[var(--bordo)] px-3 py-1.5 text-sm hover:border-[var(--accento)] hover:text-[var(--accento)]"
                      >
                        {f.prossimoPasso} →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

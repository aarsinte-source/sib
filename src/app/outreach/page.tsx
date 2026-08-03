import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import { schemaInizializzato } from "@/lib/supabase";
import {
  listaCandidati,
  contaCandidatiPerTipo,
  SchemaNotInitializedError,
  type Candidato,
} from "@/lib/dati";
import { Eyebrow, H1, Banner, Card, Badge } from "@/components/ui";

export const metadata = { title: "Outreach" };

const LIMITE = 200;

type Risultato =
  | { ok: true; candidati: Candidato[]; totali: Record<string, number> }
  | { ok: false; errore: string };

/** Nessun JSX qui dentro: solo dati o errore. Il rendering avviene fuori dal try/catch. */
async function carica(): Promise<Risultato> {
  try {
    const [candidati, totali] = await Promise.all([
      listaCandidati(LIMITE),
      contaCandidatiPerTipo(),
    ]);
    return { ok: true, candidati, totali };
  } catch (e) {
    if (e instanceof SchemaNotInitializedError) return { ok: false, errore: e.message };
    return { ok: false, errore: e instanceof Error ? e.message : "Errore imprevisto." };
  }
}

/**
 * L'ordine non è alfabetico: è quello in cui vale la pena guardarli. Un
 * distributore è la priorità commerciale dichiarata dal cliente; un profilo
 * «non pertinente» è rumore che si tiene solo per non riproporlo domani.
 */
const ORDINE_TIPI = ["distributore", "salone", "incerto", "non-pertinente"] as const;

const ETICHETTA: Record<string, string> = {
  distributore: "Distributori",
  salone: "Saloni",
  incerto: "Da classificare a mano",
  "non-pertinente": "Scartati dalla classificazione",
};

const SPIEGA_GRUPPO: Record<string, string> = {
  distributore: "La priorità commerciale numero uno. Pochi, e vanno guardati uno per uno.",
  salone: "Vanno instradati al distributore della loro zona — o segnalati come zona scoperta.",
  incerto:
    "Il classificatore non ha trovato segnali sufficienti. Non è un errore: è il motore che " +
    "dichiara di non sapere invece di indovinare.",
  "non-pertinente": "Nessun segnale di salone o distribuzione. Restano qui per non riproporli.",
};

function Punteggio({ valore }: { valore: number | null }) {
  if (valore === null) return null;
  // Le soglie sono descrittive, non un giudizio: servono a far vedere a colpo
  // d'occhio dove finisce il gruppo che vale la pena aprire.
  const tono =
    valore >= 55 ? "var(--positivo, #2f7d4f)" : valore >= 35 ? "var(--on-surface-2)" : "var(--on-surface-3)";
  return (
    <span className="shrink-0 tabular-nums text-sm font-medium" style={{ color: tono }}>
      {valore}
    </span>
  );
}

function SchedaCandidato({ c }: { c: Candidato }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">@{c.username}</p>
          {c.nome && c.nome.toLowerCase() !== c.username.toLowerCase() ? (
            <p className="truncate text-xs text-[var(--on-surface-3)]">{c.nome}</p>
          ) : null}
        </div>
        <Punteggio valore={c.score} />
      </div>

      <p className="mt-1 text-xs text-[var(--on-surface-3)]">
        {[c.citta, c.follower ? `${c.follower.toLocaleString("it-IT")} follower` : null]
          .filter(Boolean)
          .join(" · ") || "nessun dato di contesto"}
      </p>

      {c.hook ? (
        <p className="mt-2 text-sm text-[var(--on-surface-2)]">
          {c.hook}
          {c.hook_fonte ? (
            <span className="text-[var(--on-surface-3)]"> — {c.hook_fonte}</span>
          ) : null}
        </p>
      ) : null}

      {/* Il punteggio da solo chiede di essere creduto. La riga che lo spiega
          permette di dissentire — che è l'unico modo in cui un numero calcolato
          da una macchina diventa utile a una persona. */}
      {c.tipo_motivo ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs text-[var(--on-surface-3)] underline decoration-dotted underline-offset-2">
            perché questo punteggio
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-[var(--on-surface-3)]">{c.tipo_motivo}</p>
        </details>
      ) : (
        <p className="mt-2 text-xs italic text-[var(--on-surface-3)]">
          Punteggio senza spiegazione: da verificare a mano.
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--on-surface-3)]">
        Stato: {c.stato}
        {c.scoperto_da ? <span className="opacity-70"> · trovato da «{c.scoperto_da}»</span> : null}
      </p>
    </Card>
  );
}

export default async function OutreachPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  const schema = await schemaInizializzato();
  const risultato = schema.ok ? await carica() : null;

  const mostrati = risultato?.ok ? risultato.candidati.length : 0;
  const totale = risultato?.ok
    ? Object.values(risultato.totali).reduce((a, b) => a + b, 0)
    : 0;
  const nascosti = totale - mostrati;

  return (
    <div>
      <Eyebrow>Sola lettura</Eyebrow>
      <H1>Outreach</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        I candidati trovati dalla discovery su Instagram. La verità operativa vive nel motore
        outreach: qui arriva la copia, per consultazione — non è la fonte. Si aggiorna con{" "}
        <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs">
          python3 ~/alkemia-sheis-backend/sincronizza_candidati.py --scrivi
        </code>
        .
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
        ) : totale === 0 ? (
          <p className="text-sm text-[var(--on-surface-3)]">
            Nessun candidato ancora sincronizzato. La discovery gira nel motore outreach: quando ha
            trovato qualcosa, il comando qui sopra lo porta in questa pagina.
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--on-surface-2)]">
              <strong>{totale}</strong> candidati in archivio ·{" "}
              {ORDINE_TIPI.filter((t) => risultato.totali[t])
                .map((t) => `${risultato.totali[t]} ${ETICHETTA[t].toLowerCase()}`)
                .join(" · ")}
            </p>
            {/* Un taglio che non si dichiara si legge come «non c'è altro». */}
            {nascosti > 0 ? (
              <p className="mt-1 text-xs text-[var(--on-surface-3)]">
                Ne vedi {mostrati}: gli altri {nascosti} restano fuori dal limite di {LIMITE} per
                pagina, ordinati per punteggio decrescente.
              </p>
            ) : null}

            {ORDINE_TIPI.map((tipo) => {
              const gruppo = risultato.candidati.filter((c) => (c.tipo ?? "incerto") === tipo);
              if (gruppo.length === 0) return null;
              return (
                <section key={tipo} className="mt-8">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--on-surface-2)]">
                    {ETICHETTA[tipo]}{" "}
                    <span className="font-normal text-[var(--on-surface-3)]">({gruppo.length})</span>
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs text-[var(--on-surface-3)]">
                    {SPIEGA_GRUPPO[tipo]}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {gruppo.map((c) => (
                      <SchedaCandidato key={c.id} c={c} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

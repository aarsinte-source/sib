import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessione } from "@/lib/auth";
import { diagnostica, type StatoVoce } from "@/lib/diagnostica";
import { contaCandidatiPerTipo, listaCampagne, listaContenuti, listaArticoli } from "@/lib/dati";
import { LAVORI, CREDITO_EUR } from "@/lib/modelli-creativi";
import { Eyebrow, H1, Card, Badge } from "@/components/ui";

export const metadata = { title: "Cruscotto" };
export const dynamic = "force-dynamic";

/**
 * Il cruscotto: che cosa funziona, adesso, e come provarlo da soli.
 *
 * Non è una pagina di riepilogo: è fatta perché una persona possa aprire
 * l'applicazione senza nessuno accanto e capire in trenta secondi che cosa
 * può fare e che cosa no — e soprattutto PERCHÉ no. Su questo progetto quasi
 * tutto ciò che è spento aspetta un accesso, non altro lavoro, e la
 * differenza fra le due cose è tutto il messaggio.
 */

async function numeri() {
  const vuoto = { candidati: 0, perTipo: {} as Record<string, number>, campagne: 0, contenuti: 0, articoli: 0 };
  try {
    const [perTipo, campagne, contenuti, articoli] = await Promise.all([
      contaCandidatiPerTipo().catch(() => ({}) as Record<string, number>),
      listaCampagne().catch(() => []),
      listaContenuti().catch(() => []),
      listaArticoli().catch(() => []),
    ]);
    return {
      perTipo,
      candidati: Object.values(perTipo).reduce((a, b) => a + b, 0),
      campagne: campagne.length,
      contenuti: contenuti.length,
      articoli: articoli.length,
    };
  } catch {
    return vuoto;
  }
}

function Semaforo({ acceso }: { acceso: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: acceso ? "var(--color-ok, #2f7d4f)" : "var(--color-blocked, #b4443c)" }}
    />
  );
}

function Voce({ v }: { v: StatoVoce }) {
  return (
    <li className="flex gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0">
      <Semaforo acceso={v.acceso} />
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {v.nome}{" "}
          <span className="font-normal text-[var(--on-surface-3)]">
            {v.acceso ? "· funziona" : "· fermo"}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-[var(--on-surface-2)]">{v.dettaglio}</p>
        {v.serve ? (
          <p className="mt-1 text-xs text-[var(--on-surface-3)]">
            Serve: {v.serve}
            {v.dipendeDa === "mauro" ? " — lo può dare solo Mauro" : ""}
          </p>
        ) : null}
      </div>
    </li>
  );
}

type Prova = { titolo: string; cosa: string; dove: string; href: string; costo?: string };

const PROVE: Prova[] = [
  {
    titolo: "Guarda i 112 prospect trovati",
    cosa: "Profili italiani veri, cercati su Instagram e classificati in distributori, saloni e da-classificare. Ogni punteggio ha accanto la ragione, apribile.",
    dove: "Outreach",
    href: "/outreach",
    costo: "gratis: sono già stati raccolti",
  },
  {
    titolo: "Costruisci una campagna scrivendola a parole",
    cosa: "Scrivi cosa vuoi in italiano — «far conoscere BABILON ai distributori spagnoli, 25 euro al giorno per due settimane». In quattro secondi esce la campagna intera.",
    dove: "Campagne",
    href: "/campagne",
    costo: "gratis: nessuna spesa pubblicitaria, è una simulazione",
  },
  {
    titolo: "Genera una creatività",
    cosa: "Approva un contenuto del piano e chiedi le tre varianti: le immagini si producono davvero.",
    dove: "Piano → Creatività",
    href: "/piano",
  },
  {
    titolo: "Scrivi un articolo per il sito",
    cosa: "Editor a blocchi, immagini, otto lingue con l'italiano come originale.",
    dove: "Sito",
    href: "/sito",
    costo: "gratis",
  },
];

export default async function CruscottoPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  const [stato, n] = await Promise.all([diagnostica(), numeri()]);
  const accese = stato.nostre.filter((v) => v.acceso).length;

  const costoGrafica = (LAVORI.grafica.crediti * CREDITO_EUR).toFixed(2);
  const costoVideo = (LAVORI["ugc-video"].crediti * CREDITO_EUR).toFixed(2);

  return (
    <div>
      <Eyebrow>SHEis Studio</Eyebrow>
      <H1>Cruscotto</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Che cosa funziona adesso, e che cosa aspetta. Le righe qui sotto non sono scritte a mano:
        ognuna viene da una verifica fatta nel momento in cui hai aperto questa pagina.
      </p>

      {/* I numeri veri, non un riassunto */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "Prospect trovati", v: n.candidati, d: Object.entries(n.perTipo).map(([t, c]) => `${c} ${t}`).join(" · ") || "nessuno ancora" },
          { k: "Campagne costruite", v: n.campagne, d: "nessuna è partita: manca l'account pubblicitario" },
          { k: "Contenuti in piano", v: n.contenuti, d: "da approvare prima di produrli" },
          { k: "Articoli del sito", v: n.articoli, d: "otto lingue, italiano originale" },
        ].map((x) => (
          <Card key={x.k}>
            <p className="text-xs uppercase tracking-wide text-[var(--on-surface-3)]">{x.k}</p>
            <p className="mt-1 text-3xl font-medium tabular-nums">{x.v}</p>
            <p className="mt-1 text-xs text-[var(--on-surface-3)]">{x.d}</p>
          </Card>
        ))}
      </div>

      {/* Cosa provare da soli — è la ragione per cui questa pagina esiste */}
      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--on-surface-2)]">
          Da provare adesso, da solo
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROVE.map((p) => (
            <Card key={p.href + p.titolo}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{p.titolo}</p>
                <Badge>{p.dove}</Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--on-surface-2)]">{p.cosa}</p>
              <p className="mt-2 text-xs text-[var(--on-surface-3)]">
                {p.costo ?? `costa ${costoGrafica} a grafica, ${costoVideo} a video UGC`}
              </p>
              <Link
                href={p.href}
                className="mt-3 inline-block rounded-full border border-[var(--hairline-strong)] px-3 py-1 text-sm"
              >
                Aprilo →
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--on-surface-2)]">
            Quello che dipende da noi{" "}
            <span className="font-normal text-[var(--on-surface-3)]">
              ({accese} su {stato.nostre.length} funziona)
            </span>
          </h2>
          <Card className="mt-3">
            <ul>{stato.nostre.map((v) => <Voce key={v.nome} v={v} />)}</ul>
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--on-surface-2)]">
            Quello che aspetta Mauro
          </h2>
          <p className="mt-1 max-w-prose text-xs text-[var(--on-surface-3)]">
            Non è lavoro arretrato: è costruito, provato e spento. Ognuna di queste righe si accende
            il giorno in cui arriva l&apos;accesso, senza toccare altro.
          </p>
          <Card className="mt-3">
            <ul>{stato.diMauro.map((v) => <Voce key={v.nome} v={v} />)}</ul>
          </Card>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--on-surface-2)]">
          Quanto costa produrre
        </h2>
        <Card className="mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--on-surface-3)]">
                <th className="pb-2 font-medium">Lavoro</th>
                <th className="pb-2 font-medium">Chi lo fa</th>
                <th className="pb-2 text-right font-medium">Costo</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(LAVORI).map(([nome, l]) => (
                <tr key={nome} className="border-t border-[var(--hairline)]">
                  <td className="py-2 pr-3">{l.descrizione.split(".")[0]}</td>
                  <td className="py-2 pr-3 text-[var(--on-surface-2)]">{l.nome_umano}</td>
                  <td className="py-2 text-right tabular-nums">
                    {l.crediti === 0 ? "gratis" : `€${(l.crediti * CREDITO_EUR).toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--on-surface-3)]">
            Prezzi misurati sull&apos;account, non presi da un listino. Le bozze non costano nulla:
            si esplora quanto serve e si rifà con la qualità buona solo la versione scelta.
          </p>
        </Card>
      </section>
    </div>
  );
}

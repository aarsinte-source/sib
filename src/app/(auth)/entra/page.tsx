import { schemaInizializzato } from "@/lib/supabase";
import { getSessione } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, H1, Banner, Eyebrow } from "@/components/ui";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Accedi" };

export default async function EntraPage() {
  const sessione = await getSessione();
  if (sessione) redirect("/piano");

  const schema = await schemaInizializzato();

  // ⚠️ Il modulo di accesso si mostra SEMPRE. Prima veniva nascosto quando lo
  // schema non era pronto: l'avviso spiegava bene il problema e poi lasciava la
  // pagina senza niente da fare. Ma l'accesso di emergenza esiste proprio per
  // quel caso (vedi api/auth/login) — nascondere il modulo lo rendeva
  // irraggiungibile, e chi apriva l'app non poteva nemmeno guardarla.
  //
  // Un avviso deve spiegare il limite, non togliere l'unica via che resta.
  const emergenzaAttiva = !schema.ok && Boolean(process.env.STUDIO_ACCESSO_EMERGENZA);

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>SHEis Studio</Eyebrow>
      <H1>Accedi</H1>

      {!schema.ok && (
        <div className="mt-6">
          <Banner tono="attenzione" titolo="Database non ancora inizializzato">
            {schema.motivo}
            {emergenzaAttiva ? (
              <p className="mt-2">
                Puoi entrare lo stesso con le <strong>credenziali di emergenza</strong> e girare
                l&apos;interfaccia: <strong>nulla verrà salvato</strong> finché il database non è
                acceso. Per accenderlo servono due minuti — un Personal Access Token da{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">
                  supabase.com/dashboard/account/tokens
                </code>
                , poi{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">
                  python3 ~/alkemia-sheis-backend/applica_migrazioni.py --applica
                </code>
                .
              </p>
            ) : (
              <p className="mt-2">
                Applica le migrazioni in{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">
                  ~/alkemia-sheis-backend/migrations/
                </code>{" "}
                e poi crea il primo utente con{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">npm run seed:utente</code>.
              </p>
            )}
          </Banner>
        </div>
      )}

      <Card className="mt-6">
        <LoginForm />
      </Card>
    </div>
  );
}

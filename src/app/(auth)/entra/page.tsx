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

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>SHEis Studio</Eyebrow>
      <H1>Accedi</H1>

      {!schema.ok ? (
        <div className="mt-6">
          <Banner tono="attenzione" titolo="Database non ancora inizializzato">
            {schema.motivo}
            <p className="mt-2">
              L&apos;app è aperta e funziona, ma l&apos;accesso non è disponibile finché gli utenti non
              possono essere letti dal database. Applica le migrazioni in{" "}
              <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">
                ~/alkemia-sheis-backend/migrations/
              </code>{" "}
              e poi crea il primo utente con{" "}
              <code className="rounded bg-[var(--surface-2)] px-1 py-0.5">npm run seed:utente</code>.
            </p>
          </Banner>
        </div>
      ) : (
        <Card className="mt-6">
          <LoginForm />
        </Card>
      )}
    </div>
  );
}

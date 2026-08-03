import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import UtentiClient from "@/components/utenti/UtentiClient";
import { Eyebrow, H1, Banner } from "@/components/ui";

export const metadata = { title: "Utenti" };

export default async function UtentiPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Solo Mauro</Eyebrow>
      <H1>Utenti</H1>
      <div className="mt-6">
        {sessione.ruolo !== "mauro" ? (
          <Banner tono="errore" titolo="Non autorizzato">
            Il ruolo &ldquo;{sessione.ruolo}&rdquo; non può gestire gli utenti. Questo pulsante non è
            nascosto per finta: la richiesta viene rifiutata davvero, qui e sul server.
          </Banner>
        ) : (
          <UtentiClient />
        )}
      </div>
    </div>
  );
}

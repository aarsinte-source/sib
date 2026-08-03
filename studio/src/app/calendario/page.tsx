import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import CalendarioClient from "@/components/calendario/CalendarioClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Calendario" };

export default async function CalendarioPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Passo 5 · uscita</Eyebrow>
      <H1>Calendario</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Coda di pubblicazione verso Zernio. Il linter gira prima di ogni messa in coda. La
        pubblicazione reale è dichiaratamente bloccata finché Zernio non vede account SHEis.
      </p>
      <div className="mt-8">
        <CalendarioClient ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import CreativitaClient from "@/components/creativita/CreativitaClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Creatività" };

export default async function CreativitaPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Passo 4 · le tre varianti</Eyebrow>
      <H1>Creatività</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Su un contenuto approvato partono tre generazioni che differiscono per una variabile
        dichiarata (inquadratura, ambientazione o luce). Gate di costo prima di ogni generazione. Si
        approva LA variante.
      </p>
      <div className="mt-8">
        <CreativitaClient ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

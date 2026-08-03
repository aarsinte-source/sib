import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import RicercaClient from "@/components/ricerca/RicercaClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Analisi di mercato" };

export default async function RicercaPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Fase 1 e 2 · analisi e pilastri</Eyebrow>
      <H1>Analisi di mercato</H1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-2)]">
        Sei piattaforme, organico e pubblicitario, con dati veri. Delle inserzioni si guarda da
        quanti giorni girano: le librerie non pubblicano né spesa né conversioni, ma nessuno tiene
        viva per novanta giorni una campagna che perde. Il piano di cosa verrà interrogato — e cosa
        costa — si vede prima di eseguirlo.
      </p>
      <div className="mt-8">
        <RicercaClient ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

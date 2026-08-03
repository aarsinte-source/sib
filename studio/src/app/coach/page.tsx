import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import CoachClient from "@/components/coach/CoachClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Sales coach" };

export default async function CoachPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Per chi vende</Eyebrow>
      <H1>Sales coach</H1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-2)]">
        Racconta la situazione com&apos;è andata e ottieni cosa dire. Il coach risponde solo con
        quello che è stato insegnato nelle due giornate di formazione alla rete — e quando l&apos;aula
        non è entrata nel merito lo dice, invece di inventare: un agente che ripete in trattativa
        una cosa che nessuno gli ha insegnato è un danno che si scopre davanti al cliente.
      </p>
      <div className="mt-8">
        <CoachClient ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

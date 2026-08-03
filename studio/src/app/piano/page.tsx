import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import PianoClient from "@/components/piano/PianoClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Piano" };

export default async function PianoPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Passo 2 e 3 · il cuore</Eyebrow>
      <H1>Piano editoriale</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Analizza un tema, genera il piano, poi decidi: approva, rifiuta o modifica — a mano o con
        l&apos;AI su una nota.
      </p>
      <div className="mt-8">
        <PianoClient ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

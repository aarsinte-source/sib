import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import ArticoliClient from "@/components/sito/ArticoliClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Sito" };

export default async function SitoPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Impianto onesto</Eyebrow>
      <H1>Sito — articoli</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Il sito è oggi file-based e senza blog: qui nasce la tabella che lo introduce. Il CMS vero e
        la pubblicazione restano un passo separato, non ancora costruito.
      </p>
      <div className="mt-8">
        <ArticoliClient />
      </div>
    </div>
  );
}

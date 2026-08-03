import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessione } from "@/lib/auth";
import DemoClient from "@/components/outreach/DemoClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Demo outreach" };

export default async function DemoOutreachPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>
        <Link href="/outreach" className="hover:underline">
          Outreach
        </Link>{" "}
        · prova
      </Eyebrow>
      <H1>Demo: come scriviamo a un prospect</H1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-2)]">
        Fai tu la parte del distributore e leggi come risponde. Serve a giudicare il tono prima che
        finisca addosso a un contatto vero: un primo messaggio sbagliato non si ritira, e i
        distributori italiani del settore sono qualche centinaio, non qualche migliaio.
      </p>
      <div className="mt-8">
        <DemoClient />
      </div>
    </div>
  );
}

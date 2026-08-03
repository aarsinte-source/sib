import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessione } from "@/lib/auth";
import { Eyebrow, H1, Button, Card } from "@/components/ui";

export const metadata = { title: "Analisi" };

export default async function AnalisiPage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Passo 1 · Analisi di mercato</Eyebrow>
      <H1>Analisi</H1>
      <Card className="mt-6 max-w-xl">
        <p className="text-sm text-[var(--on-surface-2)]">
          L&apos;analisi di mercato vive dentro <strong>Piano</strong>, insieme alla generazione del
          piano editoriale che la usa subito dopo — la SPEC li descrive come due passi (1 e 2), ma nello
          strumento restano nella stessa schermata perché l&apos;analisi è ephemeral: alimenta il piano e
          non va persistita da sola.
        </p>
        <div className="mt-4">
          <Link href="/piano">
            <Button>Vai a Piano</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

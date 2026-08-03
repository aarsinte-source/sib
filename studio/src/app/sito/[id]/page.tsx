import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import EditorArticolo from "@/components/sito/EditorArticolo";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Editor articolo" };

export default async function EditorArticoloPage({ params }: { params: Promise<{ id: string }> }) {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");
  const { id } = await params;

  return (
    <div>
      <Eyebrow>Sito — editor a blocchi</Eyebrow>
      <H1>Modifica articolo</H1>
      <div className="mt-8">
        <EditorArticolo id={id} ruolo={sessione.ruolo} />
      </div>
    </div>
  );
}

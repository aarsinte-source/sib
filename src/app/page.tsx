import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";

// Chi entra vede prima il quadro d'insieme, poi decide dove andare. Prima
// finiva dritto nel piano editoriale: una pagina utile, ma che non dice né
// cosa funziona né cosa aspetta.
export default async function Home() {
  const sessione = await getSessione();
  redirect(sessione ? "/cruscotto" : "/entra");
}

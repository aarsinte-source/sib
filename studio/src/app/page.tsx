import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";

// Chi entra atterra sulla CATENA di produzione, non sullo stato dei sistemi.
// Prima portava al cruscotto: risponde a «cosa è acceso», che è la domanda di
// chi mantiene. Chi lavora ha un'altra domanda — «a che punto siamo, e cosa
// tocca a me adesso» — e le sette fasi rispondono a quella. Lo stato dei
// sistemi resta, a portata di un clic, sotto «Stato».
export default async function Home() {
  const sessione = await getSessione();
  redirect(sessione ? "/produzione" : "/entra");
}

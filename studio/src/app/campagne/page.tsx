import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";
import CampagneClient from "@/components/campagne/CampagneClient";
import { Eyebrow, H1 } from "@/components/ui";

export const metadata = { title: "Campagne" };

export default async function CampagnePage() {
  const sessione = await getSessione();
  if (!sessione) redirect("/entra");

  return (
    <div>
      <Eyebrow>Media buyer su richiesta</Eyebrow>
      <H1>Campagne</H1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-2)]">
        Scrivi in italiano che campagna vuoi: il motore sceglie il modello, costruisce pubblico,
        budget e calendario, e prepara il contenuto esatto che partirebbe per Meta. Ogni campagna
        nasce ferma — SHEis non ha ancora un proprio account pubblicitario — e il motore dice
        esattamente cosa manca invece di fingere un lancio.
      </p>
      <div className="mt-8">
        <CampagneClient puoLanciare={sessione.ruolo === "mauro" || sessione.ruolo === "marketing"} />
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { aggiornaUtente } from "@/lib/dati";
import { hashPassword, richiedeRuolo, RUOLI_ADMIN, RUOLI, type Ruolo } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_ADMIN);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { nome?: string; ruolo?: string; attivo?: boolean; password?: string };

    const patch: { nome?: string; ruolo?: Ruolo; attivo?: boolean; pwd_hash?: string } = {};
    if (typeof body.nome === "string" && body.nome.trim()) patch.nome = body.nome.trim();
    if (typeof body.ruolo === "string" && RUOLI.includes(body.ruolo as Ruolo)) patch.ruolo = body.ruolo as Ruolo;
    if (typeof body.attivo === "boolean") patch.attivo = body.attivo;
    if (typeof body.password === "string" && body.password.length >= 8) patch.pwd_hash = hashPassword(body.password);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nessun campo valido da aggiornare." }, { status: 400 });
    }

    const utente = await aggiornaUtente(id, patch);
    return NextResponse.json({ utente: { ...utente, pwd_hash: undefined } });
  } catch (e) {
    return rispondiErrore(e);
  }
}

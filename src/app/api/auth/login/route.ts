import { NextResponse } from "next/server";
import { getUtentePerEmail, segnaUltimoAccesso } from "@/lib/dati";
import { impostaCookieSessione, verificaPassword } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
    }

    const utente = await getUtentePerEmail(email);
    if (!utente || !utente.attivo || !utente.pwd_hash || !verificaPassword(password, utente.pwd_hash)) {
      return NextResponse.json({ error: "Email o password non corrette." }, { status: 401 });
    }

    await impostaCookieSessione({ id: utente.id, email: utente.email, nome: utente.nome, ruolo: utente.ruolo });
    await segnaUltimoAccesso(utente.id).catch(() => undefined); // non bloccante

    return NextResponse.json({ utente: { id: utente.id, email: utente.email, nome: utente.nome, ruolo: utente.ruolo } });
  } catch (e) {
    return rispondiErrore(e);
  }
}

import { NextResponse } from "next/server";
import { listaUtenti, creaUtente, getUtentePerEmail } from "@/lib/dati";
import { hashPassword, richiedeRuolo, RUOLI_ADMIN, RUOLI, type Ruolo } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/** Gestione utenti — solo Mauro (SPEC.md tabella ruoli). */
export const runtime = "nodejs";

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_ADMIN);
    const utenti = await listaUtenti();
    return NextResponse.json({ utenti: utenti.map((u) => ({ ...u, pwd_hash: undefined })) });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    await richiedeRuolo(RUOLI_ADMIN);
    const body = (await req.json().catch(() => ({}))) as { email?: string; nome?: string; ruolo?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const nome = (body.nome ?? "").trim();
    const ruolo = body.ruolo as Ruolo;
    const password = body.password ?? "";

    if (!email || !nome || !RUOLI.includes(ruolo) || password.length < 8) {
      return NextResponse.json(
        { error: "Servono email, nome, ruolo valido e una password di almeno 8 caratteri." },
        { status: 400 },
      );
    }
    if (await getUtentePerEmail(email)) {
      return NextResponse.json({ error: "Esiste già un utente con questa email." }, { status: 409 });
    }

    const utente = await creaUtente({ email, nome, ruolo, pwdHash: hashPassword(password) });
    return NextResponse.json({ utente: { ...utente, pwd_hash: undefined } });
  } catch (e) {
    return rispondiErrore(e);
  }
}

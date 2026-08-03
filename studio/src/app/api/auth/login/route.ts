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

    // ⚠️ Accesso di emergenza — esiste per un motivo preciso e ha una data di
    // scadenza naturale.
    //
    // Il database non è ancora inizializzato (0 tabelle su 15: il DDL richiede un
    // Personal Access Token Supabase che oggi manca). Senza `sheis_utenti` la
    // pagina di accesso si apriva ma NON lasciava entrare nessuno: uno strumento
    // che non si può nemmeno guardare non si può nemmeno correggere.
    //
    // Questo ramo si attiva SOLO se lo schema non è inizializzato, e SOLO con
    // una credenziale dichiarata in `STUDIO_ACCESSO_EMERGENZA` (formato
    // `email:password`). Nel momento in cui le tabelle esistono, smette di
    // funzionare da solo — non è un lucchetto da ricordarsi di togliere.
    const emergenza = process.env.STUDIO_ACCESSO_EMERGENZA;
    if (emergenza) {
      const [emailEm, pwdEm] = emergenza.split(":");
      if (emailEm && pwdEm && email === emailEm.trim().toLowerCase() && password === pwdEm) {
        const { schemaInizializzato } = await import("@/lib/supabase");
        const stato = await schemaInizializzato();
        if (!stato.ok) {
          console.warn(
            "[login] ACCESSO DI EMERGENZA usato: il database non è inizializzato. " +
            "Questo ramo si disattiva da solo appena le tabelle sheis_* esistono.",
          );
          await impostaCookieSessione({
            id: "emergenza",
            email: emailEm,
            nome: "Accesso di emergenza",
            ruolo: "mauro",
          });
          return NextResponse.json({
            utente: { id: "emergenza", email: emailEm, nome: "Accesso di emergenza", ruolo: "mauro" },
            avviso:
              "Sei entrato con l'accesso di emergenza perché il database non è ancora " +
              "inizializzato. Puoi guardare l'interfaccia, ma nulla verrà salvato.",
          });
        }
      }
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

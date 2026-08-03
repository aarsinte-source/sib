import { NextResponse } from "next/server";
import { getContenuto, modificaContenutoAI } from "@/lib/dati";
import { openaiJSON, str } from "@/lib/openai";
import { regoleBrandTesto } from "@/lib/brand";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/** Riscrittura guidata dall'AI su nota — l'altra metà di "modifica" (SPEC.md). */
export const runtime = "nodejs";

const SYSTEM = `Sei un copywriter senior del reparto marketing di SHEis Beauty International (hair-care professionale B2B).
${regoleBrandTesto()}
Ti do un post esistente e una nota di modifica. Riscrivi il post tenendo conto della nota.
Mantieni brand, canale, pubblico, lingua e formato del post originale a meno che la nota non chieda esplicitamente di cambiarli.
Rispondi SOLO con JSON nella forma {"angolo":"...","hook":"...","copy":"...","copySecondario":"...","cta":"..."}. Nessun testo fuori dal JSON.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { nota?: string };
    const nota = (body.nota ?? "").trim();

    const contenuto = await getContenuto(id);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });

    const user = `Post attuale:
- brand: ${contenuto.brand}
- canale: ${contenuto.canale}
- pubblico: ${contenuto.pubblico ?? "—"}
- lingua: ${contenuto.lingua} / secondaria: ${contenuto.lingua_secondaria ?? "—"}
- formato: ${contenuto.formato}
- angolo: ${contenuto.angolo}
- hook: ${contenuto.hook}
- copy: ${contenuto.copy}
- copy secondario: ${contenuto.copy_secondario ?? "—"}
- cta: ${contenuto.cta}

Nota di modifica: ${nota || "(nessuna nota specifica: migliora incisività e chiarezza)"}`;

    const raw = (await openaiJSON(SYSTEM, user)) as Record<string, unknown>;

    const aggiornato = await modificaContenutoAI(
      id,
      {
        angolo: str(raw.angolo, contenuto.angolo),
        hook: str(raw.hook, contenuto.hook),
        copy: str(raw.copy, contenuto.copy),
        copy_secondario: str(raw.copySecondario, contenuto.copy_secondario ?? "") || null,
        cta: str(raw.cta, contenuto.cta),
      },
      nota,
      sessione.nome,
      sessione.id,
    );
    return NextResponse.json({ contenuto: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}

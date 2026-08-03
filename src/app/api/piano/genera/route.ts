import { NextResponse } from "next/server";
import { generaJSON, pick, str } from "@/lib/openai";
import { BRANDS, CANALI, FORMATI, LINGUE, PUBBLICI, regoleBrandTesto, BRAND_LABEL } from "@/lib/brand";
import { creaPiano, creaContenuti, type NuovoContenuto } from "@/lib/dati";
import { creaPillar, type NuovoPillar } from "@/lib/pillar";
import { ricerca, ultimaCompletata } from "@/lib/ricerche";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Fase 2 e 3: dai dati reali ai pilastri, e dai pilastri a trenta giorni.
 *
 * PERCHÉ IN DUE PASSAGGI E NON IN UNO
 * -----------------------------------
 * Chiedere a un modello «scrivi trenta post completi di didascalia, script
 * video e testo grafico» in una sola risposta produce due guasti insieme: la
 * risposta si tronca (sono decine di migliaia di caratteri) e la qualità cade
 * dopo i primi cinque, perché il modello inizia a ripetersi.
 *
 * Qui si genera l'IMPALCATURA: per ciascuno dei trenta giorni, quale pilastro,
 * marchio, pubblico, lingua, formato, angolo e gancio. È una risposta corta e
 * densa, che un modello sa tenere fino in fondo. I testi arrivano dopo, a
 * gruppi, da `/api/piano/testi`.
 *
 * ⚠️ IL PIANO NASCE DA UNA RICERCA, NON DAL NULLA. Senza `ricercaId` si prende
 * l'ultima analisi completata; se non ce n'è nessuna si rifiuta. Un piano
 * editoriale scritto senza aver guardato il mercato è un elenco di supposizioni
 * che sembra un piano — e la differenza si scopre solo dopo averlo pubblicato.
 */
export const runtime = "nodejs";

const GIORNI = 30;

function sistemaImpalcatura(pillarDescritti: string[]): string {
  return `Sei il direttore editoriale del reparto marketing di SHEis Beauty International (hair-care professionale B2B, Pineto TE).

${regoleBrandTesto()}

MARCHI DISPONIBILI — usa SOLO questi slug:
${BRANDS.map((b) => `- ${b} (${BRAND_LABEL[b]})`).join("\n")}
Nota: "sheis-beauty" è il marchio OMBRELLO dell'azienda, si usa per contenuti istituzionali e non per parlare di un singolo prodotto.

PILASTRI DI CONTENUTO da rispettare, con la loro quota:
${pillarDescritti.join("\n")}

Costruisci il piano editoriale di ESATTAMENTE ${GIORNI} giorni: un contenuto per giorno, dal giorno 1 al ${GIORNI}.

Regole di distribuzione, tassative:
- Ogni giorno appartiene a UN pilastro, e la distribuzione rispetta le quote dichiarate (30% significa circa 9 giorni su 30).
- Mai due giorni consecutivi sullo stesso pilastro E sullo stesso marchio.
- Mix formati: circa metà "video", il resto fra "carosello" e "statico", con poco "statico" — è il formato misurato più debole sul profilo reale.
- Priorità commerciale ESTERO: almeno metà dei giorni ha pubblico "distributore-estero", in "es" (beachhead Spagna) o "en".
- Trenta angoli DIVERSI. Trenta ganci uguali sono trenta giorni sprecati.

Rispondi SOLO con JSON: {"giorni": [ ...${GIORNI} oggetti... ]}. Ogni oggetto:
- "giorno": numero da 1 a ${GIORNI}
- "pillar": il nome ESATTO di uno dei pilastri sopra
- "canale": instagram|facebook|tiktok|linkedin
- "brand": uno degli slug marchio sopra
- "pubblico": distributore-estero|distributore-italia|salone
- "lingua": it|en|es
- "linguaSecondaria": la seconda lingua della caption bilingue
- "formato": statico|carosello|video|ugc
- "angolo": una riga che riassume l'angolo strategico
- "hook": il gancio, la prima riga che si legge`;
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const body = (await req.json().catch(() => ({}))) as { ricercaId?: string; titolo?: string };

    const r = body.ricercaId ? await ricerca(body.ricercaId) : await ultimaCompletata();
    if (!r) {
      return NextResponse.json(
        {
          error:
            "Serve prima un'analisi di mercato completata. Un piano scritto senza aver guardato il " +
            "mercato è un elenco di supposizioni che sembra un piano.",
        },
        { status: 409 },
      );
    }

    const pillarDati = r.sintesi?.pillar ?? [];
    if (pillarDati.length === 0) {
      return NextResponse.json(
        {
          error:
            `L'analisi «${r.tema}» non ha prodotto pilastri. Rilanciala: senza pilastri i trenta ` +
            "giorni non hanno una struttura da rispettare.",
        },
        { status: 409 },
      );
    }

    /* ── il piano e i suoi pilastri ──────────────────────────────────────── */
    const piano = await creaPiano(body.titolo?.trim() || `30 giorni · ${r.tema}`);

    const nuoviPillar: NuovoPillar[] = pillarDati.map((p, i) => ({
      piano_id: piano.id,
      nome: p.nome,
      descrizione: p.descrizione,
      obiettivo: p.obiettivo,
      quota_pct: p.quota_pct,
      esempi: p.esempi ?? [],
      lessico: p.lessico ?? [],
      ordine: i,
      ricerca_id: r.id,
    }));
    const pillarSalvati = await creaPillar(nuoviPillar);
    const perNome = new Map(pillarSalvati.map((p) => [p.nome.toLowerCase(), p.id]));

    /* ── l'impalcatura dei trenta giorni ─────────────────────────────────── */
    const descritti = pillarDati.map(
      (p) => `- "${p.nome}" (${p.obiettivo}, ${p.quota_pct}% dei giorni): ${p.descrizione}`,
    );

    const utente =
      `Tema dell'analisi: «${r.tema}».\n` +
      `Mercati: ${(r.paesi ?? ["it"]).map((p) => p.toUpperCase()).join(", ")}.\n\n` +
      `Problemi rilevati: ${(r.sintesi?.pain ?? []).join("; ")}\n` +
      `Desideri: ${(r.sintesi?.desideri ?? []).join("; ")}\n` +
      `Lessico reale del mestiere: ${(r.sintesi?.lessico ?? []).join(", ")}\n` +
      `Angoli utilizzabili: ${(r.sintesi?.angoli ?? []).join("; ")}\n` +
      `Cosa sta funzionando adesso: ${(r.sintesi?.cosa_funziona ?? []).join(" | ")}`;

    const { dati: grezzo, motore, ripieghi } = await generaJSON(sistemaImpalcatura(descritti), utente);

    const lista = Array.isArray(grezzo.giorni) ? grezzo.giorni : [];
    if (lista.length === 0) {
      return NextResponse.json(
        { error: "Il piano è tornato vuoto. Riprova: l'analisi resta salvata e non si ripaga." },
        { status: 502 },
      );
    }

    const oggi = new Date();
    const righe: NuovoContenuto[] = lista.slice(0, GIORNI).map((voce, i) => {
      const o = (voce ?? {}) as Record<string, unknown>;
      const giorno = Math.min(GIORNI, Math.max(1, Number(o.giorno) || i + 1));
      const lingua = pick(o.lingua, LINGUE, "en");
      const data = new Date(oggi);
      data.setDate(data.getDate() + giorno);

      return {
        piano_id: piano.id,
        data_pubblicazione: data.toISOString().slice(0, 10),
        canale: pick(o.canale, CANALI, "instagram"),
        brand: pick(o.brand, BRANDS, "sheis-color"),
        pubblico: pick(o.pubblico, PUBBLICI, "distributore-estero"),
        lingua,
        lingua_secondaria: pick(o.linguaSecondaria, LINGUE, lingua === "it" ? "en" : "it"),
        formato: pick(o.formato, FORMATI, "video"),
        angolo: str(o.angolo, "—"),
        hook: str(o.hook, "—"),
        // I testi NON si scrivono qui: arrivano da /api/piano/testi, a gruppi.
        copy: "",
        copy_secondario: null,
        cta: "",
        hashtag: null,
        giorno,
        pillar_id: perNome.get(str(o.pillar).toLowerCase()) ?? null,
        ricerca_id: r.id,
        stato: "in_attesa",
        creato_da: sessione.id,
      } as NuovoContenuto;
    });

    const contenuti = await creaContenuti(righe);

    // Quanti giorni sono finiti su ciascun pilastro DAVVERO, contro la quota
    // chiesta. È la misura che rende il piano criticabile: senza, «rispetta le
    // quote» resta una frase nel prompt che nessuno verifica mai.
    const resa = pillarSalvati.map((p) => {
      const quanti = contenuti.filter((c) => c.pillar_id === p.id).length;
      return {
        nome: p.nome,
        quotaChiesta: p.quota_pct,
        giorniAssegnati: quanti,
        quotaReale: contenuti.length ? Math.round((quanti / contenuti.length) * 100) : 0,
      };
    });

    return NextResponse.json({
      piano,
      pillar: pillarSalvati,
      contenuti,
      resa,
      senzaPillar: contenuti.filter((c) => !c.pillar_id).length,
      ricerca: { id: r.id, tema: r.tema },
      motore,
      ripieghi,
      prossimoPasso:
        "I trenta giorni hanno struttura ma non ancora testi. Ora si generano didascalie, script UGC e testi grafici.",
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}

import { NextResponse } from "next/server";
import { generaJSON, str, strArray } from "@/lib/openai";
import { regoleBrandTesto, BRAND_LABEL, type Brand } from "@/lib/brand";
import { istruzioniMarchio, marchio } from "@/lib/marchi";
import { contenutiDelPiano, aggiornaContenuto, type Contenuto } from "@/lib/dati";
import { pillarDelPiano } from "@/lib/pillar";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Fase 4: i testi. TRE mestieri diversi per ogni contenuto.
 *
 * PERCHÉ TRE CAMPI E NON UNO
 * --------------------------
 * Finora `copy` teneva tutto. Ma la didascalia di un post, il parlato di un
 * video e le parole stampate SULL'immagine sono tre cose con tre lunghezze e
 * tre grammatiche diverse:
 *
 *   · la didascalia si legge sotto, può essere lunga, porta gli hashtag;
 *   · lo script UGC si ascolta, va detto ad alta voce, dura secondi;
 *   · il testo grafico si legge in un colpo d'occhio: sei parole, non sessanta.
 *
 * Schiacciarli in un campo solo obbliga chi genera la creativa a indovinare
 * quale pezzo di `copy` vada stampato sull'immagine. E indovina male, perché
 * una didascalia da 400 caratteri sopra una grafica non si legge — si vede solo
 * a creativa già pagata.
 *
 * ⚠️ SI LAVORA A GRUPPI. Trenta contenuti × tre testi in una risposta sola si
 * troncano a metà. Il gruppo di default è sei: abbastanza da fare progresso
 * visibile, poco abbastanza da arrivare in fondo.
 */
export const runtime = "nodejs";

const GRUPPO = 6;

const SISTEMA = `Sei il copywriter del reparto marketing di SHEis Beauty International (hair-care professionale B2B). Il pubblico sono distributori e saloni, MAI il consumatore finale.

{regole}

{marchi}

Per OGNI contenuto che ti viene dato, scrivi TRE testi diversi, con tre mestieri diversi:

1. "copy" — la DIDASCALIA del post, nella lingua principale indicata. Struttura: gancio sulla prima riga, corpo, chiusura. Da 350 a 700 caratteri. Deve suonare come parla un'azienda a un professionista, non come un annuncio.
2. "copySecondario" — la stessa didascalia nella lingua secondaria indicata. Non è una traduzione letterale: è la stessa cosa detta come la direbbe qualcuno di quella lingua.
3. "cta" — una riga di chiamata all'azione, fra quelle ammesse.
4. "hashtag" — da 8 a 14, misti generici di categoria e specifici professionali, nelle lingue del post.
5. "copyUgc" — SOLO se il formato è "video" o "ugc". È il PARLATO: quello che una persona dice in camera, in 15-25 secondi. Battute brevi, come si parla, non come si scrive. Niente hashtag, niente emoji. Se il formato non è video né ugc, metti stringa vuota.
6. "copyGrafica" — le parole che vanno STAMPATE sull'immagine. Un oggetto {{"titolo": "…", "sottotitolo": "…", "cta": "…"}}. Il titolo è da 2 a 6 parole. Il sottotitolo al massimo 10. La cta al massimo 4. Se non ci sta in un colpo d'occhio, è sbagliato.

Rispondi SOLO con JSON: {{"testi": [{{"id": "<l'id ricevuto>", "copy": "…", "copySecondario": "…", "cta": "…", "hashtag": ["…"], "copyUgc": "…", "copyGrafica": {{"titolo": "…", "sottotitolo": "…", "cta": "…"}}}}]}}`;

function marchiCoinvolti(contenuti: Contenuto[]): string {
  const usati = [...new Set(contenuti.map((c) => c.brand))];
  return (
    "MARCHI COINVOLTI IN QUESTO GRUPPO — rispettane il registro:\n" +
    usati
      .map((b) => {
        const m = marchio(b);
        return m
          ? `- ${BRAND_LABEL[b as Brand] ?? b} (${m.tipo}): ${m.descrizione} Si usa per: ${m.quando_si_usa}`
          : `- ${b}`;
      })
      .join("\n") +
    "\n\n⚠️ Il nome del marchio si scrive SEMPRE nella grafia esatta sopra. Il logotipo non si descrive mai a parole nel copy."
  );
}

export async function POST(req: Request) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const body = (await req.json().catch(() => ({}))) as {
      pianoId?: string;
      ids?: string[];
      quanti?: number;
    };

    if (!body.pianoId) {
      return NextResponse.json({ error: "Manca il piano su cui lavorare." }, { status: 400 });
    }

    const [tutti, pillar] = await Promise.all([
      contenutiDelPiano(body.pianoId),
      pillarDelPiano(body.pianoId),
    ]);
    const perId = new Map(pillar.map((p) => [p.id, p]));

    // Chi lavorare adesso: quelli richiesti, oppure i primi senza didascalia.
    // Non si rigenerano i testi già scritti se nessuno lo ha chiesto: sarebbe
    // buttare via un lavoro che qualcuno può aver già corretto a mano.
    const daFare = body.ids?.length
      ? tutti.filter((c) => body.ids!.includes(c.id))
      : tutti.filter((c) => !(c.copy ?? "").trim()).slice(0, body.quanti ?? GRUPPO);

    if (daFare.length === 0) {
      return NextResponse.json({
        fatti: 0,
        restano: 0,
        completo: true,
        messaggio: "Tutti i contenuti del piano hanno già i loro testi.",
      });
    }

    const elenco = daFare
      .map((c) => {
        const p = c.pillar_id ? perId.get(c.pillar_id) : null;
        return [
          `--- id: ${c.id}`,
          `giorno ${c.giorno ?? "?"} · ${c.canale} · formato ${c.formato}`,
          `marchio: ${c.brand} · pubblico: ${c.pubblico ?? "distributore-estero"}`,
          `lingua principale: ${c.lingua} · lingua secondaria: ${c.lingua_secondaria ?? "en"}`,
          p ? `pilastro: "${p.nome}" (${p.obiettivo}) — ${p.descrizione}` : "pilastro: nessuno",
          p?.lessico?.length ? `parole del pilastro: ${p.lessico.join(", ")}` : "",
          `angolo: ${c.angolo}`,
          `gancio già deciso: ${c.hook}`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const sistema = SISTEMA.replace("{regole}", regoleBrandTesto()).replace(
      "{marchi}",
      marchiCoinvolti(daFare),
    );

    const { dati: grezzo, motore, ripieghi } = await generaJSON(
      sistema,
      `Scrivi i testi per questi ${daFare.length} contenuti:\n\n${elenco}`,
    );

    const testi = Array.isArray(grezzo.testi) ? grezzo.testi : [];
    const perContenuto = new Map<string, Record<string, unknown>>();
    for (const t of testi) {
      const o = (t ?? {}) as Record<string, unknown>;
      const id = str(o.id);
      if (id) perContenuto.set(id, o);
    }

    const aggiornati: string[] = [];
    const saltati: string[] = [];

    for (const c of daFare) {
      const o = perContenuto.get(c.id);
      if (!o || !str(o.copy)) {
        // Un contenuto che il modello ha saltato NON si riempie con un
        // segnaposto: resterebbe indistinguibile da uno scritto male, e
        // qualcuno lo approverebbe.
        saltati.push(c.id);
        continue;
      }
      const grafica = (o.copyGrafica ?? null) as Record<string, unknown> | null;
      const vuoleUgc = c.formato === "video" || c.formato === "ugc";

      await aggiornaContenuto(c.id, {
        copy: str(o.copy),
        copy_secondario: str(o.copySecondario) || null,
        cta: str(o.cta, "Scrivici per saperne di più."),
        hashtag: strArray(o.hashtag).slice(0, 15),
        copy_ugc: vuoleUgc ? str(o.copyUgc) || null : null,
        copy_grafica: grafica
          ? {
              titolo: str(grafica.titolo),
              sottotitolo: str(grafica.sottotitolo),
              cta: str(grafica.cta),
            }
          : null,
      });
      aggiornati.push(c.id);
    }

    const restanoDopo = tutti.filter(
      (c) => !(c.copy ?? "").trim() && !aggiornati.includes(c.id),
    ).length;

    return NextResponse.json({
      fatti: aggiornati.length,
      saltati,
      restano: restanoDopo,
      completo: restanoDopo === 0,
      motore,
      ripieghi,
      messaggio:
        restanoDopo === 0
          ? "Tutti i contenuti hanno i loro testi."
          : `${aggiornati.length} scritti, ne restano ${restanoDopo}. Si procede a gruppi di ${GRUPPO}: trenta contenuti in una risposta sola si troncherebbero a metà.`,
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}

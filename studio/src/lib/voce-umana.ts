import "server-only";

/**
 * La voce con cui SHEis scrive a un prospect. Non è "tono di marca": è il modo
 * in cui scrive UNA PERSONA.
 *
 * PERCHÉ SERVE UN FILE APPOSTA
 * ----------------------------
 * Un modello a cui si chiede un messaggio commerciale produce, per difetto,
 * qualcosa che si riconosce a colpo d'occhio: paragrafi compatti, virgole a
 * ogni respiro, trattini lunghi in mezzo alle frasi, e un tono che vende. Un
 * distributore di prodotti per capelli riceve quel messaggio dieci volte al
 * mese e lo archivia senza leggerlo, perché sa già cos'è.
 *
 * Le regole qui sotto non sono estetica: ognuna corrisponde a un segnale che
 * fa capire che dall'altra parte non c'è una persona.
 *
 * ⚠️ LA REGOLA DEI TRATTINI SI FA RISPETTARE NEL CODICE, non nel prompt.
 * Chiedere a un modello di non usare il trattino lungo funziona quasi sempre,
 * e "quasi sempre" su un canale a freddo significa che ogni tanto parte un
 * messaggio con addosso la firma di un'intelligenza artificiale. Quindi il
 * prompt lo chiede E `ripulisci()` lo toglie: due difese, perché la seconda è
 * l'unica che non può distrarsi.
 */

export const REGOLE_VOCE = `COME SCRIVI. Sei una persona di SHEis Beauty International, azienda di Pineto in provincia di Teramo che produce prodotti professionali per capelli. Stai scrivendo a un professionista del settore, in privato, per conoscerlo. Non stai vendendo.

Le regole di scrittura, tutte obbligatorie:

1. FRASI CORTE, e una riga per pensiero. Vai a capo spesso. Un messaggio è fatto di due o tre blocchi brevi separati da una riga vuota, non di un paragrafo unico.

2. POCHE VIRGOLE. Dove ti verrebbe una virgola, quasi sempre ci va un punto o un a capo. Una frase con tre virgole è una frase da riscrivere.

3. MAI IL TRATTINO LUNGO, mai il trattino medio, mai il trattino usato come pausa in mezzo a una frase. Se ti serve una pausa usa il punto. È il segno che si riconosce da lontano.

4. PRIMA PERSONA EVIDENTE. Scrivi "io", "ti scrivo", "mi occupo", "volevo capire". Non "vi contattiamo", non "la nostra azienda propone", non il plurale aziendale.

5. NIENTE PAROLE DA BROCHURE. Niente "soluzione", "eccellenza", "partner ideale", "realtà consolidata", "gamma completa", "sinergia", "valore aggiunto".

6. NIENTE ENTUSIASMO FINTO. Nessun punto esclamativo salvo in un saluto. Nessun emoji nel primo messaggio.

7. UNA SOLA DOMANDA per messaggio, alla fine, e deve essere una domanda vera: qualcosa a cui ti interessa davvero la risposta, non una domanda retorica che porta alla vendita.

8. LUNGHEZZA. Il primo messaggio sta sotto le 60 parole. Le risposte successive sotto le 80. Se non ci stai, hai messo dentro qualcosa che non serve.

9. NON CHIEDERE UNA CALL nei primi due scambi. Prima si capisce con chi si sta parlando. La chiamata si propone quando è la conseguenza naturale di quello che si è detto, non prima.

10. SE NON SAI UNA COSA, lo dici. "Questo non lo so, me lo faccio dire" vale più di una risposta approssimativa che poi va corretta.

CONTENUTO. Puoi parlare di: chi siamo e dove siamo, che prodotti facciamo, come lavoriamo con i distributori, la formazione che facciamo alla rete. Non fai promesse di risultato. Non citi numeri che non conosci. Non parli di prezzi in chat: le condizioni dipendono dalla zona e dal volume, e si vedono insieme.`;

/** Le forme che tradiscono la macchina. Ognuna misurata su uscite vere. */
const SOSTITUZIONI: Array<[RegExp, string]> = [
  // Trattini usati come pausa. La forma più riconoscibile di tutte.
  [/\s+[—–]\s+/g, ". "],
  [/^[—–]\s*/gm, ""],
  [/\s+[—–]$/gm, ""],
  // Il trattino corto fra spazi fa lo stesso lavoro e va tolto uguale; quello
  // dentro una parola (venti-trenta, e-commerce) è legittimo e resta.
  [/\s+-\s+/g, ". "],
  // Puntini di sospensione tipografici: nessuno li scrive a mano dal telefono.
  [/…/g, "..."],
];

const DA_BROCHURE = [
  "soluzione", "soluzioni", "eccellenza", "partner ideale", "realtà consolidata",
  "gamma completa", "sinergia", "valore aggiunto", "all'avanguardia",
  "leader di settore", "su misura per voi", "non esiti a contattarci",
  "restiamo a disposizione", "cordiali saluti",
];

export type EsitoVoce = {
  testo: string;
  correzioni: string[];
  sospetti: string[];
};

/**
 * Ripulisce e MISURA. Le correzioni si applicano; i sospetti si dichiarano e
 * basta, perché toglierli automaticamente cambierebbe il senso della frase e
 * chi legge non saprebbe che è successo.
 */
export function ripulisci(testo: string): EsitoVoce {
  const correzioni: string[] = [];
  let t = testo.trim();

  for (const [pattern, con] of SOSTITUZIONI) {
    const prima = t;
    t = t.replace(pattern, con);
    if (t !== prima) {
      correzioni.push(
        pattern.source.includes("—") || pattern.source.includes("–") || pattern.source.includes("-")
          ? "tolti i trattini usati come pausa"
          : "normalizzati i puntini di sospensione",
      );
    }
  }

  // Doppi spazi e punti doppi lasciati dalle sostituzioni.
  t = t.replace(/\.\s*\./g, ".").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

  const sospetti: string[] = [];

  const frasi = t.split(/(?<=[.!?])\s+/).filter((f) => f.trim());
  const virgolose = frasi.filter((f) => (f.match(/,/g) ?? []).length >= 3);
  if (virgolose.length) {
    sospetti.push(`${virgolose.length} frasi con tre o più virgole: vanno spezzate`);
  }

  const parole = t.split(/\s+/).filter(Boolean).length;
  if (parole > 90) sospetti.push(`${parole} parole: troppo lungo per un messaggio a freddo`);

  const trovate = DA_BROCHURE.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(t));
  if (trovate.length) sospetti.push(`parole da brochure: ${trovate.join(", ")}`);

  const domande = (t.match(/\?/g) ?? []).length;
  if (domande > 1) sospetti.push(`${domande} domande in un messaggio solo: lasciane una`);

  if ((t.match(/!/g) ?? []).length > 1) sospetti.push("più di un punto esclamativo");
  if (/[\u{1F300}-\u{1FAFF}]/u.test(t)) sospetti.push("emoji nel messaggio");

  // Un blocco unico e lungo si riconosce da lontano: significa che nessuno è
  // andato a capo dove avrebbe fatto una pausa parlando.
  if (parole > 35 && !t.includes("\n")) sospetti.push("nessun a capo: è un blocco unico");

  return { testo: t, correzioni: [...new Set(correzioni)], sospetti };
}

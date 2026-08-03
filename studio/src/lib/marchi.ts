/**
 * GENERATO da ~/alkemia-sheis-backend/sincronizza_marchi.py — NON MODIFICARE A MANO.
 * La fonte è marchi.json. Una modifica qui viene sovrascritta al primo riallineamento,
 * e nel frattempo fa divergere questo sistema dagli altri senza che nessuno se ne accorga.
 */

export const MARCHI_REGISTRO = {
  "slug": [
    "sheis-beauty",
    "sheis-color",
    "sheis-color-first",
    "younic",
    "babilon",
    "vr-intelligent"
  ],
  "marchi": {
    "sheis-beauty": {
      "nome": "SHEis BEAUTY",
      "tipo": "ombrello",
      "inchiostro": "#231F20",
      "rapporto": 2.49,
      "svg": "sheis-beauty.svg",
      "png": "sheis-beauty.png",
      "descrizione": "Il marchio dell'azienda, non di una linea. «SHE» in grottesco geometrico sottilissimo, «is» in corsivo calligrafico con svolazzo lungo, «BEAUTY» in maiuscoletto spaziato, e dietro un CUORE disegnato a mano, a tratto irregolare.",
      "quando_si_usa": "Comunicazione istituzionale, fiere, presentazioni aziendali, firma in calce ai materiali di linea. Non si usa per parlare di un singolo prodotto.",
      "avvertenze": [
        "⚠️ Il file contiene 29 tracciati BIANCHI: sono i vuoti interni del cuore, non trasparenze. Su fondo scuro quelle aree diventano bianche e il cuore si riempie. Non esiste una versione in negativo: va chiesta a Mauro prima di usarlo su scuro.",
        "Il cuore è il solo elemento disegnato a mano di tutto il sistema: non va ridisegnato, ricalcato né rigenerato. Si usa il file."
      ]
    },
    "sheis-color": {
      "nome": "SHEis COLOR",
      "tipo": "linea",
      "inchiostro": "#231F20",
      "rapporto": 3.35,
      "svg": "sheis-color.svg",
      "png": "sheis-color.png",
      "descrizione": "Stessa costruzione del marchio ombrello — «SHE» geometrico sottile, «is» corsivo con svolazzo — ma con «COLOR» in maiuscoletto molto spaziato al posto di «BEAUTY», e senza cuore.",
      "quando_si_usa": "La linea colorazione. È il marchio più usato nella comunicazione ai saloni.",
      "avvertenze": [
        "Il file sorgente contiene un tracciato MAGENTA #EC0589 di 0,06 × 0,10 pt: è un residuo di lavorazione nel vettoriale del cliente, non un colore del marchio. Invisibile a qualunque uso reale, ma se un giorno qualcuno estrae la palette in automatico da quel file, la troverà. Segnalato a Mauro."
      ]
    },
    "sheis-color-first": {
      "nome": "SHEis COLOR FIRST",
      "tipo": "linea",
      "inchiostro": "#231F20",
      "rapporto": 1.44,
      "svg": "sheis-color-first.svg",
      "png": "sheis-color-first.png",
      "descrizione": "Blocco su due righe: il marchio SHEis COLOR in piccolo, e sotto «FIRST» in un carattere display condensato dal taglio molto marcato, con la F e la I unite. Le due parti sono UNA lockup: le proporzioni e la distanza fra loro non si toccano.",
      "quando_si_usa": "La declinazione FIRST della linea colorazione.",
      "avvertenze": [
        "⚠️ È una lockup a due elementi. Se qualcuno la ricompone a mano — perché «FIRST sembrava piccolo» — il marchio non è più il marchio. Si usa il file intero."
      ]
    },
    "younic": {
      "nome": "YOUNIC",
      "tipo": "prodotto",
      "inchiostro": "#231F20",
      "rapporto": 10.3,
      "svg": "younic.svg",
      "png": "younic.png",
      "descrizione": "Logotipo molto largo e molto pesante, lettere geometriche a contrasto forte con terminali svasati. La O e la U sono quasi rettangolari. Nessun simbolo: è solo il lettering.",
      "quando_si_usa": "Il marchio YOUNIC.",
      "avvertenze": [
        "Rapporto 10:1 — è il marchio più largo del sistema. In un formato verticale (9:16) occupa pochissima altezza e diventa illeggibile se lo si rimpicciolisce per farlo «stare»: va tenuto largo, anche a costo di dargli tutta la riga."
      ]
    },
    "babilon": {
      "nome": "BABILON",
      "tipo": "prodotto",
      "inchiostro": "#231F20",
      "rapporto": 5.66,
      "svg": "babilon.svg",
      "png": "babilon.png",
      "descrizione": "Logotipo in graziato ad alto contrasto — bodoniano — con lettere spaziate e una A dal vertice tagliato che sembra una lambda. Registro classico, il più «couture» dei sei.",
      "quando_si_usa": "Il marchio BABILON. È il marchio punta di lancia sull'estero.",
      "avvertenze": [
        "L'alto contrasto (aste spesse, grazie sottilissime) si perde sotto una certa dimensione: le grazie scompaiono per prime e il marchio sembra un carattere diverso. Non scendere sotto ~120 px di larghezza su schermo."
      ]
    },
    "vr-intelligent": {
      "nome": "VR Intelligent",
      "tipo": "prodotto",
      "inchiostro": "#050606",
      "rapporto": 0.99,
      "svg": "vr-intelligent.svg",
      "png": "vr-intelligent.png",
      "descrizione": "Monogramma: una V e una R costruite con tratti lineari sottili che si intersecano formando una figura quasi quadrata; sotto, «Intelligent» in un grottesco neutro. Il solo marchio del sistema costruito su un simbolo invece che su un logotipo.",
      "quando_si_usa": "Il marchio VR Intelligent.",
      "avvertenze": [
        "⚠️ Usa un NERO DIVERSO dagli altri cinque: #050606 contro #231F20. Misurato sui vettoriali, non dedotto. Affiancato agli altri in una stessa grafica, la differenza si vede. Va chiesto a Mauro se è voluto o se è una svista del suo fornitore: finché non risponde, NON allinearlo d'iniziativa — cambiare il colore di un marchio è una decisione del proprietario del marchio.",
        "È l'unico marchio quadrato (rapporto 0,99): l'unico che sta bene in un avatar o in un bollino."
      ]
    }
  },
  "palette_marchio": {
    "inchiostro": "#231F20",
    "inchiostro_vr": "#050606",
    "fondo": "#FFFFFF",
    "misurata": true,
    "fonte": "letta dai tracciati SVG dei sei file consegnati il 2026-08-04"
  },
  "palette_comunicazione": {
    "primario": "#0B2A4A",
    "accento": "#C9A227",
    "neutri": [
      "#FFFFFF",
      "#F4F1EA",
      "#1A1A1A"
    ],
    "misurata": false,
    "avvertenza": "DEDOTTA dai post di @sheisbeautyhair (dominanza di 💙 e 🌊, registro luxury), non misurata. I vettoriali del marchio sono arrivati il 2026-08-04 e sono MONOCROMATICI: non confermano né smentiscono questi colori, perché non li contengono. Restano [DA CONFERMARE] finché Mauro non consegna un manuale di marca o dei file di packaging a colori."
  },
  "regole_sempre": [
    "Si usa IL FILE del marchio, mai una ricostruzione. Nessun modello generativo sa ridisegnare un logotipo: produce qualcosa che ci somiglia, ed è esattamente ciò che il cliente riconosce come sbagliato.",
    "Il marchio si sovrappone alla creativa in composizione, DOPO la generazione. Non si chiede mai al generatore di «mettere il logo»: non lo sa fare e inventa lettere.",
    "Area di rispetto: attorno al marchio resta libero uno spazio pari all'altezza della lettera più alta del marchio stesso.",
    "Il marchio si scala in modo UNIFORME. Mai deformato, mai ruotato, mai in prospettiva, mai con ombre o contorni."
  ],
  "regole_mai": [
    "Mai ricolorare un marchio: sono monocromatici per scelta.",
    "Mai un marchio su una fotografia senza fondo pieno o velatura sotto: il tratto sottile di SHEis COLOR sparisce sul dettaglio.",
    "Mai due marchi diversi nella stessa creativa, salvo il marchio ombrello in firma sotto un marchio di linea.",
    "Mai il marchio ombrello SHEis BEAUTY su fondo scuro finché non esiste la versione in negativo."
  ],
  "prompt_sempre": "Lascia un'area completamente pulita e priva di soggetto nel terzo inferiore dell'immagine e un margine libero in alto a sinistra: serviranno per il logotipo e per il testo, che verranno composti dopo. Nessun testo, nessuna lettera, nessun logo, nessuna filigrana nell'immagine generata.",
  "prompt_mai": "Non chiedere mai al generatore il nome del marchio, il logo, un monogramma, una firma o un testo di alcun tipo: produrrebbe lettere inventate, e un marchio inventato è la cosa che un proprietario di marchio riconosce per prima."
} as const;

export type SlugMarchio = (typeof MARCHI_REGISTRO.slug)[number];

export const SLUG_MARCHI = MARCHI_REGISTRO.slug;

export function marchio(slug: string) {
  return (MARCHI_REGISTRO.marchi as Record<string, (typeof MARCHI_REGISTRO.marchi)[SlugMarchio]>)[slug] ?? null;
}

export function slugValido(slug: string): slug is SlugMarchio {
  return (MARCHI_REGISTRO.slug as readonly string[]).includes(slug);
}

/**
 * Le righe da mettere nel prompt del generatore per QUESTO marchio. Include
 * sempre il divieto di disegnare testo: è la regola che protegge dal fallimento
 * più comune, un logotipo inventato che somiglia a quello vero.
 */
export function istruzioniMarchio(slug: string): string {
  const m = marchio(slug);
  if (!m) return MARCHI_REGISTRO.prompt_mai;
  return `Marchio: ${m.nome} (${m.tipo}). ${m.descrizione}\n${MARCHI_REGISTRO.prompt_sempre}\n${MARCHI_REGISTRO.prompt_mai}`;
}

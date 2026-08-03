/**
 * GENERATO da sincronizza_modelli.py — NON modificare a mano.
 * 
 * Viene da modelli-creativi.json (impronta dd6d9a7182da3d9f). Cambiare qui il
 * modello significa farlo divergere dall'altro sistema, che è esattamente
 * il difetto per cui questo file esiste.
 * 
 * Per cambiare modello si modifica la fonte e si rilancia:
 *     python3 ~/alkemia-sheis-backend/sincronizza_modelli.py --allinea
 * 
 */
export const IMPRONTA_FONTE = "dd6d9a7182da3d9f";
export const CREDITO_EUR = 0.033;

export const LAVORI = {
  "grafica": {
    "descrizione": "Locandine, caroselli, inserzioni statiche, infografiche — tutto ciò che ha del TESTO dentro l'immagine.",
    "modello": "gpt_image_2",
    "nome_umano": "GPT Image 2",
    "crediti": 7,
    "perche": "Scelto da Andrei il 2026-08-03 per tutte le immagini. Costa 7 crediti contro i 2 di Nano Banana Pro, ma la scelta è del cliente e la resa del testo dentro l'immagine è la sua ragione d'essere.",
    "parametri": {
      "quality": "high",
      "resolution": "2k",
      "aspect_ratio": "3:4"
    },
    "formati_supportati": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3"
    ]
  },
  "grafica-bozza": {
    "descrizione": "Passate esplorative: molte varianti per capire quale direzione tenere, prima di produrre quella buona.",
    "modello": "gpt_image_2",
    "nome_umano": "GPT Image 2 (qualità bozza)",
    "crediti": 0,
    "perche": "Stesso modello della resa finale, a qualità bassa. Misurato il 2026-08-03: a qualità «low» e 2k il preventivo è di ZERO crediti — le passate esplorative non costano nulla. Si esplora quanto serve e si rifà col buono.",
    "parametri": {
      "quality": "low",
      "resolution": "2k",
      "aspect_ratio": "3:4"
    },
    "formati_supportati": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3"
    ]
  },
  "foto-prodotto": {
    "descrizione": "Packshot, prodotto in scena, still life. Il prodotto deve restare SE STESSO.",
    "modello": "gpt_image_2",
    "nome_umano": "GPT Image 2",
    "crediti": 7,
    "perche": "Scelto da Andrei per tutte le immagini. ⚠️ Nota misurata su un altro lavoro: sulla FEDELTÀ GEOMETRICA di un prodotto reale il migliore resta Nano Banana Pro (IoU 0,982). Quando il flacone deve restare identico a sé stesso, vale la pena riconsiderarlo.",
    "parametri": {
      "quality": "high",
      "resolution": "2k",
      "aspect_ratio": "1:1"
    },
    "formati_supportati": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "3:2",
      "2:3"
    ]
  },
  "ugc-video": {
    "descrizione": "Video UGC con una persona che parla o agisce in una situazione reale — il format che per SHEis ha già funzionato (caso Lazzari: 8 clienti in 5 mesi).",
    "modello": "seedance_2_0",
    "nome_umano": "Seedance 2.0",
    "crediti": 22,
    "perche": "È il migliore sulle scene con persone e genera l'audio insieme al video, quindi un parlato non va montato dopo. Costa quanto undici grafiche: è il lavoro più caro del catalogo e va deciso, non fatto per abitudine.",
    "parametri": {
      "duration": 5,
      "generate_audio": true,
      "bitrate_mode": "standard"
    },
    "attenzione": "⚠️ Misurato su un altro lavoro: a 4K e 10 secondi va in timeout e il costo resta a carico. Restare su durate brevi e risoluzione standard.",
    "formati_supportati": [
      "auto",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "1:1",
      "21:9"
    ]
  },
  "ugc-video-bozza": {
    "descrizione": "La stessa scena, per capire se l'idea regge prima di spendere il triplo.",
    "modello": "seedance_2_0_mini",
    "nome_umano": "Seedance 2.0 Mini",
    "crediti": 12,
    "perche": "Quasi la metà, stessa impostazione di scena. Serve a scartare le idee sbagliate a basso costo.",
    "parametri": {
      "duration": 5,
      "generate_audio": true
    },
    "formati_supportati": [
      "auto",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "1:1",
      "21:9"
    ]
  },
  "video-breve": {
    "descrizione": "Movimento semplice su un prodotto o una grafica: nessuno che parla, nessuna scena complessa.",
    "modello": "seedance1_5",
    "nome_umano": "Seedance 1.5 Pro",
    "crediti": 4,
    "perche": "Un quinto del costo di Seedance 2.0. Per animare un packshot non serve un modello che sa recitare.",
    "parametri": {
      "duration": 5
    },
    "formati_supportati": [
      "auto",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "1:1",
      "21:9"
    ]
  }
} as const;

export const FORMATO_PER_CANALE = {
  "instagram-feed": "4:5",
  "instagram-storia": "9:16",
  "instagram-reel": "9:16",
  "facebook-feed": "1:1",
  "tiktok": "9:16",
  "linkedin": "1:1",
  "sito": "16:9"
} as const;

export const GATE = {
  "soglia_eur_default": 2.0,
  "_perche": "Nessuna generazione parte senza dichiarare quanto costa. La soglia non è un divieto: sopra quella cifra serve una conferma esplicita, perché è lì che una passata distratta smette di essere trascurabile.",
  "marcatori_tetto_giornaliero": [
    "daily limit",
    "daily cap",
    "rate limit",
    "limite giornaliero",
    "too many requests"
  ]
} as const;

export type Lavoro = {
  descrizione: string;
  modello: string;
  nome_umano: string;
  crediti: number;
  perche: string;
  parametri: Record<string, string | number | boolean>;
  formati_supportati?: readonly string[];
  attenzione?: string;
};

/**
 * Il modello per questo lavoro. Non si indovina: un lavoro non previsto è una
 * domanda a cui il catalogo non risponde, e inventare un modello significa
 * spendere crediti su una scelta che nessuno ha preso.
 */
export function scegli(lavoro: string): Lavoro {
  const l = (LAVORI as Record<string, Lavoro>)[lavoro];
  if (!l) {
    throw new Error(
      `Lavoro creativo sconosciuto: "${lavoro}". Previsti: ${Object.keys(LAVORI).sort().join(", ")}.`,
    );
  }
  return l;
}

/**
 * Il formato giusto per il posto dove il contenuto verrà visto. Canale non
 * noto → "auto": meglio lasciar decidere al modello che imporre un formato
 * sbagliato.
 */
export function formatoPer(canale: string): string {
  return (FORMATO_PER_CANALE as Record<string, string>)[canale] ?? "auto";
}

function rapporto(f: string): number {
  const [a, b] = f.split(":").map(Number);
  return b ? a / b : 1;
}

/**
 * [formatoDaUsare, spiegazioneSeSostituito].
 *
 * ⚠️ Non tutti i modelli accettano tutti i formati: GPT Image 2 rifiuta il 4:5,
 * che è proprio quello del feed Instagram. Misurato il 2026-08-03.
 *
 * Quando il formato chiesto non c'è si prende il PIÙ VICINO per proporzione e
 * si restituisce la spiegazione. Sostituire in silenzio significherebbe
 * consegnare grafiche del formato sbagliato senza che nessuno se ne accorga.
 */
export function formatoAmmesso(lavoro: string, formato: string): [string, string] {
  const l = scegli(lavoro) as Lavoro & { formati_supportati?: readonly string[] };
  const ammessi = l.formati_supportati ?? [];
  if (ammessi.length === 0 || ammessi.includes(formato)) return [formato, ""];
  const candidati = ammessi.filter((f) => f !== "auto");
  if (candidati.length === 0) return [formato, ""];
  const vicino = candidati.reduce((a, b) =>
    Math.abs(rapporto(b) - rapporto(formato)) < Math.abs(rapporto(a) - rapporto(formato)) ? b : a,
  );
  return [
    vicino,
    `il formato ${formato} non è supportato da ${l.nome_umano}: uso ${vicino}, che è il più vicino`,
  ];
}

export function costoEur(lavoro: string, quante = 1): number {
  return Math.round(scegli(lavoro).crediti * quante * CREDITO_EUR * 10000) / 10000;
}

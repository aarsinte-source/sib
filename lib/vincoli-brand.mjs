/**
 * GENERATO da sincronizza_brand.py — NON modificare a mano.
 * 
 * Le liste qui sotto vengono da BRAND-IDENTITY_sheis_2026-08-03.json (impronta 85672b97c6bd1e63).
 * Modificarle qui significa reintrodurre esattamente il difetto per cui
 * questo file esiste: quattro linter con quattro copie divergenti delle
 * stesse regole, e verdetti opposti sullo stesso testo.
 * 
 * Per cambiare una regola si modifica la fonte e si rilancia:
 *     python3 ~/alkemia-sheis-backend/sincronizza_brand.py --allinea
 * 
 */
export const IMPRONTA_FONTE = "85672b97c6bd1e63";

export const NEGOZIO = [
  "shop",
  "negozio",
  "carrello",
  "acquista",
  "acquistare",
  "compra",
  "comprare",
  "ordina ora",
  "ordina adesso",
  "e-commerce",
  "ecommerce",
  "checkout",
  "aggiungi al carrello",
  "cart",
  "add to cart",
  "buy now",
  "purchase",
  "tienda",
  "carrito",
  "cesta",
  "comprar",
  "añadir al carrito",
  "panier",
  "acheter",
  "ajouter au panier",
  "Warenkorb",
  "kaufen",
  "jetzt kaufen",
  "in den Warenkorb",
  "koszyk",
  "sklep",
  "kup teraz",
  "dodaj do koszyka",
  "loja",
  "carrinho",
  "comprar agora",
  "adicionar ao carrinho",
  "متجر",
  "سلة",
  "عربة التسوق",
  "اشتر الآن",
  "ordina",
  "ordinare",
  "buy",
  "shopping"
];

export const ECCEZIONI_RADICE = [
  "ordinario",
  "ordinaria",
  "ordinari",
  "ordinarie",
  "ordinato",
  "ordinata"
];

export const PREZZO = [
  "€",
  "euro",
  "prezzo",
  "listino",
  "sconto",
  "offerta",
  "promo",
  "saldo"
];

export const FIREWALL = [
  "Metodo 29",
  "Metodo29",
  "Method 29"
];

// I claim sono FORME, non parole: «clinicamente provata» al femminile
// sfuggiva a chi cercava «provato».
export const CLAIM_VIETATI = [
  {
    "pattern": "\\bclinicamente\\s+(provat|testat|dimostrat)\\w*",
    "cosa": "claim clinico: serve una prova regolatoria (CPNP/PIF) che oggi non c'è"
  },
  {
    "pattern": "\\bclinically\\s+(proven|tested)\\b|\\bcl[íi]nicamente\\s+(probad|test)\\w*",
    "cosa": "claim clinico (EN/ES)"
  },
  {
    "pattern": "\\bdermatologicamente\\s+(provat|dimostrat)\\w*",
    "cosa": "«dermatologicamente provato» — il documentato è «testato», non «provato»"
  },
  {
    "pattern": "\\bscientificamente\\s+(provat|dimostrat)\\w*",
    "cosa": "claim scientifico non documentato"
  },
  {
    "pattern": "\\brisultat\\w*\\s+garantit\\w*|\\bgarantiam\\w+|\\bguaranteed\\s+results\\b|\\bresultados\\s+garantizados\\b",
    "cosa": "garanzia di risultato: vietata in cosmetica senza prova regolatoria"
  },
  {
    "pattern": "\\b100\\s*%",
    "cosa": "«100%»: il dato verificato è 99% di origine naturale"
  },
  {
    "pattern": "\\bmiglior\\w*\\b[^.!?]{0,30}\\b(del|sul)\\s+mercato|\\bthe\\s+best\\s+on\\s+the\\s+market\\b|\\bel\\s+mejor\\s+del\\s+mercado\\b",
    "cosa": "superlativo assoluto non dimostrabile"
  },
  {
    "pattern": "\\b(numero\\s*(1|uno)|n\\.?\\s*1)\\s+(in|del|sul)\\b|\\bleader\\s+(mondiale|assoluto)\\b",
    "cosa": "primato non dimostrabile"
  },
  {
    "pattern": "\\bl['’]?unic\\w+\\s+(prodotto|linea|marchio|azienda)\\b",
    "cosa": "esclusività non dimostrabile"
  },
  {
    "pattern": "\\bcura\\s+(la|il|i|le)\\s+(calvizie|alopecia|forfora|dermatite)\\b|\\bfa\\s+ricrescere\\s+i\\s+capelli\\b|\\bblocca\\s+la\\s+caduta\\b",
    "cosa": "claim terapeutico: un cosmetico non cura"
  },
  {
    "pattern": "\\bda\\s+(due|tre|quattro|cinque|sei|molte)\\s+generazioni\\b|\\bda\\s+decenni\\b|\\bstorica\\s+azienda\\b",
    "cosa": "claim di eredità/anzianità non documentato"
  },
  {
    "pattern": "\\b(senza\\s+alcun|zero)\\s+(effett\\w+\\s+collateral\\w+|rischi\\w*)",
    "cosa": "assenza assoluta di rischi"
  }
];

export const CTA_AMMESSE = [
  "Scopri la gamma su www.sheishair.com",
  "Trova il tuo salone",
  "Scrivici per diventare distributore"
];

export const CTA_VIETATE = [
  "Acquista",
  "Ordina",
  "Compra ora",
  "Aggiungi al carrello"
];

// Un numero passa solo se corrisponde a `pattern` E `contesto_richiesto`
// compare vicino: «99% di origine naturale» sì, «99% di sconto» no.
export const NUMERI_DOCUMENTATI = [
  {
    "valore": "15 minuti di posa",
    "pattern": "\\b1?5\\s*minut\\w*\\b",
    "contesto_richiesto": "pos[ae]|application|aplicaci|colore|color",
    "spiegazione": "Tempo di posa SHEis Color, rivendicato sul sito del cliente."
  },
  {
    "valore": "99% di origine naturale",
    "pattern": "\\b99\\s?%",
    "contesto_richiesto": "natural|origine|origen|origin",
    "spiegazione": "Claim BABILON dichiarato dal cliente. Attenzione: 100% resta vietato."
  },
  {
    "valore": "tre fasi YOUNIC",
    "pattern": "\\b(tre|3)\\s+fas[ie]\\b",
    "contesto_richiesto": "younic|cute|scalp",
    "spiegazione": "Struttura del sistema YOUNIC."
  },
  {
    "valore": "83 nuance",
    "pattern": "\\b83\\b",
    "contesto_richiesto": "nuance|nuances|matices|tonos|shades|tonalit|colore|color",
    "spiegazione": "Ampiezza della cartella SHEis Color. Compare sul sito del cliente in 8 lingue, nei 6 blueprint pubblicitari e nella strategia SEO — era però l'unico numero che il media buyer aveva in whitelist e gli altri tre filtri no. ⚠️ I NOMI ufficiali delle 83 nuance restano da farsi dare da Mauro (KIT §B11): il conteggio è confermato, l'elenco no."
  }
];

/**
 * Il pattern per un termine vietato, secondo lessico._regola_di_confronto:
 * confronto per RADICE, non per parola esatta. Fino a 3 lettere di coda per i
 * termini da 6 caratteri in su (koszyk→koszyka, carrito→carritos); parola
 * esatta per i brevi, altrimenti «cart» mangia «carta» e «cartella».
 */
export function radice(termine) {
  const esc = termine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!/[A-Za-z]/.test(termine)) return new RegExp(esc, "giu");
  if (termine.length >= 6 && !termine.includes(" ")) return new RegExp(`\\b${esc}\\p{L}{0,3}\\b`, "giu");
  return new RegExp(`\\b${esc}\\b`, "giu");
}

export const PATTERN_NEGOZIO = NEGOZIO.map((t) => ({
  pattern: radice(t),
  dettaglio: `lessico da negozio vietato: «${t}»`,
}));

const ECCEZIONI_RE = ECCEZIONI_RADICE.length
  ? new RegExp(`^(${ECCEZIONI_RADICE.join("|")})$`, "iu")
  : null;

/**
 * Il termine trovato è una delle parole innocenti dichiarate nella fonte?
 * «ordinario» condivide la radice con «ordina» e non c'entra col commercio.
 */
export function negozioEccezione(frase) {
  return Boolean(ECCEZIONI_RE && ECCEZIONI_RE.test(frase.trim()));
}

/**
 * Il numero fra `inizio` e `fine` è fra quelli documentati dal cliente?
 * «99% di origine naturale» sì, «99% di sconto» no: decide il contesto.
 */
export function numeroDocumentato(testo, inizio, fine) {
  const intorno = testo.slice(Math.max(0, inizio - 35), fine + 35);
  return NUMERI_DOCUMENTATI.some((n) => {
    const p = new RegExp(n.pattern, "iu");
    if (!p.test(testo.slice(inizio, fine)) && !p.test(intorno)) return false;
    return new RegExp(n.contesto_richiesto, "iu").test(intorno);
  });
}

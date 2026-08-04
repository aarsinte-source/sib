"""GENERATO da sincronizza_brand.py — NON modificare a mano.

Le liste qui sotto vengono da BRAND-IDENTITY_sheis_2026-08-03.json (impronta e7b58e9f3bb1473c).
Modificarle qui significa reintrodurre esattamente il difetto per cui
questo file esiste: quattro linter con quattro copie divergenti delle
stesse regole, e verdetti opposti sullo stesso testo.

Per cambiare una regola si modifica la fonte e si rilancia:
    python3 ~/alkemia-sheis-backend/sincronizza_brand.py --allinea
"""
IMPRONTA_FONTE = 'e7b58e9f3bb1473c'

NEGOZIO = [
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
]

ECCEZIONI_RADICE = [
    "ordinario",
    "ordinaria",
    "ordinari",
    "ordinarie",
    "ordinato",
    "ordinata"
]

# Termini VIETATI che diventano leciti solo in un contesto preciso: in un
# salone il «carrello» è il mobile con gli strumenti, non quello della spesa.
ECCEZIONI_CONTESTO_NEGOZIO = [
    {
        "termine": "carrello",
        "contesto_richiesto": "salone|saloni|cabina|postazione|piastra|strumenti|phon|forbici|poltrona|lavaggio|servizio|parrucchier",
        "perche": "⚠️ FALSO POSITIVO MISURATO il 2026-08-04. In un salone il «carrello» è il mobile con gli strumenti, non quello della spesa. Il testo bloccato era «Il cliente entra. Guarda il carrello. Vede la piastra.»: vocabolario di mestiere, non e-commerce. Un filtro che blocca il corretto insegna a ignorarlo, e allora smette di proteggere."
    },
    {
        "termine": "cart",
        "contesto_richiesto": "salon|station|trolley|tools|styling",
        "perche": "Stessa cosa in inglese: il trolley del salone."
    }
]

PREZZO = [
    "€",
    "euro",
    "prezzo",
    "listino",
    "sconto",
    "offerta",
    "promo",
    "saldo"
]

# ⚠️ La regola sui numeri è INVERTITA: qualunque cifra attaccata a una
# parola è un claim, salvo i documentati e le eccezioni. Prima era un
# elenco di unità sospette, e «28 lavaggi» passava da tutti e quattro i
# filtri perché «lavaggi» non era nell'elenco. Un elenco di unità è per
# costruzione incompleto.
QUANTITA_GENERICA = {
    "_perche": "⚠️ BUCO MISURATO il 2026-08-04. Il piano editoriale generato conteneva «28 lavaggi»: un dato di prodotto inventato, passato da TUTTI e quattro i filtri. La regola sui numeri era scritta come ELENCO di unità sospette (minuti, ore, giorni, nuance, saloni…) e «lavaggi» non c'era. Un elenco di unità è per costruzione incompleto: ogni unità nuova è un claim che passa, e ce ne si accorge dopo la pubblicazione. La regola si INVERTE: qualunque numero attaccato a una parola è un claim, salvo quelli documentati e salvo le eccezioni qui sotto. È lo stesso rovesciamento che ha reso robusta la regola sul lessico da negozio.",
    "pattern": "\\b\\d{1,4}(?:[.,]\\d{1,2})?\\s*%?\\s+[A-Za-zÀ-ÿ]{3,}",
    "cosa": "quantità non documentata: ogni numero riferito al prodotto deve stare nell'elenco documentato",
    "eccezioni_contesto": [
        {
            "pattern": "\\b(19|20)\\d{2}\\b",
            "perche": "un anno non è un claim di prodotto"
        },
        {
            "pattern": "\\b\\d{1,2}[:.]\\d{2}\\b",
            "perche": "un orario non è un claim"
        },
        {
            "pattern": "\\b24\\s*/\\s*7\\b",
            "perche": "modo di dire sulla disponibilità, non un dato"
        },
        {
            "pattern": "#\\w*\\d",
            "perche": "numeri dentro un hashtag"
        },
        {
            "pattern": "https?://\\S*\\d",
            "perche": "numeri dentro un indirizzo"
        },
        {
            "pattern": "\\b(call|chiamat\\w+|videochiamat\\w+|appuntament\\w+|riunion\\w+|incontr\\w+|demo|webinar|consulenz\\w+|meeting)\\b",
            "perche": "⚠️ falso positivo già pagato: «ne parliamo in venti minuti» è la durata di una call, non un dato di prodotto. Se nella frase c'è un contesto d'incontro, il numero non è un claim."
        },
        {
            "pattern": "\\b(via|viale|piazza|numero civico|cap|p\\.?\\s?iva|telefono|tel\\.)\\b",
            "perche": "recapiti e indirizzi"
        },
        {
            "pattern": "\\b(tipo|type|tipolog\\w+)\\s*\\d[A-Ca-c]?\\b|\\b\\d[A-Ca-c]\\b(?=[^.]{0,20}\\b(capell|hair|ricc|curl|cabell))",
            "perche": "⚠️ FALSO POSITIVO MISURATO il 2026-08-04: «type 3-4 hair» è la classificazione standard della tipologia di capello (2A…4C), non un dato di prodotto. Bloccarla significa impedire di parlare di ricci, che è metà del mestiere."
        },
        {
            "pattern": "\\b\\d{1,2}\\s*[-–/]\\s*\\d{1,2}\\b(?=[^.]{0,25}\\b(capell|hair|ricc|curl|cabell|tipo|type))",
            "perche": "Stessa cosa nella forma con l'intervallo: «3-4», «2A-3B»."
        }
    ],
    "regola": "Un numero seguito da una parola BLOCCA, a meno che: (a) corrisponda a un numero documentato col suo contesto richiesto, oppure (b) nella stessa frase compaia una delle eccezioni. Chi vuole usare un dato nuovo lo fa documentare, non lo scrive e basta."
}

FIREWALL = [
    "Metodo 29",
    "Metodo29",
    "Method 29"
]

# I claim sono FORME, non parole: «clinicamente provata» al femminile
# sfuggiva a chi cercava «provato».
CLAIM_VIETATI = [
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
    },
    {
        "pattern": "\\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\\s+fas[ie]\\b",
        "cosa": "numero di fasi scritto in lettere: il documentato è TRE (YOUNIC). «cinque fasi» passava da tutti e quattro"
    },
    {
        "pattern": "\\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci|venti|trenta|cinquanta|cento)\\s+(nuance|tonalit\\w+|client\\w+|salon\\w+|distributor\\w+)\\b|\\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci|venti|trenta|cinquanta|cento)\\s+minut\\w+\\s+(di\\s+)?(posa|applicazion\\w+|trattament\\w+)",
        "cosa": "quantità di PRODOTTO scritta in lettere fuori dall'elenco documentato (le durate di una conversazione — «ne parliamo in venti minuti» — sono lecite: conta l'oggetto, non il numero)"
    }
]

# Il firewall come FORME, non stringhe: «metodo-29» col trattino e la
# parafrasi «ventinove passi ... metodo» sfuggivano a un elenco letterale.
FIREWALL_PATTERN = [
    {
        "pattern": "\\bm[eé]todo?\\s*[-–_.]?\\s*29\\b",
        "cosa": "Metodo 29 in ogni grafia (spazio, trattino, punto, unito)"
    },
    {
        "pattern": "\\bmethod\\s*[-–_.]?\\s*29\\b",
        "cosa": "Method 29 (EN)"
    },
    {
        "pattern": "\\bm\\s*[-–_.]?\\s*29\\b",
        "cosa": "sigla M29 / M-29 / M.29"
    },
    {
        "pattern": "\\bmetodo\\s*[-–_.]?\\s*ventinov\\w*",
        "cosa": "Metodo ventinove in lettere"
    },
    {
        "pattern": "(ventinovesim\\w*|ventinove|\\b29\\b)[^.\\n]{0,60}(pilastr\\w*|metodo|sistema|approcci\\w*|passagg\\w*|pass[io]|fas[ei]|step|segreto)",
        "cosa": "parafrasi: il numero ventinove vicino a metodo/sistema/approccio/passi"
    },
    {
        "pattern": "(pilastr\\w*|metodo|sistema|approcci\\w*|passagg\\w*|pass[io]|fas[ei]|step|segreto)[^.\\n]{0,60}(ventinovesim\\w*|ventinove|\\b29\\b)",
        "cosa": "parafrasi, ordine invertito"
    }
]

# Forme che il confronto per radice non prende: «sklepie» (radice di 5
# caratteri) e «gekauft» (il prefisso GE- spezza il confine di parola).
FORME_FLESSE = [
    "sklepie",
    "sklepu",
    "sklepy",
    "sklepem",
    "gekauft",
    "gekaufte",
    "kauft",
    "kaufe",
    "einkauf",
    "einkaufen",
    "cestas",
    "cestita",
    "comprado",
    "comprada",
    "comprou",
    "achete",
    "achetez",
    "achetons"
]

# Frasi che NEGANO il canale: sono testo approvato, non violazioni.
NEGAZIONI_AMMESSE = [
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])non (siamo|vendiamo|c'?è|esiste)[^.\\n]{0,30}(online|e-?commerce|vendita)",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])n[éeè]\\s+(amazon|e-?commerce|online)",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])nessun[ao]?\\s+(e-?commerce|vendita online|negozio online)",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])niente\\s+e-?commerce",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])we don'?t sell online",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])no online sales",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])no vendemos online",
    "(?<![a-zA-ZàèéìòùÀÈÉÌÒÙ])no estamos en venta online"
]

CTA_AMMESSE = [
    "Scopri la gamma su www.sheishair.com",
    "Trova il tuo salone",
    "Scrivici per diventare distributore"
]

CTA_VIETATE = [
    "Acquista",
    "Ordina",
    "Compra ora",
    "Aggiungi al carrello"
]

# Un numero passa solo se corrisponde a `pattern` E `contesto_richiesto`
# compare vicino: «99% di origine naturale» sì, «99% di sconto» no.
NUMERI_DOCUMENTATI = [
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
]


import re as _re


def _radice(termine: str) -> str:
    """Il pattern per un termine vietato, secondo lessico._regola_di_confronto.

    Tre casi, e la soglia non è arbitraria:
      · niente confini di parola per gli alfabeti non latini (arabo)
      · fino a 3 lettere di coda per i termini da 6 caratteri in su, che sono
        quelli che declinano: koszyk→koszyka, carrito→carritos
      · parola esatta per i termini brevi, altrimenti «cart» mangia «carta» e
        «cartella» e il filtro comincia a bloccare testo innocente
    """
    esc = _re.escape(termine)
    if not _re.search(r"[A-Za-z]", termine):
        return esc
    if len(termine) >= 6 and " " not in termine:
        return rf"\b{esc}\w{{0,3}}\b"
    return rf"\b{esc}\b"


PATTERN_NEGOZIO = [
    (_radice(t), f"lessico da negozio vietato: «{t}»") for t in NEGOZIO + FORME_FLESSE
]

_NEGAZIONI_RE = [_re.compile(p, _re.IGNORECASE) for p in NEGAZIONI_AMMESSE]


def nega_il_canale(testo: str) -> bool:
    """La frase NEGA il canale invece di proporlo?

    «Non siamo in vendita online, né Amazon né e-commerce nostro» è testo
    approvato: è la leva di SHEis, non la violazione. Un filtro che lo
    blocca viene disattivato da chi lo usa."""
    return any(p.search(testo) for p in _NEGAZIONI_RE)


def viola_firewall(testo: str):
    """(True, motivo) se il testo evoca il marchio protetto, in qualunque
    grafia o parafrasi. È la regola che il cliente ha dichiarato non
    negoziabile: qui non si fanno eccezioni."""
    for f in FIREWALL_PATTERN:
        m = _re.search(f["pattern"], testo, _re.IGNORECASE)
        if m:
            return True, f'{f["cosa"]} → «{m.group(0)[:60]}»'
    return False, ""

_ECCEZIONI_RE = _re.compile(
    r"\b(" + "|".join(_re.escape(e) for e in ECCEZIONI_RADICE) + r")\b", _re.IGNORECASE
) if ECCEZIONI_RADICE else None


def negozio_eccezione(frase: str) -> bool:
    """Il termine trovato è una delle parole innocenti dichiarate nella fonte?
    «ordinario» condivide la radice con «ordina» e non c'entra col commercio."""
    return bool(_ECCEZIONI_RE and _ECCEZIONI_RE.fullmatch(frase.strip()))


def negozio_eccezione_contesto(testo: str, inizio: int, fine: int) -> bool:
    """Il termine è vietato in generale ma lecito in QUESTO contesto?

    Diverso da `negozio_eccezione`: lì la parola è innocente di per sé
    («ordinario»), qui è vietata e diventa lecita solo se accanto compare il
    contesto dichiarato. Stessa forma di `numero_documentato`.

    Caso misurato: in un salone il «carrello» è il mobile con gli strumenti,
    non quello della spesa — «Il cliente entra. Guarda il carrello. Vede la
    piastra.» è vocabolario di mestiere. Bloccarlo insegna a ignorare il filtro.
    """
    trovato = testo[inizio:fine].strip().lower()
    intorno = testo[max(0, inizio - 120): fine + 120]
    for e in ECCEZIONI_CONTESTO_NEGOZIO:
        if e["termine"].lower() in trovato and _re.search(e["contesto_richiesto"], intorno, _re.IGNORECASE):
            return True
    return False


def numero_documentato(testo: str, inizio: int, fine: int) -> bool:
    """Il numero trovato fra `inizio` e `fine` è uno di quelli che il cliente ha
    documentato? Serve il contesto: «99%» da solo non dice niente, «99% di
    origine naturale» è un dato dichiarato e «99% di sconto» resta vietato."""
    intorno = testo[max(0, inizio - 35): fine + 35]
    for n in NUMERI_DOCUMENTATI:
        if _re.search(n["pattern"], testo[inizio:fine], _re.IGNORECASE) or \
           _re.search(n["pattern"], intorno, _re.IGNORECASE):
            if _re.search(n["contesto_richiesto"], intorno, _re.IGNORECASE):
                return True
    return False

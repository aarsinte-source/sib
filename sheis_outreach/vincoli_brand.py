"""GENERATO da sincronizza_brand.py — NON modificare a mano.

Le liste qui sotto vengono da BRAND-IDENTITY_sheis_2026-08-03.json (impronta 85672b97c6bd1e63).
Modificarle qui significa reintrodurre esattamente il difetto per cui
questo file esiste: quattro linter con quattro copie divergenti delle
stesse regole, e verdetti opposti sullo stesso testo.

Per cambiare una regola si modifica la fonte e si rilancia:
    python3 ~/alkemia-sheis-backend/sincronizza_brand.py --allinea
"""
IMPRONTA_FONTE = '85672b97c6bd1e63'

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
    }
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
    (_radice(t), f"lessico da negozio vietato: «{t}»") for t in NEGOZIO
]

_ECCEZIONI_RE = _re.compile(
    r"\b(" + "|".join(_re.escape(e) for e in ECCEZIONI_RADICE) + r")\b", _re.IGNORECASE
) if ECCEZIONI_RADICE else None


def negozio_eccezione(frase: str) -> bool:
    """Il termine trovato è una delle parole innocenti dichiarate nella fonte?
    «ordinario» condivide la radice con «ordina» e non c'entra col commercio."""
    return bool(_ECCEZIONI_RE and _ECCEZIONI_RE.fullmatch(frase.strip()))


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

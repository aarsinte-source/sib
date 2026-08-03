"""Linter pre-invio — l'ultimo cancello prima che un messaggio parta davvero.

Nessun messaggio esce se viola i guardrail di brand SHEis. Il linter gira SEMPRE,
anche in DRY_RUN, anche su testo scritto a mano, anche su testo generato da Claude.
Un BLOCK non è un warning: è uno stop.
"""
import re
from dataclasses import dataclass, field

from .vincoli_brand import PATTERN_NEGOZIO, negozio_eccezione, numero_documentato

BLOCK, WARN = "BLOCK", "WARN"


@dataclass
class Violation:
    level: str
    rule: str
    detail: str
    match: str = ""


@dataclass
class LintResult:
    ok: bool
    violations: list = field(default_factory=list)

    @property
    def blocking(self):
        return [v for v in self.violations if v.level == BLOCK]

    def render(self) -> str:
        if not self.violations:
            return "  linter: OK"
        return "\n".join(
            f"  linter [{v.level}] {v.rule}: {v.detail}"
            + (f'  →  "{v.match}"' if v.match else "")
            for v in self.violations
        )


# --- Regole -------------------------------------------------------------------
# 1) Mai prezzi / importi / percentuali di margine.
#
# Due livelli, e la distinzione è deliberata: il copione APPROVATO (§5) risponde a
# "quanto costa?" con "i prezzi li vediamo in call, perché dipendono dalla zona".
# Quella riga NOMINA il prezzo per RINVIARLO — è la risposta giusta, non una violazione.
# Quello che non deve mai uscire è una CIFRA, o l'offerta di uno sconto/listino/margine.
PRICE_PATTERNS = [
    (r"[€$£]\s?\d", "simbolo di valuta seguito da cifra"),
    (r"\b\d+[.,]?\d*\s?(euro|eur|dollari|usd)\b", "importo esplicito"),
    # ⚠️ Questa riga aveva un difetto misurato il 3/8: bloccava OGNI percentuale,
    # incluso il «99% di origine naturale» che il file di marca dichiara essere
    # il dato vero — e che poche righe più sotto questo stesso file cita come
    # tale. Un messaggio corretto e approvato veniva rifiutato dal cancello.
    # Ora la percentuale è vietata *salvo* che sia una di quelle documentate nel
    # contesto giusto: vedi NUMERI_DOCUMENTATI (§_percentuale_documentata).
    (r"\b\d{1,3}\s?%", "percentuale (possibile margine o sconto)"),
    (r"\b(sconto|sconti|scontato|scontata|scontati|descuento|discount|"
     r"listino|listini|price list|tarifa|pricing|"
     r"margine|margini|ricarico|markup)\b",
     "lessico prezzo/margine: sconto, listino o margine non si offrono mai"),
    # Trovato in revisione (3/8): "venti euro" (cifra scritta per esteso) non
    # veniva mai intercettato, perché il pattern sopra pretende una CIFRA prima
    # di "euro". Copre i numeri in lettere più comuni in un prezzo (unità,
    # decine, cento/mille) in IT/EN/ES — non è un parser numerico completo, ma
    # chiude il caso trovato e le forme vicine.
    (r"\b(un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|"
     r"quattordici|quindici|sedici|diciassette|diciotto|diciannove|vent\w*|trent\w*|"
     r"quarant\w*|cinquant\w*|sessant\w*|settant\w*|ottant\w*|novant\w*|cent\w*|"
     r"mille|duemila)\s+(euro|eur)\b",
     "importo scritto per esteso (IT)"),
    (r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|"
     r"fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|"
     r"fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+(euros?|dollars?|pounds?)\b",
     "importo scritto per esteso (EN)"),
    (r"\b(un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|"
     r"catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte|treinta|"
     r"cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|mil)\s+euros?\b",
     "importo scritto per esteso (ES)"),
    # ⚠️ Divergenza misurata il 3/8 contro il filtro gemello dei contenuti:
    # «duecento euro» passava di qui e veniva bloccato di là. Le tre righe sopra
    # inseguono i numerali scritti per esteso, ma «duecento» non ha un confine
    # di parola davanti a «cento» e sfuggiva. Inseguire ogni numerale italiano è
    # una partita persa: si blocca la parola-valuta NUDA. SHEis non ha mai un
    # motivo legittimo di nominare «euro» in un messaggio a freddo — non vende
    # online e non dà prezzi fuori dalla call (brand-core §7).
    (r"\b(euro|euros|eur|dollari|dollar|dollars|sterline|pound|pounds|"
     r"centesimi|cents|céntimos)\b",
     "valuta nominata, anche in lettere e senza cifra accanto"),
]

# Claim quantificati: un numero è dimostrabile solo se il cliente l'ha
# documentato. Regola presa dal filtro gemello dei contenuti, dove esisteva già
# — qui mancava del tutto, ed era la seconda divergenza misurata: «Siamo leader
# da 47 anni» passava da questo cancello e veniva fermato dall'altro.
# La whitelist è la stessa per entrambi (NUMERI_DOCUMENTATI, dalla fonte).
CLAIM_QUANTIFICATO = [
    (r"\b\d+\s*(minuti|minuto|ore|ora|minutes|minutos)\b",
     "durata quantificata non documentata"),
    (r"\b\d+\s*(giorni|giorno|mesi|mese|anni|anno|days|years|años)\b",
     "quantità temporale non documentata (anzianità, garanzia, tempi di consegna)"),
    (r"\b\d+\s*(client[ie]|salon[ie]|distributor[ie]|paesi|countries)\b",
     "quantità commerciale non documentata"),
    # ⚠️ Buco misurato il 3/8: «120 nuance» passava da tutti e quattro i filtri.
    # La cartella SHEis Color ne ha 83 — è l'unico dato di prodotto che chiunque
    # verifica in due secondi. Non era una divergenza: era un buco condiviso.
    (r"\b\d+\s*(nuance|nuances|tonalit\w*|tonos|matices|shades)\b",
     "ampiezza di gamma non documentata (la cartella SHEis Color ha 83 nuance)"),
]
# Menzione nuda del prezzo senza cifra: legittima quando RINVIA (copione §5),
# sospetta altrove → passa, ma segnalata per revisione umana.
PRICE_SOFT = [
    (r"\b(prezzo|prezzi|precio|precios|price|prices)\b",
     "il prezzo è nominato: legittimo solo per rinviarlo alla call, mai per darlo"),
]

# 2) Mai shop/negozio/carrello/acquista/e-commerce → si dice "portale ordini"/"area riservata".
#
# Questa lista NON si scrive più qui. Fino al 3/8 era ricopiata a mano da
# BRAND-IDENTITY, e la copia era rimasta indietro: quando la fonte è passata da
# 15 a 41 termini, questo file non se n'è accorto. Ora arriva generata — se la
# fonte cambia, `sincronizza_brand.py --verifica` fallisce invece di lasciare
# due filtri dello stesso sistema in disaccordo sullo stesso testo.
SHOP_PATTERNS = PATTERN_NEGOZIO
# Eccezione: il copione USA legittimamente "non siamo in vendita online" / "no Amazon".
# Quelle frasi NEGANO l'e-commerce e sono approvate: whitelist esplicita.
SHOP_ALLOWED = [
    r"non (siamo|vendiamo) (in vendita )?online",
    r"no estamos en venta online",
    r"we don'?t sell online",
    r"n[ée] (amazon|e-?commerce)",
    r"ni amazon", r"no amazon", r"né amazon",
    r"nessun e-?commerce", r"niente e-?commerce",
]

# 3) "Metodo 29" non deve MAI comparire da nessuna parte.
# Ampliato in revisione (3/8): tre vie di elusione trovate e chiuse.
#   - "metodo ventinove" (grafia estesa) → riga dedicata
#   - "m 2 9" (cifre separate da spazi) → non basta la regex: lint() passa anche
#     una versione del testo con gli spazi FRA CIFRE rimossi (_compact_digits)
#   - parafrasi ("il framework esclusivo, il ventinovesimo pilastro...") → le due
#     regole di co-occorrenza sotto, riprese da ~/alkemia-sheis-workers/lib/linter.py
#     (già verificate contro 14 test avversariali, inclusa la parafrasi elusiva)
M29_PATTERNS = [
    (r"\bmetodo\s*29\b", "riferimento interno vietato"),
    (r"\bmetodo29\b", "riferimento interno vietato (senza spazio)"),
    (r"\bmethod\s*29\b", "riferimento interno vietato"),
    (r"\bm[-.\s]?29\b", "riferimento interno vietato (sigla M29/M-29/M.29/M 29)"),
    (r"\bm[ée]todo\s*29\b", "riferimento interno vietato"),
    (r"\bmetodo\s*ventinove\b|\bmetodo\s*ventinovesimo\b",
     "riferimento interno vietato (grafia estesa)"),
    (r"(ventinovesim\w*|ventinove|\b29\b)[^.\n]{0,40}"
     r"(pilastr\w*|metodo\s*esclusiv\w*|sistema\s*esclusiv\w*|segreto\s*interno)",
     "parafrasi elusiva del firewall (numero/ordinale + 'metodo esclusivo/pilastro')"),
    (r"(pilastr\w*|metodo\s*esclusiv\w*|sistema\s*esclusiv\w*|segreto\s*interno)"
     r"[^.\n]{0,40}(ventinovesim\w*|ventinove|\b29\b)",
     "parafrasi elusiva del firewall (ordine invertito)"),
]

# 4) Claim non documentati (senza CPNP/PIF non si dicono).
CLAIM_PATTERNS = [
    # ⚠️ Accordo di genere: «clinicamente provata» (formula, femminile) sfuggiva
    # perché la riga cercava solo il maschile singolare. Misurato il 3/8.
    (r"\bclinicamente\s+(provat|testat|dimostrat)\w*|\bclinically proven\b|"
     r"\bdermatologicamente\s+(provat|dimostrat)\w*|"
     r"\bscientificamente\s+(provat|dimostrat)\w*|\bcl[íi]nicamente\s+(probad|test)\w*",
     "claim clinico non documentato"),
    (r"\b(risultati garantiti|garantiamo|garantito al|guaranteed results|"
     r"resultados garantizados)\b", "garanzia di risultato"),
    (r"\b(il migliore (del mercato|in assoluto)|numero 1 (in|del)|the best on the market|"
     r"el mejor del mercado|leader mondiale|leader assoluto)\b", "superlativo non dimostrabile"),
    (r"\b(cura la (calvizie|alopecia)|fa ricrescere i capelli|blocca la caduta|"
     r"anticaduta garantito|regrows hair)\b", "claim medico/terapeutico"),
    (r"\b(100% naturale|totalmente naturale|completamente naturale|100% natural)\b",
     "claim naturale assoluto (il dato reale è 99% origine naturale)"),
]
# ⚠️ Toppa mirata (revisione 3/8), non una soluzione generale: un elenco chiuso di
# frasi non può coprire ogni claim inventabile in linguaggio libero — "il partner
# più richiesto dai saloni italiani da tre generazioni" non ha né cifre né le
# parole sopra, eppure è un'affermazione che SHEis non può dimostrare. Copre il
# caso trovato e le varianti vicine; se ne salta fuori un altro va aggiunto qui,
# non riscritto da zero.
LEGACY_CLAIM_PATTERNS = [
    (r"\bda (due|tre|quattro|cinque|sei|molte)\s+generazioni\b",
     "claim di eredità/tradizione non documentato"),
    (r"\bda decenni\b|\bstorica azienda\b|\bleader (storico|di riferimento)\b",
     "claim di anzianità/leadership non documentato"),
    (r"\b(il|la) (partner|scelta) più (richiest[oa]|amat[oa]|scelt[oa])\b",
     "superlativo di preferenza non documentato"),
]

# 3b) Script inatteso — evasione trovata in revisione (3/8): lo stesso testo
# vietato scritto in arabo passa indisturbato perché i pattern sopra sono tutti
# latini. Il composer genera SOLO it/en/es (composer.py LANGS): qualunque testo
# con caratteri arabi è già di per sé fuori contratto e va fermato, a prescindere
# dal contenuto — non si prova a tradurre ogni regola in ogni alfabeto.
# In più: la mescolanza latino+cirillico nello stesso testo è la tecnica classica
# degli omoglifi (una "e" cirillica identica a vista alla "e" latina elude \be\b).
_ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿ]")
_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")
_LATIN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")

# 5) Mai parlare al consumatore finale (B2B puro: distributori, non clienti privati).
CONSUMER_PATTERNS = [
    (r"\b(ordina il tuo|per i tuoi capelli|prova il prodotto a casa|"
     r"spedizione a casa tua|per uso domestico)\b", "linguaggio da consumatore finale"),
]

# 6) Vincoli di canale.
LIMITS = {"linkedin_note": 300, "instagram_dm": 900}


def _find(text: str, patterns, level, rule):
    out = []
    for pat, detail in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            out.append(Violation(level, rule, detail, m.group(0)))
    return out


def _find_prezzi(text: str):
    """Come `_find` sui pattern di prezzo, ma lascia passare i numeri che il
    cliente ha documentato.

    Il difetto che questa funzione chiude (misurato il 3/8): la regola sulle
    percentuali bloccava anche «99% di origine naturale», che è il dato reale
    dichiarato dal cliente e scritto nel file di marca. Il filtro rifiutava un
    messaggio corretto — e un cancello che blocca il lecito viene disattivato da
    chi lo usa, il che è molto peggio di una regola un po' larga.

    La distinzione la fa il CONTESTO, non il numero: «99% di origine naturale»
    passa, «99% di sconto» resta bloccato.
    """
    out = []
    for regola, patterns in (("prezzi/margini", PRICE_PATTERNS),
                             ("claim-quantificato", CLAIM_QUANTIFICATO)):
        for pat, detail in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if not m:
                continue
            if numero_documentato(text, m.start(), m.end()):
                continue
            out.append(Violation(BLOCK, regola, detail, m.group(0)))
    return out


def _shop_allowed(text: str, match: str) -> bool:
    """La menzione è approvata? Due modi: la parola è innocente e condivide solo
    la radice con un termine vietato («ordinario» ≠ «ordina»), oppure è dentro
    una frase che NEGA l'online — che è la leva di SHEis, non la violazione."""
    if negozio_eccezione(match):
        return True
    low = text.lower()
    idx = low.find(match.lower())
    window = low[max(0, idx - 60): idx + len(match) + 20]
    return any(re.search(p, window) for p in SHOP_ALLOWED)


def _compact_digits(text: str) -> str:
    """Rimuove gli spazi FRA CIFRE ADIACENTI (' m 2 9 ' → ' m29 '). Trovato in
    revisione (3/8): "il framework m 2 9" aggirava M29_PATTERNS perché nessuna
    regex tollerava le cifre separate. Tocca solo lo spazio fra due cifre, non
    altri spazi — non deforma il resto del testo."""
    return re.sub(r"(?<=\d)\s+(?=\d)", "", text)


def _script_violation(text: str):
    """Guardia di script (revisione 3/8): il composer genera SOLO it/en/es
    (composer.py LANGS) — testo in arabo, o una mescolanza latino+cirillico
    (omoglifi), è già fuori contratto a prescindere dal contenuto."""
    if _ARABIC_RE.search(text):
        return Violation(BLOCK, "script-inatteso",
                          "testo con caratteri arabi: il sistema genera solo it/en/es, "
                          "serve controllo umano prima di qualunque invio")
    if _CYRILLIC_RE.search(text) and _LATIN_RE.search(text):
        return Violation(BLOCK, "script-misto",
                          "alfabeto latino e cirillico nello stesso testo: possibile "
                          "tentativo di aggirare il filtro con omoglifi")
    return None


def lint(text: str, channel: str = "linkedin", touch: str = "touch2") -> LintResult:
    v = []
    v += _find_prezzi(text)
    v += _find(text, PRICE_SOFT, WARN, "prezzo-nominato")
    v += _find(text, M29_PATTERNS, BLOCK, "metodo-29")
    compact = _compact_digits(text)
    if compact != text:
        v += _find(compact, M29_PATTERNS, BLOCK, "metodo-29 (cifre separate da spazi)")
    v += _find(text, CLAIM_PATTERNS, BLOCK, "claim-non-documentati")
    v += _find(text, LEGACY_CLAIM_PATTERNS, BLOCK, "claim-non-documentati")
    v += _find(text, CONSUMER_PATTERNS, BLOCK, "consumatore-finale")
    sv = _script_violation(text)
    if sv:
        v.append(sv)

    for viol in _find(text, SHOP_PATTERNS, BLOCK, "lessico-ecommerce"):
        if not _shop_allowed(text, viol.match):
            v.append(viol)

    # Limiti di lunghezza
    if channel == "linkedin" and touch == "touch1" and len(text) > LIMITS["linkedin_note"]:
        v.append(Violation(BLOCK, "lunghezza",
                           f"nota di collegamento {len(text)} car. > {LIMITS['linkedin_note']}"))
    if channel == "instagram" and len(text) > LIMITS["instagram_dm"]:
        v.append(Violation(WARN, "lunghezza",
                           f"DM {len(text)} car.: su IG il messaggio lungo muore"))
    if channel == "instagram" and len(text) > 600:
        v.append(Violation(WARN, "registro", "IG vuole frasi corte, non un pitch LinkedIn"))

    # Regole di condotta del copione
    if touch == "touch1" and re.search(r"\b(partnership|opportunit[àa]|opportunidad|opportunity)\b",
                                       text, re.IGNORECASE):
        v.append(Violation(BLOCK, "lessico-a-freddo",
                           "'partnership'/'opportunità' vietate nel primo messaggio"))
    if not text.strip():
        v.append(Violation(BLOCK, "vuoto", "messaggio vuoto"))

    return LintResult(ok=not any(x.level == BLOCK for x in v), violations=v)

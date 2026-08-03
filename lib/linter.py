"""Linter di marca pre-pubblicazione — l'ultimo cancello prima che un post esca.

Regole (fonte: BRAND-IDENTITY_sheis_2026-08-03.json + .claude/skills/sheis-brand-core/
guardrails.json — QUESTO file non inventa regole, le implementa meccanicamente):

  1. Prezzi e cifre commerciali — mai un numero che valga come prezzo, sconto, listino,
     margine. SHEis non vende online e non mostra mai un prezzo pubblico (brand-core §7).
  2. Lessico da negozio, in OGNI lingua — shop/carrello/acquista/cart/tienda/panier/
     Warenkorb/koszyk/loja/متجر e affini. Il posizionamento è "portale ordini"/
     "area riservata", mai un negozio.
  3. «Metodo 29» in ogni grafia e parafrasi — firewall non negoziabile, trasversale,
     vale su OGNI contenuto SHEis senza eccezioni (guardrails.json §1).
  4. Claim numerici fuori dall'elenco documentato — solo "15 minuti di posa",
     "99% di origine naturale", "tre fasi YOUNIC", "senza ammoniaca" sono numeri
     che SHEis può dimostrare. Ogni altra cifra-claim (percentuali, "X giorni",
     "X anni di garanzia"...) è indimostrabile finché non arriva da Mauro.
  5. Claim assoluti/clinici non documentati e "100% naturale" (contraddice il dato
     reale: 99%).

Ogni violazione BLOCK porta la REGOLA e la FRASE ESATTA che l'ha fatta scattare —
è il requisito esplicito: "blocca e dice quale regola ha fermato quale frase".
Nessuna eccezione silenziosa: se un testo passa, `LintResult.ok` è True e basta.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from .vincoli_brand import (PATTERN_NEGOZIO, negozio_eccezione, numero_documentato,
                            nega_il_canale, viola_firewall, CLAIM_VIETATI,
                            FIREWALL_PATTERN, PREZZO)

from re import escape as _re_escape

BLOCK, WARN = "BLOCK", "WARN"

# ⚠️ REGRESSIONE ⑥b (revisione avversariale 2026-08-03): un carattere
# invisibile o non-\w inserito DENTRO una parola vietata ("sh​op",
# "car​rello", "acqui\xa0sta") spezza il confine \b che tutte le regole
# usano — "sh" e "op" diventano due token separati, nessuno dei due combacia
# con "shop". Sia lo zero-width space (U+200B) sia il NBSP (U+00A0) sono
# non-\w per il modulo `re`: entrambi rompono la tokenizzazione allo stesso
# modo, quindi entrambi vanno RIMOSSI (non sostituiti con uno spazio, che
# lascerebbe comunque due token separati) prima di qualunque controllo.
CARATTERI_INVISIBILI = re.compile(
    "[" + "".join([
        "​",  # zero width space
        "‌",  # zero width non-joiner
        "‍",  # zero width joiner
        "⁠",  # word joiner
        "﻿",  # zero width no-break space / BOM
        "­",  # soft hyphen
        " ",  # non-breaking space — nessun uso legittimo nel copy SHEis
        "‎", "‏",  # left/right-to-left mark
    ]) + "]"
)


def _normalizza_testo(testo: str) -> str:
    """Rimuove caratteri invisibili/non-\\w usati per spezzare una parola
    vietata a metà, e normalizza le forme di compatibilità Unicode (es.
    varianti a larghezza intera). Va chiamata PRIMA di qualunque pattern."""
    t = CARATTERI_INVISIBILI.sub("", testo)
    return unicodedata.normalize("NFKC", t)


@dataclass
class Violazione:
    livello: str
    regola: str
    dettaglio: str
    frase: str = ""

    def __str__(self) -> str:
        punta = f'  →  "{self.frase}"' if self.frase else ""
        return f"[{self.livello}] {self.regola}: {self.dettaglio}{punta}"


@dataclass
class LintResult:
    ok: bool
    violazioni: list[Violazione] = field(default_factory=list)

    @property
    def bloccanti(self) -> list[Violazione]:
        return [v for v in self.violazioni if v.livello == BLOCK]

    def motivo_blocco(self) -> str:
        """Una riga in italiano, per sheis_pubblicazioni.motivo_blocco. Vuota se ok."""
        if not self.bloccanti:
            return ""
        prime = self.bloccanti[:3]
        resto = len(self.bloccanti) - len(prime)
        righe = [str(v) for v in prime]
        if resto > 0:
            righe.append(f"(+{resto} altra/e violazione/i)")
        return " · ".join(righe)

    def render(self) -> str:
        if not self.violazioni:
            return "  linter: OK — nessuna violazione"
        return "\n".join(f"  {v}" for v in self.violazioni)


# ---------------------------------------------------------------- 1. prezzi
PREZZO_PATTERNS = [
    (r"[€$£]\s?\d", "simbolo di valuta seguito da una cifra"),
    (r"\b\d+[.,]?\d*\s?(euro|eur|dollari|usd|dollars)\b", "importo esplicito in cifre"),
    # ⚠️ REGRESSIONE ⑥a (revisione avversariale 2026-08-03): "Il trattamento
    # costa duecento euro" passava indisturbato — il pattern sopra pretende
    # SEMPRE una cifra accanto alla valuta, ed è esattamente così che un
    # testo generato scriverebbe un prezzo per eleganza (in lettere). Invece
    # di inseguire ogni numerale italiano scritto per esteso (cento, mille,
    # duecentocinquanta, ...), si blocca la parola-valuta NUDA: SHEis non ha
    # mai un motivo legittimo di nominare "euro"/"dollari" in un contenuto —
    # non vende online, non mostra prezzi in nessuna forma (brand-core §7).
    (r"\b(euro|euros|dollari|dollar|dollars|sterline|pound|pounds|centesimi|cents)\b",
     "valuta nominata (anche in lettere, senza cifra accanto)"),
    (
        r"\b(sconto|sconti|scontato|scontata|scontati|promo|promozione|saldo|saldi|"
        r"listino|listini|price\s?list|tarifa|pricing|"
        r"margine|margini|ricarico|markup|descuento|discount)\b",
        "lessico prezzo/sconto/listino/margine — SHEis non mostra mai un prezzo pubblico",
    ),
]

# ⚠️ La fonte elenca fra le cifre commerciali vietate anche «offerta»,
# «promo» e «saldo». Questa lista, scritta a mano, non le aveva: «Scrivici
# per ricevere un'offerta commerciale» passava di qui e veniva bloccata
# dagli altri due filtri. I termini della fonte si aggiungono, non si
# ricopiano — se domani ne arriva un altro, arriva da solo.
PREZZO_PATTERNS += [
    (r"\b" + _re_escape(t) + r"\w{0,3}\b", f"termine commerciale vietato dalla fonte: «{t}»")
    for t in PREZZO if t.isalpha() and len(t) >= 5
]
PREZZO_NUDO = [
    (r"\bprezzo|prezzi|precio|precios|price|prices\b", "parola 'prezzo' nominata"),
]

# ------------------------------------------------- 2. lessico da negozio (multilingua)
#
# Questa lista NON si scrive più qui. Era ricopiata a mano da BRAND-IDENTITY e
# aveva perso per strada spagnolo, portoghese e polacco declinato: «carrito»,
# «carrinho» e «koszyka» passavano da questo filtro mentre il gemello
# dell'outreach li bloccava — due verdetti opposti sullo stesso testo, e nessuno
# dei due che sembrasse rotto. Ora arriva generata dalla fonte.
NEGOZIO_PATTERNS = PATTERN_NEGOZIO
# Eccezione dichiarata: SHEis usa legittimamente "non vendiamo online" per NEGARE
# l'e-commerce — è la leva, non la violazione. Vale sullo stesso pattern dell'outreacher.
NEGOZIO_AMMESSO = [
    r"non (siamo|vendiamo) (in vendita )?online",
    r"nessun e-?commerce", r"niente e-?commerce",
    r"we don'?t sell online", r"no online sales",
    r"no vendemos online", r"no estamos en venta online",
]

# ---------------------------------------------------------- 3. firewall Metodo 29
# Trasversale, sempre BLOCK, nessuna eccezione — vedi guardrails.json forbidden_pairs.
# ⚠️ Il firewall NON si scrive più qui. Il collaudo del 3/8 ha misurato due
# vie d'uscita da questo elenco: «il metodo-29» col trattino e «approccio
# ventinove passi, applicato al metodo». Un elenco di stringhe non difende
# una regola che il cliente ha dichiarato non negoziabile. Le forme vengono
# dalla fonte e valgono per tutti e quattro i filtri insieme.
M29_PATTERNS = [(f['pattern'], f['cosa']) for f in FIREWALL_PATTERN]

# --------------------------------------------- 4/5. claim numerici e assoluti
# Whitelist ESATTA (brand-identity.regole_di_generazione.numeri_ammessi):
#   "15 minuti di posa" · "99% di origine naturale" · "tre fasi YOUNIC" · "senza ammoniaca"
CLAIM_QUANTIFICATO = [
    (r"\b\d{1,3}\s?%", "percentuale non nell'elenco documentato"),
    (r"\b\d+\s*(minuti|minuto|ore|ora)\b", "durata quantificata non documentata"),
    (r"\b\d+\s*(giorni|giorno|mesi|mese|anni|anno)\b", "quantità temporale non documentata (garanzia/esperienza)"),
    # ⚠️ Buco misurato il 3/8 sulla batteria d'insieme: «Con le nostre 120 nuance
    # disponibili» passava da TUTTI i filtri. La cartella SHEis Color ne ha 83 —
    # un numero sbagliato sull'unico dato di prodotto che il mercato verifica in
    # due secondi. Non era una divergenza fra filtri: era un buco condiviso, che
    # solo una prova d'insieme poteva far vedere.
    (r"\b\d+\s*(nuance|nuances|tonalit\w*|tonos|matices|shades)\b",
     "ampiezza di gamma non documentata (la cartella SHEis Color ha 83 nuance)"),
    (r"\b\d+\s*(client[ie]|salon[ie]|distributor[ie]|paesi|mercati)\b",
     "quantità commerciale non documentata"),
]
# La whitelist era ricopiata a mano anche qui, in una terza forma ancora
# diversa. Ora viene dalla fonte: `numero_documentato` legge NUMERI_DOCUMENTATI
# generato da BRAND-IDENTITY. Aggiungere un numero documentato si fa lì, una
# volta sola, e vale per tutti e quattro i filtri insieme.

# ⚠️ Anche i claim vengono dalla fonte. Scritti a mano lasciavano
# passare i numeri in LETTERE: «YOUNIC lavora in cinque fasi» passava
# da tutti e quattro i filtri, e le fasi documentate sono TRE.
CLAIM_ASSOLUTO_PATTERNS = [(c['pattern'], c['cosa']) for c in CLAIM_VIETATI]


def _find(testo: str, patterns, livello: str, regola: str) -> list[Violazione]:
    out = []
    for pat, dettaglio in patterns:
        m = re.search(pat, testo, re.IGNORECASE)
        if m:
            out.append(Violazione(livello, regola, dettaglio, m.group(0).strip()))
    return out


def _negozio_ammesso(testo: str, frase: str) -> bool:
    # Prima: la parola è innocente? Il confronto per radice prende «ordinario»
    # insieme a «ordina» — le eccezioni sono dichiarate nella fonte, non qui.
    if negozio_eccezione(frase):
        return True
    # Poi: la frase NEGA il canale? È testo approvato, non una violazione.
    if nega_il_canale(testo):
        return True
    basso = testo.lower()
    idx = basso.find(frase.lower())
    finestra = basso[max(0, idx - 60): idx + len(frase) + 25]
    return any(re.search(p, finestra) for p in NEGOZIO_AMMESSO)


def _claim_ammesso(testo: str, span: tuple[int, int]) -> bool:
    return numero_documentato(testo, span[0], span[1])


def lint_pubblicazione(testo: str, canale: str = "generico") -> LintResult:
    """Linter completo su un testo destinato alla pubblicazione (caption, copy
    secondario, alt-text). Va chiamato SEMPRE prima di mettere in coda un post,
    anche in DRY-RUN — il linter non è un effetto collaterale della pubblicazione
    vera, è un controllo indipendente da essa.
    """
    if not testo or not testo.strip():
        return LintResult(ok=False, violazioni=[Violazione(BLOCK, "vuoto", "testo vuoto o assente")])

    testo = _normalizza_testo(testo)
    v: list[Violazione] = []
    v += _find(testo, PREZZO_PATTERNS, BLOCK, "prezzi-e-cifre-commerciali")
    v += _find(testo, PREZZO_NUDO, WARN, "prezzo-nominato")
    v += _find(testo, M29_PATTERNS, BLOCK, "firewall-metodo-29")
    # ⚠️ I claim ora includono le quantità scritte in LETTERE («cinque fasi»),
    # e fra quelle c'è anche «tre fasi», che è documentata. Quindi anche questo
    # controllo deve consultare l'elenco dei numeri leciti, esattamente come fa
    # quello sulle cifre: senza, il filtro bloccherebbe il dato vero del
    # cliente — l'errore che questa mattina abbiamo già pagato sul «99%».
    for pat, dettaglio in CLAIM_ASSOLUTO_PATTERNS:
        m = re.search(pat, testo, re.IGNORECASE)
        if m and not _claim_ammesso(testo, m.span()):
            v.append(Violazione(BLOCK, "claim-non-documentato", dettaglio, m.group(0).strip()))

    for viol in _find(testo, NEGOZIO_PATTERNS, BLOCK, "lessico-da-negozio"):
        if not _negozio_ammesso(testo, viol.frase):
            v.append(viol)

    # claim numerici: BLOCK solo se la cifra NON è nel perimetro whitelisted
    for pat, dettaglio in CLAIM_QUANTIFICATO:
        for m in re.finditer(pat, testo, re.IGNORECASE):
            if not _claim_ammesso(testo, m.span()):
                v.append(Violazione(BLOCK, "claim-numerico-non-documentato", dettaglio, m.group(0).strip()))

    ok = not any(x.livello == BLOCK for x in v)
    return LintResult(ok=ok, violazioni=v)

"""Discovery Instagram a parola chiave — la "testa" del motore di outreach.

Oggi i prospect entrano solo da CSV compilati a mano. Questo modulo li TROVA da
solo su Instagram: SALONI (da una parola chiave italiana) e DISTRIBUTORI (query
dedicate + ricerca a ritroso dai marchi concorrenti) — i distributori sono la
priorità commerciale #1 del cliente, i saloni la #3, e questo modulo tratta le
due lane di conseguenza (vedi "Allocazione slot" più sotto). Li classifica e li
aggancia con un dato reale — mai inventato — poi li mette in staging nella
tabella `candidates`.

Un candidato NON è un prospect. Passa a `prospects` (e quindi entra nella
macchina a stati che invia davvero) SOLO tramite il comando `promote`, e SOLO
se supera una soglia di punteggio. Fino a quel momento questo modulo non
scrive né invia nulla: popola il serbatoio, non spara.

Fonti (in ordine di resa — verificate con chiamate reali, non assunte):
  - v1/instagram/search/profiles  — discovery ampia da keyword (bio+caption).
    Paginata: cursori 1..11, il 12 dà 400 (limite dell'API, non nostro).
  - v1/instagram/search/hashtag   — hashtag italiani esatti. Funziona bene per
    i SALONI (#parrucchieri, #hairstylistitalia, ...). Per i DISTRIBUTORI è
    stato testato (#distribuzioneprofessionale, #ingrossoparrucchieri,
    #distributoreitaliano) e NON rende: hashtag inesistenti o quasi vuoti.
    Non si riprova: la lane hashtag-distributori è vuota di proposito.
  - v1/instagram/profile          — bio, follower, contatti business, POST
    RECENTI incorporati (fino a ~12: bastano per aggancio e geo-tag, niente
    chiamata aggiuntiva) e i profili correlati (`edge_related_profiles`), usati
    per l'espansione a catena con --espandi.

Ricerca a ritroso dai marchi concorrenti: il cliente stesso ha indicato questo
come il metodo migliore ("trovami chi distribuisce questi marchi e
automaticamente risaliamo ai distributori"). La lista brand è quella VALIDATA
da Mauro (Skill sheis-brand-core §6) — non se ne aggiungono di propria
iniziativa. Il rumore è alto (Google indicizza distributori esteri dello
stesso brand globale): lo filtra `italian_context_score`, non la query.

Nessuna dipendenza esterna nuova: solo `urllib` (come unipile.py) e stdlib.
Il progetto resta Python puro di proposito — vedi README.md.
"""
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime

from . import config, store

API_BASE = "https://api.scrapecreators.com"

TIPI = ("salone", "distributore", "non_pertinente", "incerto")

# Hashtag italiani esatti per i SALONI — verificati funzionanti.
HASHTAGS_IT = ["parrucchieri", "saloneparrucchiere", "hairstylistitalia", "parrucchiereitaliano"]

# Query dedicate per i DISTRIBUTORI — mestiere diverso da "parrucchiere", verificate
# con chiamate reali: rendono profili come "Forniture per parrucchieri dal 1985",
# "Distributore ufficiale ed esclusivo di...", "rivenditore prodotti Davines - <città>".
DISTRIBUTOR_QUERIES = [
    "distribuzione prodotti capelli",
    "distributore prodotti professionali parrucchieri",
    "ingrosso prodotti capelli",
    "rivenditore prodotti parrucchieri",
    "forniture parrucchieri",
    "distribuzione cosmetica professionale",
]
# Hashtag distributori — TESTATI e ABBANDONATI: #distribuzioneprofessionale,
# #ingrossoparrucchieri, #distributoreitaliano davano 0 post; #fornitureparrucchieri
# 1 solo post di un account UK. Lista vuota di proposito, non un buco dimenticato.
DISTRIBUTOR_HASHTAGS: list[str] = []

# Marchi concorrenti — lista VALIDATA da Mauro (Skill sheis-brand-core §6) usata
# sia per la ricerca a ritroso sia per il rilevamento in bio. Doppia grafia dove
# la trascrizione della call e il nome commerciale reale del brand differiscono
# (es. "Echosline"/"Echoline", "Vitality's"/"Vitalis"): non si scarta nessuna
# delle due, si tiene la copertura.
BRAND_REVERSE_QUERIES = [
    "Davines", "Kemon", "Alfaparf Milano", "Framesi", "Insight Professional",
    "Echosline", "Vitality's", "Z.One", "milk_shake",
]
COMPETITOR_BRANDS = [
    "davines", "kemon", "alfaparf milano", "alfaparf", "framesi",
    "insight professional", "insight", "echosline", "echoline",
    "vitality's", "vitalitys", "vitalis", "sebastian", "kevin murphy", "oribe",
    "philip martins", "z.one", "ziwan", "milk_shake", "milk shake",
]


class DiscoveryError(RuntimeError):
    pass


# ================================================================= util testo
def _norm(s: str | None) -> str:
    """Minuscolo + accenti rimossi, per confronti robusti (bari == Bari == BARI)."""
    if not s:
        return ""
    s = s.lower()
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


# ================================================================= client HTTP
def _api_key() -> str | None:
    k = os.environ.get("SCRAPECREATORS_API_KEY")
    if k:
        return k
    env_file = config.SCALERS / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("SCRAPECREATORS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _get(path: str, params: dict, timeout=45) -> dict:
    key = _api_key()
    if not key:
        raise DiscoveryError(
            f"SCRAPECREATORS_API_KEY assente (env, o {config.SCALERS / '.env'})")
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{API_BASE}{path}?{qs}"
    req = urllib.request.Request(url, headers={"x-api-key": key, "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise DiscoveryError(f"HTTP {e.code} su {path}: {e.read().decode()[:200]}") from None
    except urllib.error.URLError as e:
        raise DiscoveryError(f"errore di rete su {path}: {e}") from None
    if data.get("success") is False:
        raise DiscoveryError(f"{path}: {data.get('message') or data.get('error')}")
    return data


def search_profiles_page(query: str, cursor: str | None = None) -> dict:
    return _get("/v1/instagram/search/profiles", {"query": query, "cursor": cursor})


def search_hashtag(hashtag: str, media_type: str = "all") -> dict:
    return _get("/v1/instagram/search/hashtag", {"hashtag": hashtag, "media_type": media_type})


def _normalize_profile(raw: dict) -> dict | None:
    try:
        u = raw["data"]["user"]
    except (KeyError, TypeError):
        return None
    if not u.get("username"):
        return None

    recent_posts = []
    for e in (u.get("edge_owner_to_timeline_media") or {}).get("edges") or []:
        node = e.get("node") or {}
        cap_edges = (node.get("edge_media_to_caption") or {}).get("edges") or []
        text = cap_edges[0]["node"]["text"] if cap_edges else ""
        ts = node.get("taken_at_timestamp")
        loc = (node.get("location") or {}).get("name") or ""
        recent_posts.append({
            "text": text or "",
            "date": datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "",
            "location": loc,
        })

    related = [
        e["node"]["username"]
        for e in (u.get("edge_related_profiles") or {}).get("edges") or []
        if (e.get("node") or {}).get("username")
    ]

    return {
        "username": u["username"],
        "full_name": u.get("full_name") or "",
        "biography": u.get("biography") or "",
        "follower_count": u.get("follower_count") or 0,
        "following_count": u.get("following_count") or 0,
        "media_count": u.get("media_count") or 0,
        "external_url": u.get("external_url") or "",
        "business_email": u.get("business_email") or "",
        "business_phone": u.get("business_phone_number") or "",
        "city_name": u.get("city_name") or "",
        "category_name": u.get("category_name") or "",
        "is_business_account": bool(u.get("is_business_account") or u.get("is_professional_account")),
        "related": related,
        "recent_posts": recent_posts,
    }


def get_profile(username: str) -> dict | None:
    raw = _get("/v1/instagram/profile", {"handle": username})
    return _normalize_profile(raw)


# ================================================================= call budget
class Budget:
    """Limite di chiamate configurabile — le chiamate costano crediti."""

    def __init__(self, max_calls: int):
        self.max_calls = max(1, max_calls)
        self.used = 0

    def spend(self, n=1):
        self.used += n

    def exhausted(self) -> bool:
        return self.used >= self.max_calls


# ================================================================= classificatore
# Euristica onesta e ispezionabile — niente scatola nera. Ogni segnale trovato
# finisce nella spiegazione (`motivo_score`) così è verificabile riga per riga.
SALON_KEYWORDS = [
    "salone", "salon", "parrucchier", "hairstylist", "hair stylist", "hair salon",
    "barber", "acconciature", "beauty salon", "hair studio", "parrucchieria",
]
# Ampliato su richiesta: forniture/agente/concessionario mancavano e sono lessico
# tipico dei distributori italiani ("Forniture per parrucchieri dal 1985",
# "agente di zona", "concessionario ufficiale").
DISTRIBUTOR_KEYWORDS = [
    "distribuzione", "distributore", "distribuidor", "rivenditore", "ingrosso",
    "wholesale", "b2b", "prodotti professionali", "per il tuo salone", "per parrucchieri",
    "per professionisti", "esclusivista", "importatore", "importer",
    "forniture", "agente", "concessionario",
]
_MANUFACTURER_ESCAPE = ("distribu", "rivend", "ingross", "importat", "wholesale", "b2b", "forniture")
HAIR_CONTEXT_WORDS = ("hair", "capelli", "parrucch", "beauty", "cosmet", "estetic", "barber", "salone")

_ADDRESS_RE = re.compile(r"\b(via|viale|piazza|corso)\b")
_HOURS_RE = re.compile(r"\b(lun|mar|mer|gio|ven|sab|dom)[.\-]|\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}")
_PHONE_RE = re.compile(r"\b\d{6,11}\b")
_IT_PHONE_RE = re.compile(r"\b3\d{9}\b|\b0\d{6,10}\b")
_BOOKING_WORDS = ("prenota", "appuntamento", "booking")

IT_CONTEXT_WORDS = ("italia", "italiano", "italiana", "spedizione", "p.iva", "piva", "tel.", "whatsapp")
EN_NOISE_WORDS = ("shop now", "trade only", "worldwide", "nationwide delivery",
                   "leading distributor", "award winning", "we ship", "order online")


def detect_competitor_brands(bio: str) -> list[str]:
    """Tutti i marchi distinti citati (non solo il primo): un salone ne cita di
    solito uno, un distributore spesso più di uno insieme — è un segnale usato
    dal classificatore, non solo un campo da riempire."""
    low = _norm(bio)
    found = []
    for brand in COMPETITOR_BRANDS:
        if brand in low and brand not in found:
            found.append(brand)
    return found


def italian_context_score(profile: dict) -> tuple[int, str]:
    """Filtro anti-rumore per la ricerca a ritroso sui marchi: Google indicizza
    distributori dello stesso brand globale ovunque nel mondo, e la query da
    sola non basta a restringere all'Italia (testato: aggiungere "Italia" alla
    query non cambia la qualità dei risultati). Il filtro sta qui, sul dato
    reale del profilo, non sulla query."""
    low = _norm(profile.get("biography"))
    ext = _norm(profile.get("external_url"))
    score, motivi = 0, []

    it_hits = sum(1 for w in IT_CONTEXT_WORDS if w in low)
    if it_hits:
        add = min(it_hits * 3, 9)
        score += add
        motivi.append(f"+{add} {it_hits} segnali di contesto italiano in bio")
    if ".it/" in ext or ext.endswith(".it"):
        score += 4
        motivi.append("+4 dominio .it nel link esterno")
    if _IT_PHONE_RE.search(low):
        score += 3
        motivi.append("+3 telefono in formato italiano (mobile 3xx o fisso 0xx)")

    en_hits = sum(1 for w in EN_NOISE_WORDS if w in low)
    if en_hits:
        pen = en_hits * 4
        score -= pen
        motivi.append(f"-{pen} {en_hits} espressioni tipiche di distributori esteri in inglese")
    if it_hits == 0 and not ext.endswith(".it") and en_hits:
        score -= 4
        motivi.append("-4 nessun segnale italiano trovato, solo segnali esteri")

    return score, "; ".join(motivi)


def classify_tipo(profile: dict, username: str) -> tuple[str, int, int, list[str]]:
    """Ritorna (tipo, salon_score, dist_score, motivi[]). Non indovina: se i
    segnali non bastano, il tipo è 'incerto', mai forzato a salone/distributore."""
    bio = profile.get("biography") or ""
    low = _norm(bio)
    uname = (username or "").lower()
    cat = _norm(profile.get("category_name"))
    motivi = []

    salon_hits = [kw for kw in SALON_KEYWORDS if kw in low]
    dist_hits = [kw for kw in DISTRIBUTOR_KEYWORDS if kw in low]
    salon_score = len(salon_hits) * 2
    dist_score = len(dist_hits) * 2
    if salon_hits:
        motivi.append(f"parole salone in bio: {', '.join(salon_hits)}")
    if dist_hits:
        motivi.append(f"parole distribuzione in bio: {', '.join(dist_hits)}")

    address_like = bool(_ADDRESS_RE.search(low))
    hours_like = bool(_HOURS_RE.search(low))
    phone_like = bool(_PHONE_RE.search(low))
    booking_like = any(w in low for w in _BOOKING_WORDS)

    if address_like:
        salon_score += 3
        motivi.append("indirizzo (via/piazza/corso) in bio")
    if hours_like:
        salon_score += 2
        motivi.append("orari di apertura in bio")
    if phone_like:
        salon_score += 1
        motivi.append("numero di telefono in bio")
    if booking_like:
        salon_score += 2
        motivi.append("invito a prenotare/appuntamento in bio")

    # Segnale distributore: indirizzo CON orari al pubblico insieme a lessico di
    # distribuzione è un pattern misto (grossista con anche un punto vendita) —
    # non tipico del salone puro, si penalizza leggermente il lato salone.
    if dist_hits and address_like and hours_like:
        salon_score = max(0, salon_score - 2)
        motivi.append("indirizzo+orari insieme a lessico di distribuzione: pattern misto, "
                       "punteggio salone penalizzato")

    brands = detect_competitor_brands(bio)
    if len(brands) >= 2:
        dist_score += 4
        motivi.append(f"cita insieme più marchi concorrenti ({', '.join(brands)}): "
                       "segnale forte di distributore")
    elif len(brands) == 1:
        dist_score += 1
        motivi.append(f"cita il marchio concorrente '{brands[0]}' (segnale debole da solo)")

    if profile.get("business_email"):
        dist_score += 1
        motivi.append("email business presente (segnale debole di account commerciale)")

    ext = _norm(profile.get("external_url"))
    if ext and any(w in ext for w in ("catalog", "listino", "b2b", "ordini")):
        dist_score += 3
        motivi.append("link esterno con parola catalogo/listino/B2B/ordini")

    # Un account "_official"/"ufficiale" con parole di distribuzione ma senza il
    # lessico della RIVENDITA (distribu/rivend/ingross/importat/wholesale/b2b/
    # forniture) è più probabile che sia il brand produttore stesso, non un
    # distributore terzo.
    if dist_hits and not any(w in low for w in _MANUFACTURER_ESCAPE):
        if "official" in uname or "ufficiale" in low:
            dist_score = dist_score // 2
            motivi.append("possibile account brand/produttore (non distributore): "
                           "punteggio distribuzione dimezzato")

    hair_context = any(w in low or w in cat for w in HAIR_CONTEXT_WORDS)

    if salon_score == 0 and dist_score == 0:
        tipo = "incerto" if hair_context else "non_pertinente"
        motivi.append("nessun segnale chiaro di salone o distributore"
                       + (" ma contesto hair/beauty presente" if hair_context else ""))
    elif salon_score >= 3 and salon_score >= dist_score * 1.3:
        tipo = "salone"
    elif dist_score >= 3 and dist_score >= salon_score * 1.3:
        tipo = "distributore"
    else:
        tipo = "incerto"
        motivi.append(f"segnali ambigui (salone={salon_score}, distributore={dist_score}): "
                       "non si forza la classificazione")

    return tipo, salon_score, dist_score, motivi


def score_candidate(tipo: str, salon_score: int, dist_score: int, profile: dict,
                     hook: str, hook_fonte: str) -> tuple[int, list[str]]:
    """0-100, ogni contributo tracciato in chiaro (mai un numero senza motivo)."""
    if tipo == "non_pertinente":
        return 0, ["0: non pertinente al settore hair-care, non si assegna punteggio"]

    base = min(max(salon_score, dist_score) * 5, 40)
    motivi = [f"+{base} confidenza classificazione ({tipo})"]
    score = base

    followers = profile.get("follower_count") or 0
    if 100 <= followers <= 50000:
        score += 10
        motivi.append("+10 follower in range plausibile per un business locale (100-50k)")
    elif followers == 0 or followers > 500000:
        score -= 10
        motivi.append("-10 follower fuori range (probabile dato mancante o account non pertinente)")

    if profile.get("business_email"):
        score += 10
        motivi.append("+10 email business pubblica")

    ext = (profile.get("external_url") or "").lower()
    if ext:
        if any(w in ext for w in ("listino", "catalog", "shop", "order", "b2b")):
            score += 8
            motivi.append("+8 link esterno con parola listino/catalogo/ordini")
        else:
            score += 3
            motivi.append("+3 link esterno presente")

    if profile.get("is_business_account"):
        score += 5
        motivi.append("+5 account business/professional")

    if hook:
        score += 15
        motivi.append(f"+15 aggancio reale trovato ({hook_fonte})")

    recent = profile.get("recent_posts") or []
    if recent:
        score += 10
        motivi.append(f"+10 account attivo ({len(recent)} post recenti visibili)")
    else:
        score -= 10
        motivi.append("-10 nessun post recente visibile: possibile account fermo o privato")

    # Il filtro anti-rumore geografico si applica ai DISTRIBUTORI: è lì che la
    # ricerca a ritroso sui marchi porta account esteri dello stesso brand.
    if tipo == "distributore":
        it_delta, it_motivo = italian_context_score(profile)
        if it_motivo:
            score += it_delta
            motivi.append(f"contesto italiano: {it_motivo}")

    return max(0, min(100, score)), motivi


# ================================================================= aggancio (hook)
# Ogni ramo cita la SUA fonte reale. Se nessuno scatta, hook resta vuoto: il
# composer sa scrivere senza, un aggancio inventato brucia il contatto (§ regola
# non negoziabile, vedi composer.py).
TOPIC_WORDS = ["biondo", "balayage", "colore", "extension", "trecce", "barba", "ricci",
               "liscio", "cheratina", "meches", "shatush", "degrade", "rasatura"]
_OPENING_RE = re.compile(
    r"(nuova sede|seconda sede|apriamo (a |il )?|abbiamo aperto|nuovo salone|"
    r"grand opening|new location)")
_SINCE_RE = re.compile(r"\bdal (19|20)\d{2}\b")


def extract_hook(bio: str, recent_posts: list[dict]) -> tuple[str, str]:
    bio_low = _norm(bio)

    m = _OPENING_RE.search(bio_low)
    if m:
        return "menziona apertura/nuova sede in bio", "bio"

    m = _SINCE_RE.search(bio_low)
    if m:
        anno = int(m.group(0)[-4:])
        anni = date.today().year - anno
        if anni in (5, 10, 15, 20, 25, 30, 40, 50):
            return (f"quest'anno festeggiano {anni} anni di attività "
                     f"(dal {anno}, dichiarato in bio)", "bio")

    if recent_posts:
        counts: dict[str, int] = {}
        for p in recent_posts:
            txt = _norm(p.get("text"))
            for w in TOPIC_WORDS:
                if w in txt:
                    counts[w] = counts.get(w, 0) + 1
        if counts:
            top, n = max(counts.items(), key=lambda kv: kv[1])
            if n >= 3:
                return (f"pubblicano spesso di '{top}'",
                        f"{n}/{len(recent_posts)} post recenti")

        for p in recent_posts:
            if _OPENING_RE.search(_norm(p.get("text"))):
                return "post recente menziona una nuova apertura", f"post del {p.get('date') or '?'}"

    return "", ""


# ================================================================= città
_PIN_RE = re.compile(r"📍\s*:?\s*([^\n📞☎️✂️💇\|·•\-–]{3,40})")
_CAP_CITY_RE = re.compile(r"\b\d{5}\b\s+([A-ZÀ-Ù][\wà-ù'.]+(?:\s[A-ZÀ-Ù][\wà-ù'.]+){0,2})")
_ADDR_CITY_RE = re.compile(
    r"\b(?:via|viale|piazza|corso)\b[^,\n]{3,40},\s*([A-ZÀ-Ù][\wà-ù'.]+(?:\s[A-ZÀ-Ù][\wà-ù'.]+){0,2})",
    re.IGNORECASE)


def extract_city(profile: dict) -> tuple[str, str]:
    """Non indovina: prova nell'ordine il campo business dell'account, il
    geo-tag reale sui post recenti, poi pattern di bio (📍, CAP+località,
    indirizzo+città) — mai una città dedotta dal nome del brand o dal contesto."""
    if profile.get("city_name"):
        return profile["city_name"], "campo business del profilo IG"

    posts = profile.get("recent_posts") or []
    loc_counts: dict[str, int] = {}
    for p in posts:
        loc = p.get("location")
        if loc:
            loc_counts[loc] = loc_counts.get(loc, 0) + 1
    if loc_counts:
        top, n = max(loc_counts.items(), key=lambda kv: kv[1])
        return top, f"geo-tag su {n}/{len(posts)} post recenti"

    bio = profile.get("biography") or ""
    m = _PIN_RE.search(bio)
    if m:
        return m.group(1).strip(" ,."), "bio (indicatore 📍)"
    m = _CAP_CITY_RE.search(bio)
    if m:
        return m.group(1).strip(), "bio (CAP + località)"
    m = _ADDR_CITY_RE.search(bio)
    if m:
        return m.group(1).strip(), "bio (indirizzo)"

    return "", ""


# ================================================================= ricerca (lane)
def _search_lane(queries: list[str], hashtags: list[str], label_prefix: str,
                  budget: "Budget", errors: list, pages_per_query: int = 2) -> dict[str, str]:
    """Esegue una lista di query dedicate (+ hashtag) e ritorna username->fonte.
    Usata sia per la lane distributori (query dedicate) sia per la ricerca a
    ritroso sui marchi (una query per brand)."""
    pool: dict[str, str] = {}
    for q in queries:
        for page in range(1, pages_per_query + 1):
            if budget.exhausted():
                return pool
            try:
                res = search_profiles_page(q, cursor=str(page) if page > 1 else None)
                budget.spend()
            except DiscoveryError as e:
                errors.append(f"search_profiles '{q}' pagina {page}: {e}")
                break
            profiles = res.get("profiles") or []
            if not profiles:
                break
            for p in profiles:
                uname = p.get("username")
                if uname and uname not in pool:
                    pool[uname] = f"{label_prefix}:{q}#p{page}"
    for tag in hashtags:
        if budget.exhausted():
            return pool
        try:
            res = search_hashtag(tag)
            budget.spend()
        except DiscoveryError as e:
            errors.append(f"search_hashtag #{tag}: {e}")
            continue
        for post in (res.get("posts") or []):
            owner = (post.get("owner") or {}).get("username")
            if owner and owner not in pool:
                pool[owner] = f"{label_prefix}:hashtag#{tag}"
    return pool


def _allocate(dist_list: list[str], kw_list: list[str], max_profili: int,
              dist_share: float = 0.6) -> tuple[list[str], list[str]]:
    """I distributori sono la priorità #1 del cliente (i saloni la #3): riservano
    ALMENO dist_share della capacità. Se una lane non riempie la sua quota,
    l'altra recupera lo spazio — niente slot sprecati."""
    dist_quota = min(len(dist_list), round(max_profili * dist_share))
    kw_quota = min(len(kw_list), max_profili - dist_quota)
    leftover = max_profili - dist_quota - kw_quota
    if leftover > 0:
        extra = min(leftover, len(dist_list) - dist_quota)
        dist_quota += extra
        leftover -= extra
    if leftover > 0:
        extra = min(leftover, len(kw_list) - kw_quota)
        kw_quota += extra
    return dist_list[:dist_quota], kw_list[:kw_quota]


# ================================================================= orchestratore
def run_discovery(con, keyword: str, max_profili: int = 60, espandi: bool = False,
                   citta: str | None = None, budget_chiamate: int | None = None) -> dict:
    errors: list[str] = []

    search_pages = min(11, max(2, (max_profili // 8) + 1))
    search_calls_budget = (search_pages + len(HASHTAGS_IT) + 1
                            + len(DISTRIBUTOR_QUERIES) * 2 + len(DISTRIBUTOR_HASHTAGS)
                            + len(BRAND_REVERSE_QUERIES) * 1)
    default_budget = search_calls_budget + max_profili + (max_profili if espandi else 0)
    budget = Budget(budget_chiamate or default_budget)

    # A) lane "parola chiave" — di norma trova SALONI (comportamento storico)
    pool_keyword: dict[str, str] = {}
    for page in range(1, search_pages + 1):
        if budget.exhausted():
            break
        try:
            res = search_profiles_page(keyword, cursor=str(page) if page > 1 else None)
            budget.spend()
        except DiscoveryError as e:
            errors.append(f"search_profiles pagina {page}: {e}")
            break
        profiles = res.get("profiles") or []
        if not profiles:
            break
        for p in profiles:
            uname = p.get("username")
            if uname and uname not in pool_keyword:
                pool_keyword[uname] = f"search:{keyword}#p{page}"

    tag_kw = re.sub(r"\s+", "", _norm(keyword))
    hashtags_kw = list(dict.fromkeys(HASHTAGS_IT + ([tag_kw] if tag_kw else [])))
    for tag in hashtags_kw:
        if budget.exhausted():
            break
        try:
            res = search_hashtag(tag)
            budget.spend()
        except DiscoveryError as e:
            errors.append(f"search_hashtag #{tag}: {e}")
            continue
        for post in (res.get("posts") or []):
            owner = (post.get("owner") or {}).get("username")
            if owner and owner not in pool_keyword:
                pool_keyword[owner] = f"hashtag:#{tag}"

    # B) lane "distributori" — SEMPRE attiva (priorità #1 del cliente, non
    # opzionale): query dedicate + ricerca a ritroso dai marchi concorrenti.
    pool_dist = _search_lane(DISTRIBUTOR_QUERIES, DISTRIBUTOR_HASHTAGS, "dist-query", budget, errors)
    for brand in BRAND_REVERSE_QUERIES:
        sub = _search_lane([f"rivenditore {brand}"], [], f"brand-reverse:{brand}", budget, errors,
                            pages_per_query=1)
        for u, src in sub.items():
            pool_dist.setdefault(u, src)

    dist_list = list(pool_dist.keys())
    kw_list = [u for u in pool_keyword if u not in pool_dist]  # evita doppio fetch
    dist_selected, kw_selected = _allocate(dist_list, kw_list, max_profili)
    # distributori prima: se il budget finisce a metà, la priorità #1 è già servita.
    pool = {**{u: pool_dist[u] for u in dist_selected}, **{u: pool_keyword[u] for u in kw_selected}}
    ordered = dist_selected + kw_selected

    stats = {
        "trovati_pool": len(pool_keyword) + len(pool_dist), "profili_analizzati": 0,
        "per_tipo": {}, "esclusi_citta": 0, "espansi": 0, "errori": errors,
        "budget_usato": 0, "budget_max": budget.max_calls,
        "per_marchio": {}, "con_hook": 0, "con_citta": 0, "fonte_lane": {},
        "pool_distributori": len(pool_dist), "pool_saloni": len(pool_keyword),
    }

    # C) arricchimento profilo per profilo. Coda (non lista fissa): con
    # --espandi i profili correlati vi rientrano — SOLO dai distributori, dove
    # la rete è più densa (punto esplicito del cliente).
    queue = list(ordered)
    visited: set[str] = set()
    results = []

    while queue and len(visited) < max_profili:
        if budget.exhausted():
            errors.append(f"budget chiamate esaurito ({budget.used}/{budget.max_calls}): "
                           f"fermato con {len(visited)} profili analizzati")
            break
        uname = queue.pop(0)
        if uname in visited:
            continue
        visited.add(uname)
        scoperto_da = pool.get(uname, "espansione")

        try:
            profile = get_profile(uname)
            budget.spend()
        except DiscoveryError as e:
            errors.append(f"{uname}: {e}")
            continue
        if profile is None:
            errors.append(f"{uname}: profilo non leggibile (privato, rimosso, o risposta inattesa)")
            continue

        stats["profili_analizzati"] += 1
        lane = scoperto_da.split(":", 1)[0]
        stats["fonte_lane"][lane] = stats["fonte_lane"].get(lane, 0) + 1

        if citta:
            haystack = _norm(" ".join([profile["biography"], profile["city_name"], profile["external_url"]]))
            if _norm(citta) not in haystack:
                stats["esclusi_citta"] += 1
                continue

        tipo, salon_s, dist_s, motivi_tipo = classify_tipo(profile, uname)
        hook, hook_fonte = extract_hook(profile["biography"], profile["recent_posts"])
        citta_val, citta_fonte = extract_city(profile)
        competitor_list = detect_competitor_brands(profile["biography"])
        competitor = ", ".join(competitor_list) if competitor_list else None
        score, motivi_score = score_candidate(tipo, salon_s, dist_s, profile, hook, hook_fonte)
        motivo = "; ".join(motivi_tipo + motivi_score
                            + ([f"città: {citta_fonte}"] if citta_val else []))

        store.upsert_candidate(
            con, uname,
            full_name=profile["full_name"], bio=profile["biography"],
            followers=profile["follower_count"], following=profile["following_count"],
            posts_count=profile["media_count"], external_url=profile["external_url"],
            business_email=profile["business_email"], business_phone=profile["business_phone"],
            city=citta_val, zone=None, country="IT", lang="it",
            competitor_brand=competitor, tipo=tipo, score=score, motivo_score=motivo,
            hook=hook, hook_fonte=hook_fonte, scoperto_da=scoperto_da,
        )
        stats["per_tipo"][tipo] = stats["per_tipo"].get(tipo, 0) + 1
        if hook:
            stats["con_hook"] += 1
        if citta_val:
            stats["con_citta"] += 1
        if tipo == "distributore" and competitor_list:
            for b in competitor_list:
                stats["per_marchio"][b] = stats["per_marchio"].get(b, 0) + 1
        results.append({"username": uname, "tipo": tipo, "score": score, "hook": hook,
                         "city": citta_val, "brand": competitor})

        if espandi and tipo == "distributore" and len(visited) < max_profili:
            for rel in profile["related"]:
                if rel not in visited and rel not in queue:
                    queue.append(rel)
                    pool.setdefault(rel, f"espansione:{uname}")
                    stats["espansi"] += 1

    stats["budget_usato"] = budget.used
    results.sort(key=lambda r: r["score"], reverse=True)
    stats["top5"] = results[:5]
    stats["top_distributori"] = [r for r in results if r["tipo"] == "distributore"][:5]
    return stats


# ================================================================= ponte verso prospects
def _candidate_to_prospect_row(r) -> dict:
    """Mappa un candidato promosso al formato CSV_FIELDS già atteso da `prospects`
    (vedi store.CSV_FIELDS / cli.cmd_import). Nessuna riscrittura del resto della
    pipeline: da qui in poi il candidato è indistinguibile da una riga importata
    a mano."""
    tipo = r["tipo"]
    if tipo == "salone":
        # prospect_type="salon" attiva il gate zone esclusive in zones.check() al
        # prossimo tick — senza mappa zone (data/zones.json vuota) finisce sempre
        # in escalation umana. È voluto: niente indovinelli qui.
        persona, prospect_type = "salon", "salon"
    else:
        # distributore: se c'è un marchio concorrente rilevato in bio, si usa
        # l'angolo "wedge" del copione (§2 LinkedIn ITALIA); altrimenti il
        # registro "piccolo distributore, curioso ma diffidente" (§3). In
        # entrambi i casi l'unico identificativo disponibile da IG è
        # instagram_username: il campo `persona` sceglie solo la SEZIONE di
        # contenuto da citare nel prompt (composer.py), il canale reale resta
        # instagram — vedi PERSONA_SECTION in composer.py.
        persona = "it_distributor_competitor" if r["competitor_brand"] else "it_distributor_small"
        prospect_type = "distributor"

    full_name = r["full_name"] or r["username"]
    return {
        "name": full_name,
        "first_name": full_name.split()[0] if full_name else "",
        "company": r["full_name"] or "",
        "persona": persona,
        "prospect_type": prospect_type,
        "lang": r["lang"] or "it",
        "country": r["country"] or "IT",
        "city": r["city"] or "",
        "zone": r["zone"] or "",
        "competitor_brand": (r["competitor_brand"] or "").split(",")[0].strip(),
        "hook": r["hook"] or "",
        "linkedin_public_id": "",
        "instagram_username": r["username"],
        "email": r["business_email"] or "",
        "phone": r["business_phone"] or "",
    }


# ================================================================= CLI
def cmd_discover(args):
    con = store.connect()
    print(f'=== DISCOVER · keyword="{args.keyword}" · max {args.max_profili} profili'
          + (" · espansione ON (solo da distributori)" if args.espandi else "")
          + (f" · città={args.citta}" if args.citta else "") + " ===\n")
    stats = run_discovery(con, args.keyword, max_profili=args.max_profili,
                           espandi=args.espandi, citta=args.citta)
    print(f"pool distributori: {stats['pool_distributori']} username unici  ·  "
          f"pool saloni (da keyword): {stats['pool_saloni']} username unici")
    print(f"profili analizzati: {stats['profili_analizzati']}  ·  "
          f"espansi via correlati: {stats['espansi']}")
    if args.citta:
        print(f"esclusi per città non corrispondente: {stats['esclusi_citta']}")
    print(f"chiamate API usate: {stats['budget_usato']}/{stats['budget_max']}")

    print("\nper tipo:")
    if not stats["per_tipo"]:
        print("  nessuno")
    for tipo, n in sorted(stats["per_tipo"].items(), key=lambda kv: -kv[1]):
        print(f"  {tipo:<15}{n}")

    print(f"\ncon aggancio reale: {stats['con_hook']}/{stats['profili_analizzati']}  ·  "
          f"con città nota: {stats['con_citta']}/{stats['profili_analizzati']}")

    if stats["per_marchio"]:
        print("\ndistributori per marchio concorrente citato:")
        for b, n in sorted(stats["per_marchio"].items(), key=lambda kv: -kv[1]):
            print(f"  {b:<22}{n}")

    if stats["fonte_lane"]:
        print("\nresa per fonte (quanti profili analizzati sono arrivati da lì):")
        for lane, n in sorted(stats["fonte_lane"].items(), key=lambda kv: -kv[1]):
            print(f"  {lane:<20}{n}")

    if stats["errori"]:
        print(f"\n{len(stats['errori'])} errori (non hanno fermato il run):")
        for e in stats["errori"][:15]:
            print(f"  · {e}")

    if stats["top_distributori"]:
        print("\ntop distributori per punteggio:")
        for r in stats["top_distributori"]:
            print(f"  {r['score']:>3}  {r['username']:<28}{(r['brand'] or '-'):<20}"
                  f"{(r['city'] or '-'):<16}{r['hook'][:40]}")
    else:
        print("\nnessun distributore trovato in questo run.")

    print("\ntop 5 generale per punteggio:")
    for r in stats["top5"]:
        print(f"  {r['score']:>3}  {r['username']:<28}{r['tipo']:<14}{r['hook'][:60]}")
    return 0


def cmd_candidates(args):
    con = store.connect()
    rows = store.all_candidates(con, tipo=args.tipo, stato=args.stato)
    print(f"=== CANDIDATI · {len(rows)} ===")
    hdr = f"{'USERNAME':<26}{'TIPO':<14}{'SCORE':<7}{'STATO':<10}{'FOLLOWER':<10}{'CITTÀ':<16}{'HOOK'}"
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r['username'][:25]:<26}{(r['tipo'] or '-'):<14}{(r['score'] or 0):<7}"
              f"{r['stato']:<10}{(r['followers'] or 0):<10}{(r['city'] or '-')[:15]:<16}"
              f"{(r['hook'] or '')[:40]}")
    return 0


def cmd_promote(args):
    con = store.connect()
    rows = store.all_candidates(con, tipo=args.tipo, stato="nuovo")
    promoted = skipped_low = skipped_bad_tipo = skipped_dup = 0
    for r in rows:
        if (r["score"] or 0) < args.min_score:
            skipped_low += 1
            continue
        if r["tipo"] not in ("salone", "distributore"):
            skipped_bad_tipo += 1
            continue
        row = _candidate_to_prospect_row(r)
        if args.dry_run:
            print(f"[dry] promuoverei {r['username']} (score {r['score']}, {r['tipo']}) → "
                  f"persona={row['persona']} prospect_type={row['prospect_type']}")
            promoted += 1
            continue
        pid = store.import_prospect_row(con, row)
        if pid:
            nota = ""
            if r["tipo"] == "distributore":
                # Fix ⑤ (revisione 3/8): il salone è protetto dal gate zone
                # esclusive ad ogni tick (zones.check()), il distributore no —
                # con min_score=50 un candidato a 61 entrava in sequenza senza
                # che nessuno l'avesse mai guardato. Si forza `skipped` (motivo
                # "da rivedere"): l'unica transizione che ne esce è la
                # riabilitazione manuale (skipped→queued, già prevista in
                # statemachine.py), qui azionata da `cli.py review --approva`.
                for ch in config.CHANNELS:
                    st = store.get_state(con, pid, ch)
                    if st["state"] == "queued":
                        store.set_state(con, pid, ch, "skipped",
                                        reason="da rivedere: promosso da discovery, revisione "
                                               "umana richiesta — sheis-outreach review --prospect "
                                               f"{pid} --approva")
                store.event(con, pid, "-", "needs_review",
                            f"distributore score={r['score']} in attesa di validazione umana")
                nota = "  [in attesa di revisione: `review --prospect ... --approva`]"
            store.set_candidate_stato(con, r["username"], "promosso")
            store.event(con, pid, "-", "promoted_from_discovery",
                        f"candidate={r['username']} score={r['score']} tipo={r['tipo']}")
            print(f"[OK]  {r['username']} → prospect {pid}{nota}")
            promoted += 1
        else:
            skipped_dup += 1
            print(f"[skip] {r['username']}: già presente come prospect")
    print(f"\npromossi: {promoted}  ·  sotto soglia ({args.min_score}): {skipped_low}  ·  "
          f"tipo non promuovibile: {skipped_bad_tipo}  ·  già prospect: {skipped_dup}")
    return 0

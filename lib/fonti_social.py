"""Fonti di ricerca di mercato — organico e pubblicitario, sei piattaforme.

COSA AGGIUNGE RISPETTO A `scrapecreators.py`
-------------------------------------------
`scrapecreators.py` è il TRASPORTO: chiave, chiamata HTTP, conteggio dei
crediti. Sa parlare solo di Instagram perché è nato per il monitoraggio del
profilo di SHEis.

Questo modulo è la LETTURA: sa interrogare tutte le piattaforme che servono a
un'analisi di mercato e — soprattutto — **normalizza**. Le sei risposte hanno
sei forme diverse e pesano fino a 2,4 MB l'una (misurato: una sola ricerca per
parola chiave su TikTok). Restituirle grezze significherebbe rendere
impossibile qualunque sintesi e riempire di spazzatura chi legge.

Qui ogni fonte esce in UNA di due forme:

  · CONTENUTO ORGANICO  — chi ha pubblicato, cosa ha detto, quanto ha girato;
  · INSERZIONE          — chi paga, cosa dice, **da quanti giorni gira**.

I GIORNI DI ATTIVITÀ SONO LA MISURA
-----------------------------------
Le librerie inserzioni non pubblicano la spesa né le conversioni. Ma pubblicano
la data di inizio, e nessuno tiene viva per novanta giorni una campagna che
perde soldi. La durata è il solo segnale di performance disponibile
pubblicamente, ed è affidabile proprio perché costa: un'inserzione ferma da
sei mesi è una che qualcuno continua a pagare.

Per questo `giorni_attivi` non è un campo fra i tanti: è il criterio con cui si
ordinano i risultati. Un'inserzione nuova può essere un test; una vecchia è una
risposta.

COSA FUNZIONA DAVVERO — misurato il 2026-08-04, non dedotto
-----------------------------------------------------------
    organico       instagram ✓   tiktok ✓   youtube ✓   linkedin ✓   facebook ✓*
    pubblicitario  meta ✓ (IG+FB insieme)   linkedin ✓†   google ✓†   tiktok ✗

  * Facebook non ha una ricerca organica pubblica per parola chiave: quello
    che si legge sono gli INSERZIONISTI. È una risposta diversa da quella
    chiesta, e viene dichiarata come tale.
  † LinkedIn e Google cercano per NOME DI INSERZIONISTA, non per tema. Con un
    tema rispondono 200 e zero risultati: non falliscono, tacciono. Per questo
    `esegui_capacita` pretende `concorrenti` per quelle due.
  ✗ La libreria inserzioni TikTok risponde 404 su tutte le rotte provate con
    questo abbonamento. L'organico TikTok funziona.

Le forme dei campi qui sotto sono lette dalle risposte vere, non dedotte dalla
documentazione: `total_active_time` per esempio ESISTE come chiave ma torna
None, quindi i giorni si calcolano da `start_date`/`end_date` (epoch).
"""
from __future__ import annotations

import re as _re
import time
from dataclasses import dataclass, field
from typing import Any

from .scrapecreators import ScrapeCreatorsClient, Esito

# Le sei piattaforme che l'analisi sa coprire. Chi ne chiede un'altra deve
# vederselo dire, non ritrovarsi un risultato più povero senza spiegazione.
PIATTAFORME = ("instagram", "facebook", "tiktok", "youtube", "linkedin", "google")

# Sopra questa soglia un'inserzione non è più un test: è una che funziona.
GIORNI_LONGEVA = 90


# ══════════════════════════════════════════════════════════ forme normalizzate

@dataclass
class Contenuto:
    """Un post organico, da qualunque piattaforma."""
    piattaforma: str
    autore: str = ""
    autore_follower: int | None = None
    testo: str = ""
    url: str = ""
    data: str = ""
    tipo: str = ""                      # post | reel | video | short
    visualizzazioni: int | None = None
    like: int | None = None
    commenti: int | None = None
    condivisioni: int | None = None
    salvataggi: int | None = None

    @property
    def interazioni(self) -> int:
        return sum(v or 0 for v in (self.like, self.commenti, self.condivisioni, self.salvataggi))

    @property
    def punteggio(self) -> float:
        """Interazioni su visualizzazioni quando le visualizzazioni ci sono,
        altrimenti interazioni su follower. Due denominatori diversi non sono
        confrontabili fra loro, ed è giusto così: servono a ordinare DENTRO una
        piattaforma, non a dire che TikTok batte Instagram."""
        base = self.visualizzazioni or self.autore_follower or 0
        return round(self.interazioni / base, 5) if base else 0.0

    def dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if v not in (None, "", 0)}
        d["punteggio"] = self.punteggio
        d["interazioni"] = self.interazioni
        return d


@dataclass
class Inserzione:
    """Un'inserzione, da qualunque libreria."""
    piattaforma: str
    inserzionista: str = ""
    testo: str = ""
    titolo: str = ""
    cta: str = ""
    url: str = ""
    attiva: bool = False
    dal: str = ""
    giorni_attivi: int | None = None
    formato: str = ""                   # IMAGE | VIDEO | DCO …
    dove_gira: list[str] = field(default_factory=list)
    immagini: list[str] = field(default_factory=list)
    video: list[str] = field(default_factory=list)
    paese: str = ""

    @property
    def longeva(self) -> bool:
        return (self.giorni_attivi or 0) >= GIORNI_LONGEVA

    def dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if v not in (None, "", [], False)}
        d["attiva"] = self.attiva
        d["longeva"] = self.longeva
        return d


@dataclass
class Raccolta:
    """Il risultato di UNA interrogazione. `errore` valorizzato significa che
    la fonte non ha risposto: chi legge deve poterlo distinguere da «ha
    risposto e non c'era niente», che è un'informazione diversa."""
    capacita: str
    fonte: str
    piattaforme: list[str]
    contenuti: list[Contenuto] = field(default_factory=list)
    inserzioni: list[Inserzione] = field(default_factory=list)
    errore: str = ""
    crediti_rimasti: int | None = None
    parametri: dict = field(default_factory=dict)

    @property
    def quanti(self) -> int:
        return len(self.contenuti) + len(self.inserzioni)

    def dict(self, massimo: int = 40) -> dict:
        """`massimo` esiste perché una ricerca TikTok torna 2,4 MB: si tiene il
        meglio, ordinato, e si DICE quanto è stato lasciato fuori — troncare in
        silenzio farebbe leggere «erano solo venti» a chi ne aveva trovati mille."""
        cont = sorted(self.contenuti, key=lambda c: c.punteggio, reverse=True)
        ins = sorted(self.inserzioni, key=lambda a: (a.giorni_attivi or 0), reverse=True)
        d: dict[str, Any] = {
            "capacita": self.capacita,
            "fonte": self.fonte,
            "piattaforme": self.piattaforme,
            "quanti_trovati": self.quanti,
            "parametri": self.parametri,
        }
        if self.errore:
            d["errore"] = self.errore
        if cont:
            d["contenuti"] = [c.dict() for c in cont[:massimo]]
            if len(cont) > massimo:
                d["contenuti_non_mostrati"] = len(cont) - massimo
        if ins:
            d["inserzioni"] = [a.dict() for a in ins[:massimo]]
            d["inserzioni_longeve"] = sum(1 for a in ins if a.longeva)
            if len(ins) > massimo:
                d["inserzioni_non_mostrate"] = len(ins) - massimo
        if self.crediti_rimasti is not None:
            d["crediti_rimasti"] = self.crediti_rimasti
        return d


# ═══════════════════════════════════════════════════════════════════ utilità

def _int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _giorni(inizio: Any, fine: Any) -> int | None:
    """Epoch → giorni. `fine` mancante o futura significa «ancora in corso»:
    si conta fino a oggi, che è la risposta giusta per un'inserzione viva."""
    i = _int(inizio)
    if not i:
        return None
    f = _int(fine) or int(time.time())
    f = min(f, int(time.time()))
    return max(0, (f - i) // 86400)


def _data(epoch: Any) -> str:
    e = _int(epoch)
    if not e:
        return ""
    return time.strftime("%Y-%m-%d", time.gmtime(e))


def _nessun_risultato(errore: str) -> bool:
    """Distingue «la fonte non ha trovato niente» da «la fonte è rotta».

    ⚠️ MISURATO il 2026-08-04. ScrapeCreators risponde **404 con
    `error: not_found`** quando la ricerca non trova nulla — non quando la
    rotta non esiste. Provato: `/v1/linkedin/search/posts?query=professional
    hair color` → 200 con 10 post; la stessa rotta con la frase italiana
    «colorazione professionale senza ammoniaca» → 404.

    Trattarli allo stesso modo produce il peggiore dei due errori possibili:
    l'analisi dichiara «LinkedIn non ha risposto» quando LinkedIn ha risposto
    benissimo — semplicemente in italiano su quel tema non parla nessuno. Il
    primo fa cercare un guasto che non c'è; il secondo è un dato di mercato.
    """
    e = errore.lower()
    return "not_found" in e or ('404' in e and 'not found' in e)


def hashtag_da(tema: str) -> str:
    """Un tema in un hashtag valido.

    ⚠️ MISURATO il 2026-08-04: `/v1/instagram/search/hashtag` risponde **404**
    se l'hashtag contiene spazi. Il tema di una ricerca è una frase
    («colorazione professionale senza ammoniaca»); un hashtag non lo è mai.
    Senza questa conversione l'intera fonte Instagram organica risultava morta,
    e sembrava un guasto della fonte invece che un parametro malformato.

    Si tengono le prime tre parole significative: più lunghi non esistono.
    """
    parole = [p for p in _re.split(r"[^0-9A-Za-zÀ-ÿ]+", tema.lower()) if len(p) > 2]
    vuote = {"per", "con", "senza", "dei", "del", "della", "the", "and", "for", "professionale", "professional"}
    utili = [p for p in parole if p not in vuote] or parole
    return "".join(utili[:3]) or "haircare"


def _testo(x: Any) -> str:
    """I corpi arrivano ora come stringa ora come {'text': …}. Un solo posto
    dove gestirlo, invece di sei rami che sbagliano ognuno a modo suo."""
    if isinstance(x, str):
        return x.strip()
    if isinstance(x, dict):
        for k in ("text", "title", "value", "markup"):
            v = x.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, dict):
                t = _testo(v)
                if t:
                    return t
    return ""


# ═════════════════════════════════════════════════════════════════════ motore

class FontiSocial:
    """Interroga le fonti e normalizza. Non decide COSA interrogare: quella è
    la responsabilità di `ricerca_mercato.costruisci_piano`, che dichiara i
    costi prima di spendere."""

    def __init__(self, client: ScrapeCreatorsClient | None = None) -> None:
        self.sc = client or ScrapeCreatorsClient()

    @property
    def pronto(self) -> bool:
        return self.sc.credenziali_presenti

    @property
    def chiamate_fatte(self) -> int:
        return self.sc.chiamate_fatte

    # ------------------------------------------------------------- ORGANICO

    def instagram_hashtag_reali(self, tema: str, quanti: int = 6) -> list[tuple[str, int]]:
        """Gli hashtag che ESISTONO davvero per questo tema, col loro peso.

        ⚠️ Serve perché `/v1/instagram/search/hashtag` risponde 404 su un
        hashtag inventato. Comporre l'hashtag a tavolino dal tema
        («colorazione professionale senza ammoniaca» → #colorazioneammoniaca)
        produceva un 404 che sembrava un guasto: quell'hashtag non esiste,
        semplicemente. La ricerca libera invece restituisce i tag veri —
        misurato: #colorazioneprofessionale con 3.050 post.
        """
        e = self.sc._get("/v1/instagram/search", {"query": tema})
        if not e.ok:
            return []
        fuori: list[tuple[str, int]] = []
        for h in (e.dati.get("hashtags") or []):
            nodo = h.get("hashtag") if isinstance(h, dict) else None
            if isinstance(nodo, dict):
                nome, peso = nodo.get("name"), _int(nodo.get("media_count")) or 0
            elif isinstance(h, dict):
                nome, peso = h.get("name"), _int(h.get("media_count")) or 0
            else:
                nome, peso = str(h), 0
            if nome:
                fuori.append((nome, peso))
        return sorted(fuori, key=lambda x: x[1], reverse=True)[:quanti]

    def instagram_hashtag(self, tema: str, quanti: int = 40) -> Raccolta:
        """Post reali dagli hashtag VERI del tema. Due chiamate: prima si
        scopre quali hashtag esistono, poi si scaricano i post del più grosso —
        invece di indovinarne uno e prendere un 404."""
        reali = self.instagram_hashtag_reali(tema)
        scelto = reali[0][0] if reali else hashtag_da(tema)
        r = Raccolta("organico-instagram", "scrapecreators", ["instagram"],
                     parametri={"tema": tema, "hashtag_usato": scelto,
                                "hashtag_disponibili": [f"#{n} ({p})" for n, p in reali[:5]]})
        e = self.sc._get("/v1/instagram/search/hashtag", {"hashtag": scelto})
        if not e.ok:
            if _nessun_risultato(e.errore):
                r.errore = (f"Nessun contenuto pubblico su #{scelto}. Non è un guasto: "
                            f"su questo tema Instagram non ha risultati.")
            else:
                r.errore = e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for p in (e.dati.get("posts") or [])[:quanti]:
            nodo = p.get("node") or p
            utente = nodo.get("owner") or nodo.get("user") or {}
            didascalia = nodo.get("edge_media_to_caption") or {}
            testo = ""
            for bordo in (didascalia.get("edges") or []):
                testo = _testo((bordo or {}).get("node")) or testo
            r.contenuti.append(Contenuto(
                piattaforma="instagram",
                autore=utente.get("username") or "",
                testo=testo or _testo(nodo.get("caption")),
                url=f"https://instagram.com/p/{nodo.get('shortcode') or nodo.get('code') or ''}",
                data=_data(nodo.get("taken_at_timestamp") or nodo.get("taken_at")),
                tipo="reel" if nodo.get("is_video") else "post",
                visualizzazioni=_int(nodo.get("video_view_count") or nodo.get("play_count")),
                like=_int((nodo.get("edge_liked_by") or {}).get("count") or nodo.get("like_count")),
                commenti=_int((nodo.get("edge_media_to_comment") or {}).get("count") or nodo.get("comment_count")),
            ))
        return r

    def instagram_profili(self, query: str, quanti: int = 30) -> Raccolta:
        """Chi, su Instagram, si descrive con queste parole. Serve a leggere il
        LESSICO reale del mestiere, non a contare le interazioni."""
        r = Raccolta("profili-instagram", "scrapecreators", ["instagram"],
                     parametri={"query": query})
        e = self.sc._get("/v1/instagram/search/profiles", {"query": query})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for p in (e.dati.get("profiles") or e.dati.get("users") or [])[:quanti]:
            u = p.get("user") or p
            r.contenuti.append(Contenuto(
                piattaforma="instagram",
                autore=u.get("username") or "",
                autore_follower=_int(u.get("follower_count") or u.get("edge_followed_by", {}).get("count")),
                testo=_testo(u.get("biography")) or _testo(u.get("full_name")),
                url=f"https://instagram.com/{u.get('username') or ''}",
                tipo="profilo",
            ))
        return r

    def tiktok_parola(self, query: str, quanti: int = 40) -> Raccolta:
        r = Raccolta("organico-tiktok", "scrapecreators", ["tiktok"],
                     parametri={"query": query})
        e = self.sc._get("/v1/tiktok/search/keyword", {"query": query})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for voce in (e.dati.get("search_item_list") or [])[:quanti]:
            a = voce.get("aweme_info") or voce
            st = a.get("statistics") or {}
            au = a.get("author") or {}
            r.contenuti.append(Contenuto(
                piattaforma="tiktok",
                autore=au.get("unique_id") or au.get("nickname") or "",
                autore_follower=_int(au.get("follower_count")),
                testo=_testo(a.get("desc")),
                url=f"https://www.tiktok.com/@{au.get('unique_id','')}/video/{a.get('aweme_id','')}",
                data=_data(a.get("create_time")),
                tipo="video",
                visualizzazioni=_int(st.get("play_count")),
                like=_int(st.get("digg_count")),
                commenti=_int(st.get("comment_count")),
                condivisioni=_int(st.get("share_count")),
                salvataggi=_int(st.get("collect_count")),
            ))
        return r

    def youtube_ricerca(self, query: str, quanti: int = 30) -> Raccolta:
        r = Raccolta("organico-youtube", "scrapecreators", ["youtube"],
                     parametri={"query": query})
        e = self.sc._get("/v1/youtube/search", {"query": query})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        elenco = (e.dati.get("videos") or []) + (e.dati.get("shorts") or [])
        for v in elenco[:quanti]:
            canale = v.get("channel") or {}
            r.contenuti.append(Contenuto(
                piattaforma="youtube",
                autore=canale.get("title") or canale.get("handle") or v.get("channelTitle") or "",
                testo=_testo(v.get("title")),
                url=v.get("url") or (f"https://youtube.com/watch?v={v.get('id')}" if v.get("id") else ""),
                data=_testo(v.get("publishedTime")) or _data(v.get("publishedTimestamp")),
                tipo="short" if v in (e.dati.get("shorts") or []) else "video",
                visualizzazioni=_int(v.get("viewCountInt") or v.get("viewCount")),
            ))
        return r

    def linkedin_post(self, query: str, quanti: int = 30) -> Raccolta:
        r = Raccolta("organico-linkedin", "scrapecreators", ["linkedin"],
                     parametri={"query": query})
        e = self.sc._get("/v1/linkedin/search/posts", {"query": query})
        if not e.ok:
            r.errore = (f"Nessun post pubblico su «{query}». LinkedIn ha risposto: su questo tema, "
                        f"in questa lingua, non pubblica nessuno. Provare in inglese cambia il "
                        f"risultato — misurato.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for p in (e.dati.get("posts") or e.dati.get("results") or [])[:quanti]:
            au = p.get("author") or {}
            r.contenuti.append(Contenuto(
                piattaforma="linkedin",
                autore=_testo(au.get("name")) or _testo(p.get("authorName")),
                testo=_testo(p.get("text")) or _testo(p.get("commentary")),
                url=p.get("url") or p.get("postUrl") or "",
                data=_testo(p.get("postedAt")) or _testo(p.get("date")),
                tipo="post",
                like=_int(p.get("likeCount") or p.get("numLikes")),
                commenti=_int(p.get("commentCount") or p.get("numComments")),
            ))
        return r

    # -------------------------------------------------------- PUBBLICITARIO

    def meta_inserzioni(self, query: str, paese: str = "IT", quanti: int = 60) -> Raccolta:
        """La libreria inserzioni Meta copre Instagram E Facebook: è UNA sola
        chiamata per due piattaforme, e va detto — altrimenti chi chiede
        entrambe crede di aver pagato due ricerche."""
        r = Raccolta("pubblicitario-meta", "scrapecreators", ["instagram", "facebook"],
                     parametri={"query": query, "paese": paese})
        e = self.sc._get("/v1/facebook/adLibrary/search/ads",
                         {"query": query, "country": paese.upper()})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for a in (e.dati.get("searchResults") or [])[:quanti]:
            # Una riga può essere un gruppo di inserzioni (`collation`): si
            # prende lo scatto rappresentativo, che è quello che Meta mostra.
            voce = a[0] if isinstance(a, list) and a else a
            if not isinstance(voce, dict):
                continue
            s = voce.get("snapshot") or {}
            r.inserzioni.append(Inserzione(
                piattaforma="meta",
                inserzionista=s.get("page_name") or voce.get("page_name") or "",
                testo=_testo(s.get("body")),
                titolo=_testo(s.get("title")) or _testo(s.get("link_description")),
                cta=_testo(s.get("cta_text")),
                url=voce.get("url") or "",
                attiva=bool(voce.get("is_active")),
                dal=_data(voce.get("start_date")) or _testo(voce.get("start_date_string"))[:10],
                giorni_attivi=_giorni(voce.get("start_date"), voce.get("end_date")),
                formato=s.get("display_format") or "",
                dove_gira=[p for p in (voce.get("publisher_platform") or []) if p],
                immagini=[i.get("original_image_url") or i.get("resized_image_url") or ""
                          for i in (s.get("images") or []) if isinstance(i, dict)][:3],
                video=[v.get("video_hd_url") or v.get("video_sd_url") or ""
                       for v in (s.get("videos") or []) if isinstance(v, dict)][:2],
                paese=s.get("country_iso_code") or paese.upper(),
            ))
        return r

    def meta_aziende(self, query: str, quanti: int = 20) -> Raccolta:
        """Chi, con questo nome, sta facendo pubblicità. È il passo prima:
        prima si trova l'inserzionista, poi si guardano le sue inserzioni."""
        r = Raccolta("inserzionisti-meta", "scrapecreators", ["instagram", "facebook"],
                     parametri={"query": query})
        e = self.sc._get("/v1/facebook/adLibrary/search/companies", {"query": query})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for c in (e.dati.get("searchResults") or [])[:quanti]:
            if not isinstance(c, dict):
                continue
            r.contenuti.append(Contenuto(
                piattaforma="facebook",
                autore=c.get("name") or c.get("page_alias") or "",
                autore_follower=_int(c.get("likes") or c.get("page_like_count")),
                testo=_testo(c.get("category")) or _testo(c.get("verification")),
                url=f"https://www.facebook.com/{c.get('page_alias') or c.get('page_id') or ''}",
                tipo="inserzionista",
            ))
        return r

    def azienda_inserzioni(self, page_id: str, quanti: int = 40) -> Raccolta:
        """Tutte le inserzioni di UN inserzionista. È la vista che serve per
        capire il funnel di un competitor, non solo i suoi singoli annunci."""
        r = Raccolta("inserzioni-azienda", "scrapecreators", ["instagram", "facebook"],
                     parametri={"page_id": page_id})
        e = self.sc._get("/v1/facebook/adLibrary/company/ads", {"pageId": page_id})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for voce in (e.dati.get("results") or e.dati.get("searchResults") or [])[:quanti]:
            v = voce[0] if isinstance(voce, list) and voce else voce
            if not isinstance(v, dict):
                continue
            s = v.get("snapshot") or {}
            r.inserzioni.append(Inserzione(
                piattaforma="meta",
                inserzionista=s.get("page_name") or v.get("page_name") or "",
                testo=_testo(s.get("body")),
                titolo=_testo(s.get("title")),
                cta=_testo(s.get("cta_text")),
                url=v.get("url") or "",
                attiva=bool(v.get("is_active")),
                dal=_data(v.get("start_date")),
                giorni_attivi=_giorni(v.get("start_date"), v.get("end_date")),
                formato=s.get("display_format") or "",
                dove_gira=[p for p in (v.get("publisher_platform") or []) if p],
            ))
        return r

    def google_inserzionisti(self, query: str, quanti: int = 20) -> Raccolta:
        r = Raccolta("pubblicitario-google", "scrapecreators", ["google"],
                     parametri={"query": query})
        e = self.sc._get("/v1/google/adLibrary/advertisers/search", {"query": query})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for a in (e.dati.get("advertisers") or [])[:quanti]:
            if not isinstance(a, dict):
                continue
            r.contenuti.append(Contenuto(
                piattaforma="google",
                autore=a.get("name") or "",
                testo=_testo(a.get("location")) or _testo(a.get("domain")),
                url=a.get("url") or "",
                tipo="inserzionista",
            ))
        return r

    def google_inserzioni_azienda(self, advertiser_id: str, quanti: int = 40) -> Raccolta:
        r = Raccolta("inserzioni-google-azienda", "scrapecreators", ["google"],
                     parametri={"advertiser_id": advertiser_id})
        e = self.sc._get("/v1/google/company/ads", {"advertiserId": advertiser_id})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for a in (e.dati.get("ads") or e.dati.get("results") or [])[:quanti]:
            if not isinstance(a, dict):
                continue
            r.inserzioni.append(Inserzione(
                piattaforma="google",
                inserzionista=a.get("advertiserName") or a.get("advertiser") or "",
                testo=_testo(a.get("description")) or _testo(a.get("text")),
                titolo=_testo(a.get("headline")) or _testo(a.get("title")),
                url=a.get("adUrl") or a.get("url") or "",
                dal=_testo(a.get("firstShown"))[:10],
                giorni_attivi=None,
                formato=a.get("format") or a.get("adFormat") or "",
                dove_gira=["google"],
            ))
        return r

    def linkedin_inserzioni(self, azienda: str, quanti: int = 40) -> Raccolta:
        r = Raccolta("pubblicitario-linkedin", "scrapecreators", ["linkedin"],
                     parametri={"azienda": azienda})
        e = self.sc._get("/v1/linkedin/ads/search", {"company": azienda})
        if not e.ok:
            r.errore = ("Nessun risultato per questi parametri — la fonte ha risposto, "
                        "semplicemente non ha trovato niente.") if _nessun_risultato(e.errore) else e.errore
            return r
        r.crediti_rimasti = e.crediti_rimasti
        for a in (e.dati.get("ads") or [])[:quanti]:
            if not isinstance(a, dict):
                continue
            r.inserzioni.append(Inserzione(
                piattaforma="linkedin",
                inserzionista=_testo(a.get("advertiserName")) or _testo(a.get("companyName")) or azienda,
                testo=_testo(a.get("adText")) or _testo(a.get("commentary")) or _testo(a.get("description")),
                titolo=_testo(a.get("headline")) or _testo(a.get("title")),
                cta=_testo(a.get("ctaText")),
                url=a.get("adUrl") or a.get("url") or "",
                attiva=bool(a.get("isActive", a.get("is_active", False))),
                dal=_testo(a.get("firstImpressionAt") or a.get("startDate"))[:10],
                giorni_attivi=_giorni(a.get("firstImpressionAtEpoch"), a.get("lastImpressionAtEpoch")),
                formato=a.get("adType") or a.get("format") or "",
                dove_gira=["linkedin"],
            ))
        return r

    def tiktok_inserzioni(self, query: str, paese: str = "IT", quanti: int = 40) -> Raccolta:
        """⚠️ NON DISPONIBILE su questo abbonamento — misurato, non supposto.

        Il 2026-08-04 sono state provate tre varianti di rotta
        (`/v1/tiktok/ad_library/search`, `/v1/tiktok/ad/library/search`, e la
        prima con parametri `keyword`/`country_code`): tutte e tre **404**.

        Restituire una raccolta vuota senza dirlo sarebbe la cosa peggiore: chi
        chiede «TikTok, pubblicitario» leggerebbe zero inserzioni e ne
        dedurrebbe che su TikTok nessuno fa pubblicità nel suo settore — una
        conclusione falsa, tratta con sicurezza da un guasto silenzioso.
        """
        return Raccolta(
            "pubblicitario-tiktok", "scrapecreators", ["tiktok"],
            parametri={"query": query, "paese": paese},
            errore=("La libreria inserzioni TikTok non è raggiungibile con questo abbonamento "
                    "ScrapeCreators (404 su tutte le rotte provate il 2026-08-04). L'organico "
                    "TikTok funziona: il buco è solo sul pubblicitario."),
        )

# ══════════════════════════════════════════════════ mappa capacità → metodo
# La chiave è la stessa `capacita` che `ricerca_mercato.costruisci_piano`
# produce nel piano: così il piano dichiarato e l'esecuzione non possono
# divergere — se qui manca una capacità, il piano non riesce a eseguirla e lo
# dice, invece di saltarla in silenzio.

def esegui_capacita(fonti: FontiSocial, capacita: str, parametri: dict) -> Raccolta:
    """Esegue UNA capacità.

    `parametri` porta almeno `tema`; le fonti pubblicitarie usano anche `paese`
    e, per LinkedIn e Google, `concorrenti`.

    ⚠️ PERCHÉ SERVONO I CONCORRENTI. Misurato il 2026-08-04: le librerie
    inserzioni di LinkedIn e Google cercano per INSERZIONISTA, non per tema.
    Interrogate con «professional hair color salon» rispondono **200 con zero
    risultati** — cioè non falliscono, mentono per omissione. Chi legge quel
    vuoto conclude che nessuno fa pubblicità in quel settore su LinkedIn.

    La libreria Meta invece cerca davvero per parola nel testo dell'annuncio, e
    con un tema funziona: le tre fonti non sono intercambiabili e trattarle
    allo stesso modo produceva un buco che sembrava un dato.
    """
    tema = (parametri.get("tema") or parametri.get("query") or "").strip()
    paese = (parametri.get("paese") or "IT").upper()
    concorrenti = [c for c in (parametri.get("concorrenti") or []) if c]

    def per_concorrenti(metodo, capacita_nome: str, piattaforma: str) -> Raccolta:
        if not concorrenti:
            return Raccolta(
                capacita_nome, "scrapecreators", [piattaforma], parametri={"tema": tema},
                errore=(f"La libreria inserzioni {piattaforma.capitalize()} cerca per NOME di "
                        f"inserzionista, non per tema: con «{tema}» risponde vuoto senza errore. "
                        f"Serve almeno un nome di concorrente."),
            )
        unita = Raccolta(capacita_nome, "scrapecreators", [piattaforma],
                         parametri={"concorrenti": concorrenti})
        for nome in concorrenti[:8]:
            r = metodo(nome)
            unita.inserzioni.extend(r.inserzioni)
            unita.contenuti.extend(r.contenuti)
            if r.errore and not unita.errore:
                unita.errore = r.errore
            if r.crediti_rimasti is not None:
                unita.crediti_rimasti = r.crediti_rimasti
        return unita

    match capacita:
        case "organico-instagram":
            return fonti.instagram_hashtag(tema)
        case "profili-instagram":
            return fonti.instagram_profili(tema)
        case "organico-tiktok":
            return fonti.tiktok_parola(tema)
        case "organico-youtube":
            return fonti.youtube_ricerca(tema)
        case "organico-linkedin":
            return fonti.linkedin_post(tema)
        case "organico-facebook":
            # Non c'è una ricerca organica pubblica su Facebook per parola
            # chiave: quello che si può leggere sono gli INSERZIONISTI. Dirlo
            # è meglio che restituire un elenco vuoto senza motivo.
            r = fonti.meta_aziende(tema)
            r.capacita = "organico-facebook"
            return r
        case "pubblicitario-meta" | "pubblicitario-instagram" | "pubblicitario-facebook":
            return fonti.meta_inserzioni(tema, paese)
        case "pubblicitario-google":
            return per_concorrenti(
                lambda n: fonti.google_inserzionisti(n), "pubblicitario-google", "google")
        case "pubblicitario-linkedin":
            return per_concorrenti(
                lambda n: fonti.linkedin_inserzioni(n), "pubblicitario-linkedin", "linkedin")
        case "pubblicitario-tiktok":
            return fonti.tiktok_inserzioni(tema, paese)
        case _:
            return Raccolta(capacita, "nessuna", [],
                            errore=f"Capacità non implementata in fonti_social: {capacita}")

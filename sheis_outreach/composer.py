"""Compositore messaggi — Claude Code headless, alimentato dal copione approvato.

⭐ Qui si chiude il cerchio: il prompt contiene il copione (§1) PIÙ le lezioni che
Mauro ha lasciato correggendo la demo (VOICE-LEARNED.md). Quello che lui boccia
nella demo cambia i messaggi veri, senza che nessuno riscriva codice.

Il testo generato passa SEMPRE dal linter prima di essere salvato come inviabile.
"""
import re
import subprocess

from . import config
from .linter import lint

PERSONA_SECTION = {
    "estero_importer": "§1 LinkedIn ESTERO — importatore/distributore (beachhead Spagna)",
    "it_distributor_competitor": "§2 LinkedIn ITALIA — distributore con un concorrente in portafoglio (wedge, mai attacco)",
    "it_distributor_small": "§3 LinkedIn ITALIA — distributore piccolo, curioso ma diffidente",
    "instagram_cold": "§4 Instagram DM — registro corto e diretto, non LinkedIn con un'altra skin",
    "salon": "§4 ramo SALONE — gate zone esclusive",
}

TOUCH_BRIEF = {
    ("linkedin", "touch1"): "NOTA DI COLLEGAMENTO LinkedIn. MASSIMO 300 CARATTERI, spazi inclusi. "
                            "Dice chi siamo, da dove veniamo, cosa vogliamo, e CHIEDE PERMESSO. "
                            "Un solo verbo di vendita, zero aggettivi.",
    ("linkedin", "touch2"): "Messaggio dopo l'accettazione del collegamento. 4-6 righe. "
                            "Presenta l'azienda in due righe, porta la leva vera, chiude offrendo "
                            "l'uscita ('se non è il suo momento me lo dica e non insisto').",
    ("linkedin", "touch3"): "Follow-up leggero dopo silenzio. 2-3 righe. Nessuna pressione, "
                            "nessun 'le avevo scritto'. Aggiunge UN elemento nuovo e concreto.",
    ("linkedin", "touch4"): "Messaggio di chiusura. 2 righe. Accetta il non-interesse e DATA il "
                            "ritorno ('le riscrivo tra 3 mesi'). Nessun tentativo finale di vendita.",
    ("instagram", "touch1"): "DM Instagram a freddo. Frasi corte. Parte da un dettaglio reale visto "
                             "sul profilo, poi una riga su chi siamo, poi UNA domanda semplice.",
    ("instagram", "touch2"): "Secondo DM dopo risposta positiva o silenzio breve. Corto, concreto.",
    ("instagram", "touch3"): "Ultimo DM. Una riga. Chiude senza insistere.",
}

SYSTEM = """Sei l'outreacher di SHEis Beauty International (Pineto, Abruzzo), produttore
italiano di cosmetica professionale per capelli. Scrivi UN SOLO messaggio di outreach.

REGOLE ASSOLUTE — la violazione rende il messaggio inutilizzabile:
- SHEis è B2B PURO: si parla a DISTRIBUTORI e IMPORTATORI, mai al salone diretto, MAI al consumatore.
- MAI prezzi, importi, percentuali, sconti, listini, margini. Nemmeno accennati.
- MAI le parole shop / negozio / carrello / acquista / e-commerce. Si dice "portale ordini" o "area riservata".
  (È invece corretto e voluto dire che NON siamo in vendita online e non siamo su Amazon: è la leva più forte.)
- MAI claim non documentati: niente "clinicamente provato", "risultati garantiti", "il migliore",
  niente promesse mediche. Il dato reale di BABILON è 99% di ORIGINE naturale, non "100% naturale".
- MAI la parola "partnership" o "opportunità" in un primo messaggio.
- Mai allegare o promettere il catalogo prima di un sì.

FATTI VERI utilizzabili: SHEis Color (83 nuance, posa 15 minuti, senza ammoniaca, una linea per
7 servizi tecnici) · BABILON (99% origine naturale, wash/care/style) · YOUNIC (brevetto 01301550,
3 fasi A-B-C, dal 2002) · SHEis Blond System · circa 35 distributori · academy interna di formazione
· zona in ESCLUSIVA · nessuna vendita online, né sito proprio al consumatore né marketplace.

TONO: il destinatario è un imprenditore della distribuzione, 40-60 anni, settore conservatore,
diffidente. La barra è che il messaggio NON sembri scritto da un'AI né da un commerciale.
Frasi piane. Nessun aggettivo entusiasta. Nessuna emoji su LinkedIn.

FORMATO DI OUTPUT — obbligatorio e non negoziabile:
racchiudi il messaggio, e SOLO il messaggio, fra i tag <messaggio> e </messaggio>.
Nessun commento, nessuna spiegazione, nessun conteggio di caratteri, nessuna alternativa,
nessun markdown né prima né dopo i tag. Qualunque testo fuori dai tag viene scartato.

Esempio di forma (non di contenuto):
<messaggio>
Buongiorno Mario, le scrivo da ...
</messaggio>"""


def _read(path, limit=None):
    try:
        t = path.read_text()
        return t[:limit] if limit else t
    except (OSError, FileNotFoundError):
        return ""


def build_prompt(prospect, channel: str, touch: str, lang: str) -> str:
    playbook = _read(config.PLAYBOOK)
    voice = _read(config.VOICE_LEARNED)

    lang_name = {"it": "ITALIANO", "en": "INGLESE", "es": "SPAGNOLO"}[lang]
    persona = prospect["persona"] or "it_distributor_small"
    section = PERSONA_SECTION.get(persona, persona)
    brief = TOUCH_BRIEF.get((channel, touch), "Messaggio di outreach breve.")

    voice_block = ""
    if voice.strip():
        voice_block = (
            "\n\n=== LEZIONI IMPARATE DA MAURO (GM di SHEis) NELLA DEMO ===\n"
            "Queste correzioni vengono dal cliente e SOVRASCRIVONO il copione ovunque siano in "
            "conflitto. Rispettale alla lettera.\n" + voice + "\n=== FINE LEZIONI ===")
    else:
        voice_block = ("\n\n[Nessun VOICE-LEARNED.md presente: Mauro non ha ancora corretto la demo. "
                       "Usa il copione così com'è.]")

    return f"""{SYSTEM}

=== COPIONE APPROVATO (fonte di verità del contenuto) ===
{playbook}
=== FINE COPIONE ==={voice_block}

=== INCARICO ===
Sezione del copione da seguire: {section}
Canale: {channel} · Tocco: {touch}
Specifica del tocco: {brief}
Lingua del messaggio: {lang_name} (scrivi SOLO in questa lingua)

Destinatario:
- Nome: {prospect['name']} (nome proprio: {prospect['first_name']})
- Azienda: {prospect['company']}
- Tipo: {prospect['prospect_type']} · Paese: {prospect['country']} · Città: {prospect['city']}
- Marchio concorrente già in portafoglio: {prospect['competitor_brand'] or 'nessuno noto'}
- Aggancio reale osservato: {prospect['hook'] or 'NESSUNO'}

Se l'aggancio reale è "NESSUNO", NON inventarne uno: scrivi un messaggio che funzioni senza.
Un aggancio finto si riconosce e brucia il contatto.

Scrivi ora il messaggio."""


def compose(prospect, channel: str, touch: str, lang: str) -> tuple[str, str, object]:
    """Ritorna (testo, sorgente, LintResult). Solleva RuntimeError se Claude fallisce."""
    prompt = build_prompt(prospect, channel, touch, lang)
    cmd = [config.CLAUDE_BIN, "--print", "--permission-mode", "bypassPermissions",
           "--model", config.CLAUDE_MODEL, prompt]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=config.CLAUDE_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Claude headless timeout dopo {config.CLAUDE_TIMEOUT}s") from None
    except FileNotFoundError:
        raise RuntimeError(f"Claude CLI non trovato in {config.CLAUDE_BIN}") from None

    raw = (res.stdout or "").strip()
    if not raw:
        raise RuntimeError(f"Claude ha risposto vuoto. stderr: {(res.stderr or '')[:300]}")
    text = _extract(raw)
    return text, "claude", lint(text, channel, touch)


def _extract(raw: str) -> str:
    """Estrae il messaggio dai tag. Il modello tende a premettere commenti: senza
    questo contratto un preambolo finisce nel messaggio inviato (e il linter lo
    blocca giustamente, ma il prospect resta senza tocco)."""
    m = re.search(r"<messaggio>(.*?)</messaggio>", raw, re.DOTALL | re.IGNORECASE)
    text = m.group(1) if m else raw
    text = text.strip().strip('"').strip()
    if text.startswith("```"):
        text = "\n".join(l for l in text.splitlines() if not l.startswith("```")).strip()
    return text

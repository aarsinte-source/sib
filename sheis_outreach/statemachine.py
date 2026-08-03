"""Macchina a stati: prospect × canale × esito.

Stati (per coppia prospect/canale)
  new          — importato, mai toccato
  queued       — pronto al prossimo tocco
  invited      — [linkedin] invito inviato, in attesa di accettazione
  accepted     — [linkedin] collegamento accettato → messaggiabile
  touched      — almeno un messaggio inviato, sequenza in corso
  replied      — ⛔ TERMINALE per l'automazione: ha risposto → passa all'umano
  escalated    — ⛔ gate zone esclusive / caso che l'AI non deve decidere
  exhausted    — sequenza finita senza risposta
  skipped      — manca un aggancio reale, o dati insufficienti
  failed       — errore tecnico ripetuto

Transizioni consentite (tutto il resto è un errore, non un caso limite).
"""

NEW, QUEUED, INVITED, ACCEPTED, TOUCHED = "new", "queued", "invited", "accepted", "touched"
REPLIED, ESCALATED, EXHAUSTED, SKIPPED, FAILED = (
    "replied", "escalated", "exhausted", "skipped", "failed")

TERMINAL = {REPLIED, ESCALATED, EXHAUSTED, SKIPPED}

TRANSITIONS = {
    NEW:       {QUEUED, SKIPPED, ESCALATED},
    QUEUED:    {INVITED, TOUCHED, SKIPPED, ESCALATED, FAILED, REPLIED},
    INVITED:   {ACCEPTED, EXHAUSTED, REPLIED, ESCALATED, FAILED},
    ACCEPTED:  {TOUCHED, REPLIED, ESCALATED, EXHAUSTED},
    TOUCHED:   {TOUCHED, REPLIED, ESCALATED, EXHAUSTED, FAILED},
    FAILED:    {QUEUED, SKIPPED},
    REPLIED:   set(),      # nulla riparte da qui in automatico
    ESCALATED: set(),
    EXHAUSTED: set(),
    SKIPPED:   {QUEUED},   # solo per riabilitazione manuale
}

# Sequenza di tocchi per canale. Il contenuto viene dal copione, non da qui.
SEQUENCE = {
    "linkedin":  ["touch1", "touch2", "touch3", "touch4"],
    "instagram": ["touch1", "touch2", "touch3"],
    "email":     ["touch1", "touch2"],
    "whatsapp":  ["touch1"],
}

# Che stato produce l'invio riuscito di un tocco.
STATE_AFTER = {
    ("linkedin", "touch1"): INVITED,   # touch1 LinkedIn = invito, non messaggio
}


def can(src: str, dst: str) -> bool:
    return dst in TRANSITIONS.get(src, set())


def assert_transition(src: str, dst: str):
    if not can(src, dst):
        raise ValueError(f"transizione non consentita: {src} -> {dst}")


def next_touch(channel: str, sent_touches: set) -> str | None:
    for t in SEQUENCE.get(channel, []):
        if t not in sent_touches:
            return t
    return None


def state_after_send(channel: str, touch: str, seq_done: bool) -> str:
    if (channel, touch) in STATE_AFTER:
        return STATE_AFTER[(channel, touch)]
    return EXHAUSTED if seq_done else TOUCHED


def is_terminal(state: str) -> bool:
    return state in TERMINAL

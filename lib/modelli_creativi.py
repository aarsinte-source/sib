"""GENERATO da sincronizza_modelli.py — NON modificare a mano.

Viene da modelli-creativi.json (impronta dd6d9a7182da3d9f). Cambiare qui il
modello significa farlo divergere dall'altro sistema, che è esattamente
il difetto per cui questo file esiste.

Per cambiare modello si modifica la fonte e si rilancia:
    python3 ~/alkemia-sheis-backend/sincronizza_modelli.py --allinea
"""
IMPRONTA_FONTE = 'dd6d9a7182da3d9f'
CREDITO_EUR = 0.033

LAVORI = {'grafica': {'descrizione': 'Locandine, caroselli, inserzioni statiche, infografiche — tutto '
                            "ciò che ha del TESTO dentro l'immagine.",
             'modello': 'gpt_image_2',
             'nome_umano': 'GPT Image 2',
             'crediti': 7,
             'perche': 'Scelto da Andrei il 2026-08-03 per tutte le immagini. Costa 7 crediti '
                       'contro i 2 di Nano Banana Pro, ma la scelta è del cliente e la resa '
                       "del testo dentro l'immagine è la sua ragione d'essere.",
             'parametri': {'quality': 'high', 'resolution': '2k', 'aspect_ratio': '3:4'},
             'formati_supportati': ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']},
 'grafica-bozza': {'descrizione': 'Passate esplorative: molte varianti per capire quale '
                                  'direzione tenere, prima di produrre quella buona.',
                   'modello': 'gpt_image_2',
                   'nome_umano': 'GPT Image 2 (qualità bozza)',
                   'crediti': 0,
                   'perche': 'Stesso modello della resa finale, a qualità bassa. Misurato il '
                             '2026-08-03: a qualità «low» e 2k il preventivo è di ZERO crediti '
                             '— le passate esplorative non costano nulla. Si esplora quanto '
                             'serve e si rifà col buono.',
                   'parametri': {'quality': 'low', 'resolution': '2k', 'aspect_ratio': '3:4'},
                   'formati_supportati': ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']},
 'foto-prodotto': {'descrizione': 'Packshot, prodotto in scena, still life. Il prodotto deve '
                                  'restare SE STESSO.',
                   'modello': 'gpt_image_2',
                   'nome_umano': 'GPT Image 2',
                   'crediti': 7,
                   'perche': 'Scelto da Andrei per tutte le immagini. ⚠️ Nota misurata su un '
                             'altro lavoro: sulla FEDELTÀ GEOMETRICA di un prodotto reale il '
                             'migliore resta Nano Banana Pro (IoU 0,982). Quando il flacone '
                             'deve restare identico a sé stesso, vale la pena riconsiderarlo.',
                   'parametri': {'quality': 'high', 'resolution': '2k', 'aspect_ratio': '1:1'},
                   'formati_supportati': ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']},
 'ugc-video': {'descrizione': 'Video UGC con una persona che parla o agisce in una situazione '
                              'reale — il format che per SHEis ha già funzionato (caso '
                              'Lazzari: 8 clienti in 5 mesi).',
               'modello': 'seedance_2_0',
               'nome_umano': 'Seedance 2.0',
               'crediti': 22,
               'perche': "È il migliore sulle scene con persone e genera l'audio insieme al "
                         'video, quindi un parlato non va montato dopo. Costa quanto undici '
                         'grafiche: è il lavoro più caro del catalogo e va deciso, non fatto '
                         'per abitudine.',
               'parametri': {'duration': 5, 'generate_audio': True, 'bitrate_mode': 'standard'},
               'attenzione': '⚠️ Misurato su un altro lavoro: a 4K e 10 secondi va in timeout '
                             'e il costo resta a carico. Restare su durate brevi e risoluzione '
                             'standard.',
               'formati_supportati': ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9']},
 'ugc-video-bozza': {'descrizione': "La stessa scena, per capire se l'idea regge prima di "
                                    'spendere il triplo.',
                     'modello': 'seedance_2_0_mini',
                     'nome_umano': 'Seedance 2.0 Mini',
                     'crediti': 12,
                     'perche': 'Quasi la metà, stessa impostazione di scena. Serve a scartare '
                               'le idee sbagliate a basso costo.',
                     'parametri': {'duration': 5, 'generate_audio': True},
                     'formati_supportati': ['auto',
                                            '16:9',
                                            '9:16',
                                            '4:3',
                                            '3:4',
                                            '1:1',
                                            '21:9']},
 'video-breve': {'descrizione': 'Movimento semplice su un prodotto o una grafica: nessuno che '
                                'parla, nessuna scena complessa.',
                 'modello': 'seedance1_5',
                 'nome_umano': 'Seedance 1.5 Pro',
                 'crediti': 4,
                 'perche': 'Un quinto del costo di Seedance 2.0. Per animare un packshot non '
                           'serve un modello che sa recitare.',
                 'parametri': {'duration': 5},
                 'formati_supportati': ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9']}}

FORMATO_PER_CANALE = {'instagram-feed': '4:5',
 'instagram-storia': '9:16',
 'instagram-reel': '9:16',
 'facebook-feed': '1:1',
 'tiktok': '9:16',
 'linkedin': '1:1',
 'sito': '16:9'}

GATE = {'soglia_eur_default': 2.0,
 '_perche': 'Nessuna generazione parte senza dichiarare quanto costa. La soglia non è un '
            'divieto: sopra quella cifra serve una conferma esplicita, perché è lì che una '
            'passata distratta smette di essere trascurabile.',
 'marcatori_tetto_giornaliero': ['daily limit',
                                 'daily cap',
                                 'rate limit',
                                 'limite giornaliero',
                                 'too many requests']}


def scegli(lavoro: str) -> dict:
    """Il modello per questo lavoro, o un errore che dice quali lavori esistono.

    Non si indovina: un lavoro non previsto è una domanda a cui il catalogo non
    risponde, e inventare un modello significherebbe spendere crediti su una
    scelta che nessuno ha preso.
    """
    if lavoro not in LAVORI:
        raise KeyError(
            f"Lavoro creativo sconosciuto: {lavoro!r}. "
            f"Previsti: {', '.join(sorted(LAVORI))}."
        )
    return LAVORI[lavoro]


def formato_per(canale: str) -> str:
    """Il formato giusto per il posto dove il contenuto verrà visto.
    Se il canale non è noto si torna a «auto»: meglio lasciar decidere al
    modello che imporre un formato sbagliato."""
    return FORMATO_PER_CANALE.get(canale, "auto")


def _rapporto(f: str) -> float:
    try:
        a, b = f.split(":")
        return float(a) / float(b)
    except (ValueError, ZeroDivisionError):
        return 1.0


def formato_ammesso(lavoro: str, formato: str) -> tuple[str, str]:
    """(formato_da_usare, spiegazione_se_sostituito).

    ⚠️ Non tutti i modelli accettano tutti i formati: GPT Image 2 rifiuta il
    4:5, che è proprio quello del feed Instagram. Misurato il 2026-08-03.

    Quando il formato chiesto non c'è si prende il PIÙ VICINO per proporzione e
    si RESTITUISCE LA SPIEGAZIONE. Sostituire in silenzio significherebbe
    consegnare grafiche del formato sbagliato senza che nessuno se ne accorga —
    e chi le pubblica scoprirebbe il taglio solo guardando il post uscito.
    """
    ammessi = scegli(lavoro).get("formati_supportati") or []
    if not ammessi or formato in ammessi:
        return formato, ""
    candidati = [f for f in ammessi if f != "auto"]
    if not candidati:
        return formato, ""
    vicino = min(candidati, key=lambda f: abs(_rapporto(f) - _rapporto(formato)))
    return vicino, (
        f"il formato {formato} non è supportato da {scegli(lavoro)['nome_umano']}: "
        f"uso {vicino}, che è il più vicino"
    )


def costo_eur(lavoro: str, quante: int = 1) -> float:
    return round(scegli(lavoro)["crediti"] * quante * CREDITO_EUR, 4)

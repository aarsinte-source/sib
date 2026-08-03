"""GENERATO da sincronizza_modelli.py — NON modificare a mano.

Viene da modelli-creativi.json (impronta 039fbb8c626a3848). Cambiare qui il
modello significa farlo divergere dall'altro sistema, che è esattamente
il difetto per cui questo file esiste.

Per cambiare modello si modifica la fonte e si rilancia:
    python3 ~/alkemia-sheis-backend/sincronizza_modelli.py --allinea
"""
IMPRONTA_FONTE = '039fbb8c626a3848'
CREDITO_EUR = 0.033

LAVORI = {'grafica': {'descrizione': 'Locandine, caroselli, inserzioni statiche, infografiche — tutto '
                            "ciò che ha del TESTO dentro l'immagine.",
             'modello': 'nano_banana_2',
             'nome_umano': 'Nano Banana Pro',
             'crediti': 2,
             'perche': "È il migliore sul testo dentro l'immagine, che è il punto debole di "
                       'quasi tutti i generatori: un carosello con la parola sbagliata non si '
                       'pubblica. In più ha la fedeltà geometrica più alta misurata su '
                       'prodotto (IoU 0,982 sul lavoro Mc&Co), quindi un flacone non si '
                       'deforma.',
             'parametri': {'resolution': '2k', 'aspect_ratio': '4:5'}},
 'grafica-bozza': {'descrizione': 'Passate esplorative: molte varianti per capire quale '
                                  'direzione tenere, prima di produrre quella buona.',
                   'modello': 'seedream_v5_lite',
                   'nome_umano': 'Seedream 5.0 Lite',
                   'crediti': 1,
                   'perche': 'Metà del costo. Su una batteria di dodici tentativi la '
                             'differenza è €0,40 contro €0,79: sembra poco, ma è la differenza '
                             'fra esplorare e razionare. La resa finale si rifà col modello '
                             'buono.',
                   'parametri': {'aspect_ratio': '4:5'}},
 'foto-prodotto': {'descrizione': 'Packshot, prodotto in scena, still life. Il prodotto deve '
                                  'restare SE STESSO.',
                   'modello': 'nano_banana_2',
                   'nome_umano': 'Nano Banana Pro',
                   'crediti': 2,
                   'perche': 'Stessa ragione della grafica, ma qui la fedeltà è tutto: un tubo '
                             'di colore ridisegnato dal generatore non è più il prodotto del '
                             "cliente. Quando c'è un render vero, va passato come immagine di "
                             'riferimento invece di descriverlo a parole.',
                   'parametri': {'resolution': '2k'}},
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
                             'standard.'},
 'ugc-video-bozza': {'descrizione': "La stessa scena, per capire se l'idea regge prima di "
                                    'spendere il triplo.',
                     'modello': 'seedance_2_0_mini',
                     'nome_umano': 'Seedance 2.0 Mini',
                     'crediti': 12,
                     'perche': 'Quasi la metà, stessa impostazione di scena. Serve a scartare '
                               'le idee sbagliate a basso costo.',
                     'parametri': {'duration': 5, 'generate_audio': True}},
 'video-breve': {'descrizione': 'Movimento semplice su un prodotto o una grafica: nessuno che '
                                'parla, nessuna scena complessa.',
                 'modello': 'seedance1_5',
                 'nome_umano': 'Seedance 1.5 Pro',
                 'crediti': 4,
                 'perche': 'Un quinto del costo di Seedance 2.0. Per animare un packshot non '
                           'serve un modello che sa recitare.',
                 'parametri': {'duration': 5}}}

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


def costo_eur(lavoro: str, quante: int = 1) -> float:
    return round(scegli(lavoro)["crediti"] * quante * CREDITO_EUR, 4)

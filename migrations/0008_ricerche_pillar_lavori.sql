-- =============================================================================
-- SHEis Beauty — 0008 · ricerche di mercato · pilastri · coda dei lavori
-- Progetto Supabase: wwbfysrqxbwfankkoppt. Idempotente: rieseguibile.
--
-- PERCHÉ QUESTA MIGRAZIONE ESISTE
-- -------------------------------
-- Tre buchi aperti, tutti e tre sullo stesso asse: **ciò che il sistema fa non
-- sopravvive al computer che lo esegue.**
--
--   1. L'ANALISI DI MERCATO oggi è volatile. `/api/analisi` la calcola, la
--      passa al browser, e lì muore: se ricarichi la pagina è persa. Va bene
--      per un prototipo, non per un piano editoriale che deve dichiarare da
--      quali dati è nato. Se l'analisi non si conserva, il piano non è
--      difendibile: nessuno può più chiedergli «su cosa ti basavi?».
--
--   2. I PILASTRI DI CONTENUTO non esistono. Il piano genera post sciolti.
--      Senza pilastri non c'è modo di dire «questo mese abbiamo parlato troppo
--      di prodotto e troppo poco di formazione» — cioè manca esattamente la
--      cosa che rende un piano editoriale un piano invece che un elenco.
--
--   3. LA GENERAZIONE gira su un comando installato sul portatile di Andrei.
--      Higgsfield, Monid, il motore campagne: tutti processi locali lanciati
--      con spawn(). Il portale, spostato su Vercel per essere sempre
--      raggiungibile, NON ha quei comandi — e non può averli: le funzioni
--      serverless non hanno né la CLI né le credenziali in ~/.config, e
--      muoiono dopo pochi secondi mentre una generazione video ne chiede
--      centinaia.
--
--      Da qui `sheis_lavori`: una coda. Il portale ACCODA e torna subito;
--      l'esecutore sul VPS PRENDE ed esegue. Il portale può stare su Vercel,
--      l'esecutore dove ci sono le credenziali, e il Mac può spegnersi senza
--      che niente si fermi.
--
--      La coda non è un dettaglio implementativo: è la linea che separa «cosa
--      si può chiedere da qualunque parte» da «cosa richiede una macchina
--      precisa». Prima quella linea non esisteva e il portale era la macchina.
-- =============================================================================


-- ---------- 1. RICERCHE DI MERCATO -------------------------------------------
-- Una riga per ogni ricerca lanciata. Conserva TRE cose distinte, e la
-- distinzione conta:
--   · `piano`      — cosa il sistema ha dichiarato che avrebbe fatto, e quanto
--                    sarebbe costato, PRIMA di farlo;
--   · `risultati`  — i dati grezzi raccolti, per fonte;
--   · `sintesi`    — la lettura che ne è stata data (pain, desideri, lessico,
--                    angoli, pilastri candidati).
-- Tenerle separate permette di rileggere la sintesi contro i dati: se un giorno
-- la sintesi dice una cosa che i dati non dicono, si vede. Se avessimo salvato
-- solo la sintesi, nessuno potrebbe più accorgersene.

create table if not exists sheis_ricerche (
  id             uuid primary key default gen_random_uuid(),
  tema           text not null,
  piattaforme    text[] not null default '{}',   -- instagram, tiktok, youtube, linkedin, facebook, google
  tipo           text not null default 'entrambi'
                 check (tipo in ('organico','pubblicitario','entrambi')),
  paesi          text[] not null default '{}',   -- ISO-2 minuscolo: it, es, fr…
  stato          text not null default 'in_attesa'
                 check (stato in ('in_attesa','in_corso','completata','fallita','annullata')),
  piano          jsonb,                          -- i passi dichiarati + il costo previsto
  risultati      jsonb,                          -- dati grezzi per fonte
  sintesi        jsonb,                          -- pain/desideri/lessico/angoli/pillar
  fonti_usate    text[] default '{}',
  costo_monid_eur numeric(10,4) default 0,       -- solo ciò che ha davvero consumato saldo
  errore         text,
  creata_da      uuid references sheis_utenti(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_ricerche_stato   on sheis_ricerche(stato, created_at desc);
create index if not exists idx_ricerche_tema    on sheis_ricerche(tema);


-- ---------- 2. PILASTRI DI CONTENUTO -----------------------------------------
-- I pilastri appartengono al PIANO, non al singolo post: cambiare pilastri
-- significa cambiare piano. `quota_pct` è la quota desiderata; quella reale si
-- conta dai contenuti — e la differenza fra le due è l'informazione utile.

create table if not exists sheis_pillar (
  id           uuid primary key default gen_random_uuid(),
  piano_id     uuid references sheis_piani(id) on delete cascade,
  nome         text not null,
  descrizione  text not null,
  obiettivo    text not null default 'consapevolezza'
               check (obiettivo in ('attrazione','consapevolezza','vendita','fiducia')),
  quota_pct    int not null default 25 check (quota_pct between 0 and 100),
  esempi       text[] default '{}',
  lessico      text[] default '{}',             -- parole del pilastro, dalla ricerca
  ordine       int not null default 0,
  ricerca_id   uuid references sheis_ricerche(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists idx_pillar_piano on sheis_pillar(piano_id, ordine);


-- ---------- 3. CONTENUTI: pilastro, copy UGC, copy grafica -------------------
-- Finora `copy` teneva tutto. Ma il testo di una didascalia, il parlato di un
-- video UGC e le parole stampate SULL'immagine sono tre mestieri diversi con
-- tre lunghezze diverse: schiacciarli in un campo solo obbliga chi genera la
-- creativa a indovinare quale pezzo di `copy` vada sull'immagine — e indovina
-- male, perché una didascalia da 400 caratteri sopra una grafica non si legge.

alter table sheis_contenuti add column if not exists pillar_id    uuid references sheis_pillar(id) on delete set null;
alter table sheis_contenuti add column if not exists ricerca_id   uuid references sheis_ricerche(id) on delete set null;
alter table sheis_contenuti add column if not exists copy_ugc     text;    -- lo script parlato: battute, non didascalia
alter table sheis_contenuti add column if not exists copy_grafica jsonb;   -- {titolo, sottotitolo, cta, note}
alter table sheis_contenuti add column if not exists giorno       int;     -- 1..30 nel piano a 30 giorni

create index if not exists idx_contenuti_pillar on sheis_contenuti(pillar_id);
create index if not exists idx_contenuti_giorno on sheis_contenuti(piano_id, giorno);


-- ---------- 4. LA CODA DEI LAVORI --------------------------------------------
-- ⚠️ CONVENZIONE DEGLI STATI: trattino BASSO, non trattino.
-- Sembra il contrario della regola del vocabolario canonico, e non lo è: il
-- trattino vale per il vocabolario di DOMINIO (`sheis-color`,
-- `distributore-estero`, `non-pertinente`), il trattino basso per gli STATI
-- macchina, che in questo schema sono underscore da 0001 in poi
-- (`in_attesa`, `da_generare`, `in_coda`, `in_produzione`).
-- Questa migrazione era stata scritta col trattino: avrebbe introdotto la
-- QUARTA divergenza della stessa convenzione — e ogni divergenza si paga in
-- un punto in cui due lati confrontano una stringa e non trovano niente.
-- `tipo` è volutamente un check chiuso: un tipo sconosciuto non deve poter
-- entrare in coda e restarci per sempre senza che nessun esecutore lo
-- riconosca. Meglio un errore a scrittura che una riga muta.

create table if not exists sheis_lavori (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null
                  check (tipo in (
                    'ricerca-mercato',      -- scrapers + DataForSEO + Monid
                    'genera-creativa',      -- Higgsfield: immagine o video
                    'pubblica-zernio',      -- messa in coda / pubblicazione
                    'costruisci-campagna',  -- motore campagne Meta
                    'diagnostica'           -- stato crediti e saldi
                  )),
  stato           text not null default 'in_attesa'
                  check (stato in ('in_attesa','in_corso','completato','fallito','annullato')),
  priorita        int not null default 5 check (priorita between 1 and 9),  -- 1 = prima
  payload         jsonb not null default '{}'::jsonb,
  risultato       jsonb,
  errore          text,
  tentativi       int not null default 0,
  max_tentativi   int not null default 3,

  -- A cosa si riferisce, per poter risalire dalla riga al lavoro che l'ha
  -- prodotta senza cercare dentro il payload.
  riferimento_tipo text check (riferimento_tipo in ('contenuto','variante','ricerca','campagna','pubblicazione')),
  riferimento_id   uuid,

  preso_da        text,           -- nome dell'esecutore che l'ha in mano
  preso_il        timestamptz,
  completato_il   timestamptz,
  richiesto_da    uuid references sheis_utenti(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- L'indice su cui gira la presa: solo i lavori in attesa, nell'ordine in cui
-- vanno presi. Parziale, così non cresce con lo storico dei completati.
create index if not exists idx_lavori_da_prendere
  on sheis_lavori(priorita, created_at)
  where stato = 'in_attesa';

create index if not exists idx_lavori_riferimento on sheis_lavori(riferimento_tipo, riferimento_id);
create index if not exists idx_lavori_stato       on sheis_lavori(stato, updated_at desc);


-- ---------- 5. PRESA ATOMICA DEL LAVORO --------------------------------------
-- ⚠️ Il pezzo che NON va scritto lato applicazione.
--
-- La versione ingenua — «select il primo in attesa, poi update a in-corso» —
-- ha una finestra fra i due comandi in cui un secondo esecutore legge la
-- STESSA riga. Con un esecutore solo non si vede mai; il giorno che se ne
-- avvia un secondo (o il watchdog ne lascia due vivi, com'è già successo col
-- bot Telegram) la stessa generazione parte due volte e si paga due volte.
--
-- `for update skip locked` chiude la finestra dentro il database: la riga
-- viene bloccata nello stesso istante in cui è letta, e il secondo esecutore
-- la salta invece di aspettarla.

create or replace function sheis_prendi_lavoro(esecutore text, tipi text[] default null)
returns setof sheis_lavori as $$
  update sheis_lavori
     set stato     = 'in_corso',
         preso_da  = esecutore,
         preso_il  = now(),
         tentativi = tentativi + 1,
         updated_at = now()
   where id = (
     select l.id
       from sheis_lavori l
      where l.stato = 'in_attesa'
        and (tipi is null or l.tipo = any(tipi))
        and l.tentativi < l.max_tentativi
      order by l.priorita asc, l.created_at asc
      limit 1
      for update skip locked
   )
  returning *;
$$ language sql;

-- Rimette in attesa i lavori presi da un esecutore morto a metà. Senza questo,
-- un lavoro preso da un processo che poi crasha resta 'in_corso' per sempre:
-- nessuno lo riprende e nessuno segnala che è fermo — il modo più silenzioso
-- che una coda ha di smettere di funzionare.
create or replace function sheis_recupera_lavori_appesi(minuti int default 30)
returns int as $$
declare n int;
begin
  with recuperati as (
    update sheis_lavori
       set stato = case when tentativi >= max_tentativi then 'fallito' else 'in_attesa' end,
           errore = coalesce(errore, '') ||
                    case when tentativi >= max_tentativi
                         then 'Esecutore interrotto dopo ' || tentativi || ' tentativi.'
                         else '' end,
           preso_da = null,
           preso_il = null,
           updated_at = now()
     where stato = 'in_corso'
       and preso_il < now() - (minuti || ' minutes')::interval
    returning 1
  )
  select count(*) into n from recuperati;
  return n;
end;
$$ language plpgsql;


-- ---------- 6. TRACCIABILITÀ: dalla riga al lavoro ---------------------------
alter table sheis_varianti      add column if not exists lavoro_id uuid references sheis_lavori(id) on delete set null;
alter table sheis_pubblicazioni add column if not exists lavoro_id uuid references sheis_lavori(id) on delete set null;
alter table sheis_campagne      add column if not exists lavoro_id uuid references sheis_lavori(id) on delete set null;


-- ---------- 7. updated_at ----------------------------------------------------
-- La funzione sheis_touch_updated_at() è già definita in 0002; qui si
-- riaggancia soltanto alle tabelle nuove.
drop trigger if exists trg_ricerche_touch on sheis_ricerche;
create trigger trg_ricerche_touch before update on sheis_ricerche
  for each row execute function sheis_touch_updated_at();

drop trigger if exists trg_lavori_touch on sheis_lavori;
create trigger trg_lavori_touch before update on sheis_lavori
  for each row execute function sheis_touch_updated_at();


-- ---------- 8. RLS: stessa regola di sempre, default deny --------------------
alter table sheis_ricerche enable row level security;
alter table sheis_pillar   enable row level security;
alter table sheis_lavori   enable row level security;
-- Nessuna policy per anon: si accede solo lato server con la service key.
-- L'esecutore sul VPS usa la stessa service key, quindi non serve altro.

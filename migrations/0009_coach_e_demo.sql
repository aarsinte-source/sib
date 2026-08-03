-- =============================================================================
-- SHEis Beauty — 0009 · sales coach sulle formazioni di Mauro · demo outreach
-- Progetto Supabase: wwbfysrqxbwfankkoppt. Idempotente.
--
-- PERCHÉ
-- ------
-- Mauro forma i suoi agenti di persona. Le registrazioni ci sono — tre lezioni
-- fra il 26 e il 27 luglio 2026, circa 300.000 caratteri — ma vivono come file
-- di testo che nessuno rilegge. Un agente nuovo che si trova davanti
-- un'obiezione non ha modo di sapere cosa Mauro ha già risposto a quella stessa
-- obiezione in aula.
--
-- Il coach non «sa vendere»: sa cosa ha detto MAURO. È una differenza che
-- decide tutto. Un modello a cui si chiede genericamente come gestire
-- un'obiezione produce il manuale di vendita di chiunque; qui invece la
-- risposta deve poter essere ricondotta a un passaggio preciso di una lezione
-- precisa, con la citazione. Se non c'è in aula, il coach lo dice invece di
-- inventarlo.
--
-- COME SI CERCA, E PERCHÉ COSÌ
-- ----------------------------
-- Ricerca full-text di Postgres in italiano, non un database vettoriale.
-- Motivo: trecentomila caratteri sono pochi, la lingua è una sola, e il
-- vocabolario è tecnico e ricorrente («obiezione», «prezzo», «margine»,
-- «distributore»). In queste condizioni la ricerca testuale trova quello che
-- serve, non costa nulla, non aggiunge un servizio da tenere acceso, e
-- soprattutto è ISPEZIONABILE: si può guardare perché un pezzo è stato
-- trovato. Un embedding no.
-- =============================================================================


-- ---------- 1. LE FORMAZIONI ------------------------------------------------
create table if not exists sheis_formazioni (
  id           uuid primary key default gen_random_uuid(),
  titolo       text not null,
  tenuta_il    date,
  fonte        text,                          -- nome del file o della registrazione
  argomenti    text[] default '{}',
  testo        text not null,
  caratteri    int generated always as (length(testo)) stored,
  stato        text not null default 'attiva'
               check (stato in ('attiva','archiviata')),
  caricata_da  uuid references sheis_utenti(id) on delete set null,
  created_at   timestamptz default now(),
  unique (fonte)
);


-- ---------- 2. I PEZZI ------------------------------------------------------
-- Una lezione intera non entra in un prompt, e non ci deve entrare: si cercano
-- i pezzi pertinenti e si passano solo quelli. `posizione` serve a dire DOVE
-- nella lezione: una citazione senza posizione non è verificabile.
create table if not exists sheis_formazione_pezzi (
  id            uuid primary key default gen_random_uuid(),
  formazione_id uuid not null references sheis_formazioni(id) on delete cascade,
  posizione     int not null,                 -- progressivo dentro la lezione
  minuto        text,                         -- se il transcript porta i tempi
  testo         text not null,
  tsv           tsvector generated always as (to_tsvector('italian', testo)) stored,
  created_at    timestamptz default now(),
  unique (formazione_id, posizione)
);

create index if not exists idx_pezzi_tsv on sheis_formazione_pezzi using gin(tsv);
create index if not exists idx_pezzi_formazione on sheis_formazione_pezzi(formazione_id, posizione);


-- ---------- 3. LE DOMANDE FATTE AL COACH ------------------------------------
-- Si conservano per un motivo pratico: le domande che tornano spesso e a cui
-- il coach risponde male sono l'elenco di cosa manca nelle formazioni. È il
-- modo per far crescere il materiale invece di indovinare cosa aggiungere.
create table if not exists sheis_coach_domande (
  id           uuid primary key default gen_random_uuid(),
  domanda      text not null,
  risposta     text,
  pezzi_usati  uuid[] default '{}',
  trovato      boolean default true,          -- false = in aula non c'era
  utile        boolean,                       -- pollice su/giù di chi ha chiesto
  chiesta_da   uuid references sheis_utenti(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists idx_coach_domande_data on sheis_coach_domande(created_at desc);
create index if not exists idx_coach_non_trovato on sheis_coach_domande(created_at desc) where trovato = false;


-- ---------- 4. RICERCA: una funzione, non una query sparsa ------------------
-- Sta qui e non nell'applicazione perché la useranno il portale e l'esecutore,
-- e due implementazioni della stessa ricerca divergono. È la stessa ragione per
-- cui esiste sheis_prendi_lavoro.
create or replace function sheis_cerca_formazione(domanda text, quanti int default 8)
returns table (
  pezzo_id uuid, formazione_id uuid, titolo text, tenuta_il date,
  posizione int, minuto text, testo text, punteggio real
) as $$
  select p.id, f.id, f.titolo, f.tenuta_il, p.posizione, p.minuto, p.testo,
         ts_rank(p.tsv, plainto_tsquery('italian', domanda)) as punteggio
    from sheis_formazione_pezzi p
    join sheis_formazioni f on f.id = p.formazione_id
   where f.stato = 'attiva'
     and p.tsv @@ plainto_tsquery('italian', domanda)
   order by punteggio desc, p.posizione asc
   limit greatest(1, quanti);
$$ language sql stable;


-- ---------- 5. DEMO OUTREACH ------------------------------------------------
-- Una conversazione di prova: Andrei fa il prospect, il sistema risponde come
-- risponderebbe a un distributore vero. Serve a far vedere il tono PRIMA che
-- il tono finisca addosso a un contatto reale.
--
-- ⚠️ `demo` è true per difetto ed è il motivo per cui questa tabella è
-- separata dalla pipeline di outreach vera. Una conversazione di prova che
-- finisse nella stessa tabella dei contatti veri diventerebbe, prima o poi,
-- un messaggio spedito davvero.
create table if not exists sheis_outreach_demo (
  id           uuid primary key default gen_random_uuid(),
  titolo       text,
  demo         boolean not null default true check (demo = true),
  profilo      jsonb,                          -- chi finge di essere il prospect
  lingua       text default 'it' check (lingua in ('it','en','es')),
  messaggi     jsonb not null default '[]'::jsonb,   -- [{da:'prospect'|'noi', testo, quando}]
  note         text,
  aperta_da    uuid references sheis_utenti(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_outreach_demo_data on sheis_outreach_demo(created_at desc);

drop trigger if exists trg_demo_touch on sheis_outreach_demo;
create trigger trg_demo_touch before update on sheis_outreach_demo
  for each row execute function sheis_touch_updated_at();


-- ---------- 6. RLS: default deny --------------------------------------------
alter table sheis_formazioni        enable row level security;
alter table sheis_formazione_pezzi  enable row level security;
alter table sheis_coach_domande     enable row level security;
alter table sheis_outreach_demo     enable row level security;
-- Nessuna policy per anon. Il coach oggi è interno; il giorno che diventerà
-- accessibile agli agenti di commercio, l'accesso passerà comunque dal server
-- con la service key e da un controllo applicativo — non da una policy che
-- apre la tabella al mondo.

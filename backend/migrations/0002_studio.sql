-- =============================================================================
-- SHEis Beauty — schema SHEis Studio (2026-08-03)
-- Estende 0001_sheis_schema.sql. Progetto Supabase REALE: wwbfysrqxbwfankkoppt
-- (⚠️ l'intestazione di 0001 cita xcbbjefogwxxptygffqw: è un riferimento stale,
--  il .env dice wwbfysrqxbwfankkoppt ed è quello vero — verificato il 2026-08-03.)
--
-- Copre: utenti e ruoli · varianti creative · coda di pubblicazione · candidati
-- discovery · campagne · articoli del sito · report settimanali.
-- Idempotente: si può rieseguire senza danni.
-- =============================================================================

-- ---------- 0. UTENTI E RUOLI -----------------------------------------------
-- Tre ruoli, come deciso: mauro vede tutto e decide; marketing approva e lancia
-- campagne; dipendente scrive e carica ma NON approva.

create table if not exists sheis_utenti (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  nome          text not null,
  ruolo         text not null default 'dipendente'
                check (ruolo in ('mauro','marketing','dipendente')),
  attivo        boolean default true,
  pwd_hash      text,                        -- scrypt; ⚠️ su Node scrypt richiede maxmem esplicito
  ultimo_accesso timestamptz,
  created_at    timestamptz default now()
);

-- ---------- 1. ESTENSIONE DEI CONTENUTI --------------------------------------
-- 0001 non prevedeva il pubblico, il prompt creativo, gli hashtag né la seconda
-- lingua — ma il profilo reale pubblica caption bilingui IT/EN nello stesso post,
-- e la diagnosi ha misurato ZERO hashtag su 12 post (l'occasione persa più grande).

alter table sheis_contenuti add column if not exists pubblico          text;
alter table sheis_contenuti add column if not exists copy_secondario   text;
alter table sheis_contenuti add column if not exists lingua_secondaria text default 'en';
alter table sheis_contenuti add column if not exists hashtag           text[];
alter table sheis_contenuti add column if not exists prompt_creativo   text;
alter table sheis_contenuti add column if not exists nota_interna      text;
alter table sheis_contenuti add column if not exists variante_scelta_id uuid;
alter table sheis_contenuti add column if not exists ora_pubblicazione time;
alter table sheis_contenuti add column if not exists creato_da         uuid references sheis_utenti(id) on delete set null;

-- Il vincolo di 0001 non contempla lo stato "in_produzione" (le 3 varianti in
-- corso di generazione) né "programmato" (in coda su Zernio, non ancora uscito).
alter table sheis_contenuti drop constraint if exists sheis_contenuti_stato_check;
alter table sheis_contenuti add constraint sheis_contenuti_stato_check
  check (stato in ('in_attesa','approvato','modificato','scartato',
                   'in_produzione','prodotto','programmato','pubblicato','errore'));

-- Il log di 0001 ammette 4 azioni: servono anche quelle di creatività e uscita.
alter table sheis_approvazioni_log drop constraint if exists sheis_approvazioni_log_azione_check;
alter table sheis_approvazioni_log add constraint sheis_approvazioni_log_azione_check
  check (azione in ('approvato','modificato','scartato','riaperto',
                    'variante_approvata','variante_scartata','programmato',
                    'pubblicato','pubblicazione_fallita'));
alter table sheis_approvazioni_log add column if not exists attore_id uuid references sheis_utenti(id) on delete set null;
alter table sheis_approvazioni_log add column if not exists dettaglio jsonb;

-- ---------- 2. VARIANTI CREATIVE ---------------------------------------------
-- Tre varianti per ogni contenuto approvato. Si approva LA VARIANTE, non
-- "la creatività": è la differenza fra scegliere e subire.

create table if not exists sheis_varianti (
  id              uuid primary key default gen_random_uuid(),
  contenuto_id    uuid references sheis_contenuti(id) on delete cascade,
  indice          int not null check (indice between 1 and 5),
  prompt          text not null,
  angolo_visivo   text,                      -- cosa cambia rispetto alle sorelle
  asset_url       text,
  asset_path      text,                      -- bucket sheis-creative
  provider        text,                      -- higgsfield:gpt_image_2 | higgsfield:nano_banana_2
  costo_crediti   numeric,
  costo_eur       numeric,                   -- 1 credito = €0,033 (misurato)
  stato           text not null default 'da_generare'
                  check (stato in ('da_generare','in_corso','pronta','approvata','scartata','errore')),
  errore          text,                      -- il motivo, in italiano, mostrato all'utente
  generata_il     timestamptz,
  created_at      timestamptz default now(),
  unique (contenuto_id, indice)
);

-- ---------- 3. CODA DI PUBBLICAZIONE (Zernio) --------------------------------
-- Idempotenza per contenuto+canale: un rerun non ripubblica.

create table if not exists sheis_pubblicazioni (
  id              uuid primary key default gen_random_uuid(),
  contenuto_id    uuid references sheis_contenuti(id) on delete cascade,
  canale          text not null,
  programmato_per timestamptz,
  stato           text not null default 'in_coda'
                  check (stato in ('in_coda','inviato','pubblicato','fallito','bloccato')),
  motivo_blocco   text,                      -- es. "nessun account SHEis collegato a Zernio"
  zernio_post_id  text,
  linter_esito    jsonb,                     -- cosa ha controllato e cosa ha bloccato
  tentativi       int default 0,
  ultimo_errore   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (contenuto_id, canale)
);

-- ---------- 4. CANDIDATI DISCOVERY (specchio per la lettura) -----------------
-- La verità operativa vive nello SQLite del motore outreach; qui arriva la copia
-- per report e interfaccia. Non è la fonte: è la vetrina.

create table if not exists sheis_candidati (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  nome            text,
  bio             text,
  follower        int,
  citta           text,
  zona            text,
  tipo            text check (tipo in ('salone','distributore','non_pertinente','incerto')),
  tipo_motivo     text,                      -- PERCHÉ è stato classificato così
  score           numeric,
  hook            text,
  hook_fonte      text,                      -- da dove viene l'aggancio: mai inventato
  email           text,
  scoperto_da     text,                      -- quale query lo ha trovato
  stato           text default 'nuovo' check (stato in ('nuovo','promosso','scartato','in_sequenza','risposto')),
  created_at      timestamptz default now()
);

-- ---------- 5. CAMPAGNE (media buyer su richiesta) ---------------------------

create table if not exists sheis_campagne (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  obiettivo       text,                      -- cosa deve ottenere, a parole del cliente
  pubblico        text,
  brand           text,
  budget_giorno   numeric,
  budget_totale   numeric,
  contenuto_id    uuid references sheis_contenuti(id) on delete set null,
  blueprint       text,                      -- A-estero-spagna | B-italia-distributori | C-saloni
  stato           text not null default 'bozza'
                  check (stato in ('bozza','pronta','bloccata','attiva','in_pausa','conclusa')),
  motivo_blocco   text,                      -- oggi: "account pubblicitario Meta inesistente"
  meta_campaign_id text,
  payload         jsonb,                     -- ciò che verrebbe inviato: ispezionabile prima
  richiesta_da    uuid references sheis_utenti(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ---------- 6. ARTICOLI DEL SITO (CMS) ---------------------------------------
-- Il sito oggi è file-based su 8 lingue e NON ha un blog: questa è la tabella che
-- lo introduce. L'italiano è la fonte, le altre lingue sono traduzioni tracciate.

create table if not exists sheis_articoli (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  lingua          text not null default 'it',
  titolo          text not null,
  sommario        text,
  blocchi         jsonb not null default '[]'::jsonb,   -- editor a blocchi trascinabili
  copertina_url   text,
  seo             jsonb,                     -- title, description, og
  stato           text not null default 'bozza'
                  check (stato in ('bozza','in_revisione','pubblicato','archiviato')),
  fonte_lingua    text default 'it',         -- da quale lingua è tradotto
  autore_id       uuid references sheis_utenti(id) on delete set null,
  pubblicato_il   timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (slug, lingua)
);

-- ---------- 7. REPORT SETTIMANALI --------------------------------------------

create table if not exists sheis_report (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'settimanale' check (tipo in ('settimanale','mensile')),
  periodo_da      date not null,
  periodo_a       date not null,
  organico        jsonb,
  pubblicitario   jsonb,
  outreach        jsonb,
  canali_spenti   text[],                    -- dichiarati, non mostrati come zeri
  markdown        text,
  inviato_il      timestamptz,
  esiti_invio     jsonb,
  created_at      timestamptz default now(),
  unique (tipo, periodo_da)
);

-- ---------- indici -----------------------------------------------------------
create index if not exists idx_sheis_varianti_contenuto   on sheis_varianti(contenuto_id);
create index if not exists idx_sheis_varianti_stato       on sheis_varianti(stato);
create index if not exists idx_sheis_pubbl_stato          on sheis_pubblicazioni(stato);
create index if not exists idx_sheis_pubbl_quando         on sheis_pubblicazioni(programmato_per);
create index if not exists idx_sheis_candidati_tipo       on sheis_candidati(tipo);
create index if not exists idx_sheis_candidati_stato      on sheis_candidati(stato);
create index if not exists idx_sheis_campagne_stato       on sheis_campagne(stato);
create index if not exists idx_sheis_articoli_stato       on sheis_articoli(stato, lingua);
create index if not exists idx_sheis_log_contenuto        on sheis_approvazioni_log(contenuto_id, created_at desc);

-- ---------- trigger updated_at ----------------------------------------------
drop trigger if exists trg_sheis_pubbl_touch on sheis_pubblicazioni;
create trigger trg_sheis_pubbl_touch before update on sheis_pubblicazioni
  for each row execute function sheis_touch_updated_at();
drop trigger if exists trg_sheis_campagne_touch on sheis_campagne;
create trigger trg_sheis_campagne_touch before update on sheis_campagne
  for each row execute function sheis_touch_updated_at();
drop trigger if exists trg_sheis_articoli_touch on sheis_articoli;
create trigger trg_sheis_articoli_touch before update on sheis_articoli
  for each row execute function sheis_touch_updated_at();

-- ---------- RLS: stessa regola di 0001, default deny -------------------------
alter table sheis_utenti         enable row level security;
alter table sheis_varianti       enable row level security;
alter table sheis_pubblicazioni  enable row level security;
alter table sheis_candidati      enable row level security;
alter table sheis_campagne       enable row level security;
alter table sheis_articoli       enable row level security;
alter table sheis_report         enable row level security;
-- Nessuna policy per anon: si accede solo lato server con la service key.
-- ⚠️ Lezione già pagata su Mc&Co: una policy RLS non può interrogare la propria
-- tabella, o genera ricorsione infinita e degrada in silenzio i permessi.
-- Qui il problema non si pone perché non ci sono policy basate sui ruoli:
-- l'autorizzazione vive nell'applicazione, che parla col database da server.

-- Articoli pubblicati leggibili da anon: servono al sito pubblico.
drop policy if exists sheis_articoli_read_anon on sheis_articoli;
create policy sheis_articoli_read_anon on sheis_articoli
  for select to anon using (stato = 'pubblicato');

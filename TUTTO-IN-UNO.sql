-- ═══════════════════════════════════════════════════════════════════════════
--  SHEis Beauty — schema completo, da incollare nell'editor SQL di Supabase
-- ═══════════════════════════════════════════════════════════════════════════
--
--  COME SI USA (due minuti, nessun token da generare):
--
--   1. apri  https://supabase.com/dashboard/project/wwbfysrqxbwfankkoppt/sql/new
--   2. incolla TUTTO questo file
--   3. premi «Run»  (o Cmd+Invio)
--
--  Poi, da terminale, per la conferma:
--      python3 ~/alkemia-sheis-backend/applica_migrazioni.py --verifica
--   deve rispondere 15/15.
--
--  PERCHÉ ESISTE QUESTO FILE
--  Le chiavi del progetto — sia quella pubblica `sb_publishable_…` sia quella di
--  servizio `sb_secret_…` — sanno leggere e scrivere le RIGHE, ma non sanno
--  CREARE TABELLE. Quel potere passa solo da un Personal Access Token (`sbp_…`),
--  che vive nelle impostazioni dell'ACCOUNT e non del progetto — oppure
--  dall'editor SQL del pannello, che è la via più corta e non richiede nulla.
--
--  È idempotente: si può rieseguire senza danni.
--  Generato unendo i file in migrations/, nell'ordine di esecuzione.
-- ═══════════════════════════════════════════════════════════════════════════



-- ─────────────────────────────────────────────────────────────────────────
-- 0001_sheis_schema.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- SHEis Beauty — schema backend condiviso (Supabase project xcbbjefogwxxptygffqw)
-- Isolato con prefisso sheis_  → non tocca lo scaling-checkup che vive nello stesso progetto.
-- Serve: (A) App Ordini distributori + foto→ordine   (B) Content Board (piano editoriale + approvazioni)
-- Eseguibile via Management API (POST /v1/projects/{ref}/database/query) o supabase db push.
-- Idempotente: si può rieseguire.
-- =============================================================================

-- ---------- A. APP ORDINI ----------------------------------------------------

create table if not exists sheis_distributori (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  ragione_sociale text,
  email         text,
  telefono      text,
  paese         text default 'IT',
  zona          text,                       -- per il gate zone esclusive
  attivo        boolean default true,
  note          text,
  created_at    timestamptz default now()
);

create table if not exists sheis_catalogo (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  slug          text unique,
  nome          text not null,
  brand         text,                       -- sheis-color | babilon | younic | accessori
  categoria     text,
  descrizione   text,
  attivo        boolean default true,
  created_at    timestamptz default now()
);

create table if not exists sheis_ordini (
  id                uuid primary key default gen_random_uuid(),
  distributore_id   uuid references sheis_distributori(id) on delete set null,
  stato             text not null default 'bozza'
                    check (stato in ('bozza','da_foto','confermato','evaso','annullato')),
  origine           text default 'portale' check (origine in ('portale','foto','import')),
  totale_righe      int default 0,
  note              text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists sheis_ordine_righe (
  id            uuid primary key default gen_random_uuid(),
  ordine_id     uuid references sheis_ordini(id) on delete cascade,
  prodotto_id   uuid references sheis_catalogo(id) on delete set null,
  sku_grezzo    text,                        -- come letto dalla foto, prima del match
  nome_grezzo   text,                        -- descrizione letta dalla foto
  quantita      int not null default 1,
  match_confidenza numeric,                  -- 0..1 dal vision → catalogo
  stato_match   text default 'ok' check (stato_match in ('ok','da_verificare','non_trovato')),
  created_at    timestamptz default now()
);

-- Foto del foglio d'ordine cartaceo → riconoscimento → ordine
create table if not exists sheis_foto_ordini (
  id                uuid primary key default gen_random_uuid(),
  ordine_id         uuid references sheis_ordini(id) on delete cascade,
  distributore_id   uuid references sheis_distributori(id) on delete set null,
  storage_path      text not null,           -- path nel bucket sheis-ordini
  stato             text not null default 'caricata'
                    check (stato in ('caricata','in_elaborazione','riconosciuta','errore','confermata')),
  vision_provider   text,                    -- openai:gpt-4o | anthropic:claude
  riconoscimento    jsonb,                   -- righe estratte + confidenza + raw
  errore            text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ---------- B. CONTENT BOARD (piano editoriale + approvazioni) ---------------

create table if not exists sheis_piani (
  id            uuid primary key default gen_random_uuid(),
  titolo        text not null,               -- es. "Piano editoriale 90gg — luglio 2026"
  periodo_da    date,
  periodo_a     date,
  stato         text default 'attivo' check (stato in ('attivo','archiviato')),
  created_at    timestamptz default now()
);

create table if not exists sheis_contenuti (
  id                uuid primary key default gen_random_uuid(),
  piano_id          uuid references sheis_piani(id) on delete cascade,
  data_pubblicazione date,
  canale            text,                    -- instagram | facebook | tiktok | linkedin
  brand             text,                    -- sheis-color | babilon | younic
  lingua            text default 'it',
  formato           text,                    -- statico | carosello | video | ugc
  angolo            text,
  hook              text,
  copy              text,
  cta               text,
  asset_path        text,                    -- bucket sheis-creative, quando prodotto
  stato             text not null default 'in_attesa'
                    check (stato in ('in_attesa','approvato','modificato','scartato','prodotto','pubblicato')),
  feedback_mauro    text,                    -- la correzione, quando ✏️
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists sheis_approvazioni_log (
  id            uuid primary key default gen_random_uuid(),
  contenuto_id  uuid references sheis_contenuti(id) on delete cascade,
  azione        text not null check (azione in ('approvato','modificato','scartato','riaperto')),
  note          text,
  attore        text default 'mauro',
  created_at    timestamptz default now()
);

-- ---------- indici utili -----------------------------------------------------
create index if not exists idx_sheis_ordini_distributore on sheis_ordini(distributore_id);
create index if not exists idx_sheis_ordini_stato        on sheis_ordini(stato);
create index if not exists idx_sheis_righe_ordine         on sheis_ordine_righe(ordine_id);
create index if not exists idx_sheis_foto_ordine          on sheis_foto_ordini(ordine_id);
create index if not exists idx_sheis_contenuti_piano      on sheis_contenuti(piano_id);
create index if not exists idx_sheis_contenuti_stato      on sheis_contenuti(stato);
create index if not exists idx_sheis_contenuti_data       on sheis_contenuti(data_pubblicazione);

-- ---------- trigger updated_at ----------------------------------------------
create or replace function sheis_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_sheis_ordini_touch on sheis_ordini;
create trigger trg_sheis_ordini_touch before update on sheis_ordini
  for each row execute function sheis_touch_updated_at();
drop trigger if exists trg_sheis_foto_touch on sheis_foto_ordini;
create trigger trg_sheis_foto_touch before update on sheis_foto_ordini
  for each row execute function sheis_touch_updated_at();
drop trigger if exists trg_sheis_contenuti_touch on sheis_contenuti;
create trigger trg_sheis_contenuti_touch before update on sheis_contenuti
  for each row execute function sheis_touch_updated_at();

-- ---------- RLS: default deny; l'app opera con service_role (bypassa RLS) ----
-- Le app server-side usano SERVICE_ROLE (che ignora RLS). Attiviamo RLS così che
-- la ANON key pubblica NON possa leggere/scrivere questi dati per sbaglio.
alter table sheis_distributori     enable row level security;
alter table sheis_catalogo         enable row level security;
alter table sheis_ordini           enable row level security;
alter table sheis_ordine_righe     enable row level security;
alter table sheis_foto_ordini      enable row level security;
alter table sheis_piani            enable row level security;
alter table sheis_contenuti        enable row level security;
alter table sheis_approvazioni_log enable row level security;
-- Nessuna policy permissiva per anon = accesso solo via service_role lato server. Corretto per B2B.

-- Catalogo pubblico in sola lettura (serve al portale distributore per elencare i prodotti):
drop policy if exists sheis_catalogo_read_anon on sheis_catalogo;
create policy sheis_catalogo_read_anon on sheis_catalogo
  for select to anon using (attivo = true);


-- ─────────────────────────────────────────────────────────────────────────
-- 0002_studio.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- 0003_metriche.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- SHEis Beauty — schema metriche Instagram (2026-08-03)
-- Estende 0001_sheis_schema.sql + 0002_studio.sql. Progetto Supabase REALE:
-- wwbfysrqxbwfankkoppt (vedi nota in testa a 0002).
--
-- Scritta da alkemia-sheis-workers (ingest_metriche_ig.py) — eccezione
-- esplicita concessa: i worker leggono lo schema, non lo scrivono, TRANNE
-- questa migrazione, che vive qui perché lo schema DB è di competenza di
-- questo repo, non del repo dei worker.
--
-- ⚠️ Il DDL non può girare da qui: manca un Personal Access Token Supabase
-- (verificato 2026-08-03, 0 tabelle su 15 esistono ancora). Questa migrazione
-- è pronta e idempotente, ma va applicata con
-- ~/alkemia-sheis-backend/applica_migrazioni.py --applica quando il token
-- sarà disponibile — non prima.
--
-- Copre: la SERIE STORICA delle metriche IG (una riga per contenuto per
-- rilevazione, non solo l'ultimo valore) e l'aggancio, quando possibile con
-- certezza, al contenuto pubblicato via Zernio in sheis_contenuti.
-- =============================================================================

create table if not exists sheis_metriche_ig (
  id                    uuid primary key default gen_random_uuid(),

  -- QUANDO è avvenuta QUESTA rilevazione (non quando il contenuto è uscito su
  -- Instagram — quella è data_pubblicazione_ig). Senza due rilevazioni sullo
  -- stesso ig_id non esiste una tendenza: è per questo che la chiave unica
  -- è (ig_id, rilevato_il), non ig_id da solo.
  rilevato_il           timestamptz not null default now(),

  tipo_contenuto        text not null check (tipo_contenuto in ('post', 'reel')),

  -- Identità nativa Instagram del contenuto (media id / pk da ScrapeCreators).
  -- È la chiave con cui una rilevazione successiva ritrova lo STESSO contenuto.
  ig_id                 text not null,
  ig_code               text,                       -- shortcode, utile per URL e per il matching testuale
  data_pubblicazione_ig timestamptz,                -- quando è uscito DAVVERO su Instagram
  caption_estratto      text,                        -- primi ~200 caratteri: serve al matching e al debug umano

  -- Snapshot delle grandezze al momento della rilevazione.
  follower_al_momento   int,                         -- follower del profilo IN QUEL momento (denominatore per i rate)
  like_count            int,
  comment_count         int,
  views_count           int,                         -- reel: play_count. Post immagine: NULL, non zero — non è misurato, non è "zero visualizzazioni"
  like_su_views_pct     numeric,                      -- calcolato SOLO se views_count > 0; altrimenti NULL, mai 0 finto

  -- Aggancio al contenuto pubblicato via Zernio, SOLO quando trovato con
  -- ragionevole certezza (finestra temporale + corrispondenza testuale della
  -- caption). Se l'aggancio non è certo, contenuto_id resta NULL e il motivo
  -- va dichiarato in attribuzione_motivo — un'attribuzione sbagliata è peggio
  -- di un dato non agganciato.
  contenuto_id          uuid references sheis_contenuti(id) on delete set null,
  attribuzione_esito     text not null default 'non_tentata'
                        check (attribuzione_esito in ('agganciato', 'non_agganciato', 'non_tentata')),
  attribuzione_motivo    text,

  created_at            timestamptz default now(),

  unique (ig_id, rilevato_il)
);

create index if not exists idx_sheis_metriche_ig_id         on sheis_metriche_ig(ig_id);
create index if not exists idx_sheis_metriche_ig_rilevato    on sheis_metriche_ig(rilevato_il desc);
create index if not exists idx_sheis_metriche_ig_contenuto   on sheis_metriche_ig(contenuto_id);
create index if not exists idx_sheis_metriche_ig_tipo        on sheis_metriche_ig(tipo_contenuto);

-- ---------- RLS: stessa regola di 0001/0002, default deny --------------------
alter table sheis_metriche_ig enable row level security;
-- Nessuna policy per anon: solo service_role (lato server, ingest_metriche_ig.py).


-- ─────────────────────────────────────────────────────────────────────────
-- 0004_studio_articoli.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- SHEis Beauty — estensione sheis_articoli per l'editor a blocchi (2026-08-03)
-- Estende 0001_sheis_schema.sql + 0002_studio.sql. Progetto Supabase REALE:
-- wwbfysrqxbwfankkoppt (vedi nota in testa a 0002).
--
-- Scritta da alkemia-sheis-studio (SHEis Studio, editor a blocchi in /sito).
--
-- ⚠️ Il DDL non può girare da qui: manca un Personal Access Token Supabase
-- (verificato 2026-08-03, 0 tabelle su 15 esistono ancora). Questa migrazione
-- è pronta e idempotente, ma va applicata con
-- ~/alkemia-sheis-backend/applica_migrazioni.py --applica quando il token
-- sarà disponibile — non prima.
--
-- Perché serve: 0002_studio.sql aveva già `blocchi jsonb` e `fonte_lingua`,
-- ma non i campi che il sito pubblico (~/alkemia-sheis-web) si aspetta negli
-- export articolo — verificato leggendo i file reali in
-- ~/alkemia-sheis-web/src/content/articles/*.json: copertina è un oggetto
-- {src, alt}, non un URL nudo; servono categoria, tag e il nome autore
-- visualizzato. Senza questi campi, ciò che si scrive nello Studio non
-- combacia con ciò che il sito sa leggere.
-- =============================================================================

alter table sheis_articoli add column if not exists copertina  jsonb;      -- {src, alt} — stessa forma dei file .json del sito
alter table sheis_articoli add column if not exists categoria  text;
alter table sheis_articoli add column if not exists tag        text[];
alter table sheis_articoli add column if not exists autore     text default 'SHEis Beauty International';

-- Chi ha premuto "pubblica" — distinto da autore_id (chi ha scritto). Un
-- dipendente scrive e propone, non pubblica: qui si registra chi lo ha fatto
-- davvero, senza dover riusare sheis_approvazioni_log (la cui FK
-- contenuto_id punta a sheis_contenuti, una tabella diversa da sheis_articoli
-- — riusarla per gli articoli avrebbe rotto il vincolo).
alter table sheis_articoli add column if not exists pubblicato_da uuid references sheis_utenti(id) on delete set null;

create index if not exists idx_sheis_articoli_categoria on sheis_articoli(categoria);


-- ─────────────────────────────────────────────────────────────────────────
-- 0005_vincoli_vocabolario.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- SHEis — vincoli sul vocabolario (2026-08-03)
-- Rinumerata da 0004 a 0005: due squadre diverse avevano scritto un 0004 nello
-- stesso momento (0004_studio_articoli.sql). I vincoli devono girare PER ULTIMI,
-- dopo che tutte le colonne esistono: un CHECK su una colonna non ancora creata
-- fallisce, e l'ordine alfabetico e quello logico devono coincidere.
--
-- PERCHÉ ESISTE
-- La prova d'insieme fra i sei repository ha misurato 9 divergenze su 15
-- contratti. La più concreta: il piano editoriale reale scriveva
-- `pubblico = 'distributore_estero'` (trattino basso) mentre l'interfaccia
-- filtrava su `'distributore-estero'` (trattino). Trenta contenuti veri
-- sarebbero finiti nel database e non sarebbero comparsi da nessuna parte —
-- nessun errore, nessun avviso, solo righe che non si vedono.
--
-- La causa non era un bug di codice: era che nessuno aveva dichiarato il
-- vocabolario in un posto solo. `formato` aveva un CHECK, `pubblico` no, e la
-- differenza fra i due non era una decisione — era una dimenticanza.
--
-- Da qui in avanti la convenzione è UNA: sempre il trattino, mai il trattino
-- basso, come già facevano i brand (`sheis-color`). La fonte a monte è
-- `BRAND-IDENTITY_sheis_2026-08-03.json → _vocabolario_canonico`; questi vincoli
-- sono la rete a valle, per i casi in cui qualcuno scriva sul database senza
-- passare dall'applicazione.
--
-- ⚠️ Va applicata DOPO aver normalizzato le righe esistenti: un CHECK aggiunto
-- su dati che lo violano fa fallire la migrazione. Le UPDATE qui sotto vengono
-- prima apposta, e sono innocue su un database vuoto (oggi lo è: 0 righe).
-- Idempotente: si può rieseguire.
-- =============================================================================

-- ---------- 1. normalizzazione dei dati esistenti ----------------------------
update sheis_contenuti set pubblico = 'distributore-estero' where pubblico = 'distributore_estero';
update sheis_contenuti set pubblico = 'distributore-italia' where pubblico = 'distributore_italia';
update sheis_contenuti set brand    = 'sheis-color'         where brand    in ('sheis_color', 'sheiscolor');

update sheis_candidati  set tipo = 'non-pertinente' where tipo = 'non_pertinente';

-- ---------- 1-bis. due valori reali che nessun vincolo copriva ---------------
-- Trovati dalla squadra che ha scritto il piano editoriale, e DICHIARATI invece
-- di essere adattati in silenzio a un valore ammesso ma semanticamente sbagliato.
-- È la stessa lacuna del trattino: un valore che esiste nella realtà e che nessun
-- vincolo prevedeva.
--
-- (a) `stato = 'bloccato'` — serve al piano per un contenuto fermo in attesa di
--     un consenso a monte (il caso del distributore di Pisa: la prova sociale
--     più forte che SHEis abbia, inutilizzabile finché il diretto interessato non
--     autorizza). «bloccato» esisteva solo sul CHECK di `sheis_pubblicazioni`,
--     dove però significa un'altra cosa — «invio bloccato», non «in attesa di
--     permesso». Due significati diversi per la stessa parola in due tabelle:
--     qui lo si aggiunge esplicitamente col significato di questa tabella.
alter table sheis_contenuti drop constraint if exists sheis_contenuti_stato_check;
alter table sheis_contenuti add  constraint sheis_contenuti_stato_check
  check (stato in ('in_attesa','approvato','modificato','scartato','bloccato',
                   'in_produzione','prodotto','programmato','pubblicato','errore'));
comment on column sheis_contenuti.stato is
  'bloccato = pianificato ma fermo in attesa di un permesso o di un dato a monte (diverso da sheis_pubblicazioni.stato bloccato, che significa invio impedito).';

-- (b) `serie` — raggruppa gli episodi di uno stesso filone (brand-mentalist,
--     balayage-biondo, accademia, sun-babilon). Nato nel piano come campo di
--     lavoro; senza una colonna vera si perderebbe al primo import, e con esso
--     l'ordine degli episodi di una serie in cinque puntate.
alter table sheis_contenuti add column if not exists serie          text;
alter table sheis_contenuti add column if not exists serie_episodio int;
create index if not exists idx_sheis_contenuti_serie on sheis_contenuti(serie, serie_episodio);

-- ---------- 2. vincoli sul vocabolario --------------------------------------
-- `pubblico` non aveva alcun vincolo: è esattamente il campo che è divergito.
alter table sheis_contenuti drop constraint if exists sheis_contenuti_pubblico_check;
alter table sheis_contenuti add  constraint sheis_contenuti_pubblico_check
  check (pubblico is null or pubblico in ('distributore-estero','distributore-italia','salone'));

alter table sheis_contenuti drop constraint if exists sheis_contenuti_brand_check;
alter table sheis_contenuti add  constraint sheis_contenuti_brand_check
  check (brand is null or brand in ('sheis-color','babilon','younic'));

alter table sheis_contenuti drop constraint if exists sheis_contenuti_formato_check;
alter table sheis_contenuti add  constraint sheis_contenuti_formato_check
  check (formato is null or formato in ('statico','carosello','video','ugc'));

alter table sheis_contenuti drop constraint if exists sheis_contenuti_canale_check;
alter table sheis_contenuti add  constraint sheis_contenuti_canale_check
  check (canale is null or canale in ('instagram','facebook','tiktok','linkedin'));

alter table sheis_contenuti drop constraint if exists sheis_contenuti_lingua_check;
alter table sheis_contenuti add  constraint sheis_contenuti_lingua_check
  check (lingua is null or lingua in ('it','en','es'));

-- `sheis_candidati.tipo` allineato alla stessa convenzione col trattino.
alter table sheis_candidati drop constraint if exists sheis_candidati_tipo_check;
alter table sheis_candidati add  constraint sheis_candidati_tipo_check
  check (tipo is null or tipo in ('salone','distributore','non-pertinente','incerto'));

-- ---------- 3. il ponte che non esiste --------------------------------------
-- ⚠️ La prova d'insieme ha rilevato che `sheis_candidati` NON È SCRITTA DA
-- NESSUNO: la migrazione la dichiara «la vetrina» della tabella locale
-- `candidates` del motore outreach, ma nessun file di quel repository la
-- nomina. L'interfaccia legge una tabella che resterà vuota per sempre.
--
-- Questi commenti fissano la corrispondenza dei campi, che oggi NON combacia
-- (6 rinominati, 15 solo locali, 7 solo remoti), così chi costruirà il ponte
-- non deve ridedurla:
--     locale (SQLite outreach)  →  remoto (Supabase)
--     full_name                 →  nome
--     followers                 →  follower
--     city                      →  citta
--     zone                      →  zona
--     business_email            →  email
--     motivo_score              →  (assente a destra: va aggiunto o perso)
-- Il campo `motivo_score` è quello che rende la classificazione ispezionabile:
-- perderlo nel trasferimento significa avere una vetrina che mostra verdetti
-- senza mostrarne la ragione.
alter table sheis_candidati add column if not exists motivo_score text;
alter table sheis_candidati add column if not exists hook_fonte   text;

comment on table sheis_candidati is
  'Vetrina in sola lettura dei candidati scoperti. La verità operativa vive nello SQLite del motore outreach; qui arriva la copia per interfaccia e report. ⚠️ Al 2026-08-03 il ponte che la popola NON ESISTE.';


-- ─────────────────────────────────────────────────────────────────────────
-- 0006_lead_ads.sql
-- ─────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- SHEis Beauty — lead da traffico a pagamento (2026-08-03)
-- Estende 0002_studio.sql. Stesso progetto Supabase REALE: wwbfysrqxbwfankkoppt
--
-- Perche' questa tabella e non sheis_candidati: sheis_candidati e' lo specchio
-- di lettura del motore OUTREACH (SQLite → Supabase, prospect trovati a freddo
-- via LinkedIn/Instagram — vedi commento in 0002_studio.sql §4). Un lead che
-- compila un form dopo aver cliccato un annuncio e' un pubblico diverso (caldo,
-- si e' auto-selezionato) e arriva da un canale diverso (sito, non scraping):
-- mescolarli nella stessa tabella avrebbe reso ambiguo "scoperto_da" e rotto
-- lo stato del motore outreach, che quella tabella non possiede.
--
-- Nasce per il caso "leads_retrieval mancante su Meta" (vedi
-- ~/alkemia-sheis-ads/blueprints/*-web.json, campo 🔴_perche_esiste_questa_variante):
-- destination_type WEBSITE porta il visitatore su /distributori
-- (~/alkemia-sheis-web), il form esistente (ApplicationSection → JsonForm)
-- POSTa su /api/distributori-lead, che scrive QUI — bypassando del tutto
-- l'API dei moduli istantanei Meta.
--
-- Idempotente: si può rieseguire senza danni.
-- =============================================================================

create table if not exists sheis_lead_ads (
  id                uuid primary key default gen_random_uuid(),

  -- provenienza
  fonte             text not null default 'ads_meta' check (fonte in ('ads_meta','organico','altro')),
  pagina            text not null,                      -- slug pagina di provenienza, es. "distributori"
  lingua            text not null,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,                                -- {{campaign.name}} risolto da Meta nell'URL
  utm_content       text,                                -- {{ad.name}} risolto da Meta nell'URL

  -- l'azienda (campi del form distributori — vedi src/content/pages/distributori.*.json)
  company           text,
  vat               text,
  country           text,
  city              text,
  website           text,
  market_area       text,
  salons_served     text,
  sales_team        text,
  current_brands    text,                                -- la domanda che vale piu' di tutte: qualifica Profit/Break-even/KO
  brands_of_interest text[],

  -- il referente
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  role              text,
  how_found         text,
  message           text,

  -- conformita' e tracciabilita'
  consenso_privacy  boolean not null default false,
  ip                text,
  user_agent        text,
  dati_grezzi       jsonb not null default '{}'::jsonb,   -- payload completo cosi' come arrivato: mai perdere un campo non ancora mappato in colonna

  stato             text not null default 'nuovo' check (stato in ('nuovo','contattato','qualificato','scartato')),
  note_interne      text,

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_sheis_lead_ads_stato   on sheis_lead_ads(stato);
create index if not exists idx_sheis_lead_ads_pagina   on sheis_lead_ads(pagina, lingua);
create index if not exists idx_sheis_lead_ads_campagna on sheis_lead_ads(utm_campaign);
create index if not exists idx_sheis_lead_ads_created  on sheis_lead_ads(created_at desc);

drop trigger if exists trg_sheis_lead_ads_touch on sheis_lead_ads;
create trigger trg_sheis_lead_ads_touch before update on sheis_lead_ads
  for each row execute function sheis_touch_updated_at();

-- RLS: stessa regola di 0001/0002, default deny. Nessuna policy anon: l'unico
-- scrittore e' l'API route server-side (/api/distributori-lead), che usa la
-- service key da variabile d'ambiente Vercel — mai esposta al client.
alter table sheis_lead_ads enable row level security;

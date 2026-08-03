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

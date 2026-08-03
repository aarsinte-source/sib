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

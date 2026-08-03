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

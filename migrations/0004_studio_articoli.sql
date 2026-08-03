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

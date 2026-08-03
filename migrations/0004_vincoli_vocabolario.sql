-- =============================================================================
-- SHEis — vincoli sul vocabolario (2026-08-03)
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

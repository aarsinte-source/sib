-- 0007 · I vincoli che erano solo commenti
--
-- PERCHÉ
-- ------
-- Il collaudo del 2026-08-03 ha misurato due contratti che esistevano solo
-- nella buona volontà di chi scrive:
--
--   1. `sheis_contenuti.formato` aveva accanto il commento
--      «-- statico | carosello | video | ugc» e nient'altro. Un commento non
--      è una regola: impedisce di sbagliare solo a chi lo legge. Lo Studio
--      era protetto dal proprio tipo TypeScript, ma i worker scrivono via
--      REST senza passare di lì — e una riga con un formato inventato non
--      sarebbe stata rifiutata da nessuno, sarebbe solo diventata invisibile
--      a ogni filtro dell'interfaccia.
--
--   2. `sheis_campagne.brand` e `sheis_contenuti.brand` sono testo libero, e
--      i due lati ci scrivono cose diverse: il motore delle campagne
--      «BABILON» e «SHEis Color», il piano editoriale «babilon» e
--      «sheis-color». Nessuno dei due fallisce a scrittura. Ma un
--      collegamento fra le due tabelle per brand non trova NIENTE — e non
--      trovare niente si legge come «non ci sono campagne per questo brand»,
--      che è la risposta sbagliata data con sicurezza.
--
-- La convenzione è quella già dichiarata nel vocabolario canonico: sempre
-- minuscolo, sempre col trattino, mai il trattino basso.

-- ── 1. formato: da commento a regola ────────────────────────────────────────
-- Prima si normalizza ciò che c'è, poi si impone il vincolo. L'ordine conta:
-- un vincolo aggiunto su dati già fuori norma fallisce e non si applica.
update sheis_contenuti set formato = lower(trim(formato)) where formato is not null;
update sheis_contenuti set formato = 'video' where formato in ('reel', 'reels');

alter table sheis_contenuti drop constraint if exists sheis_contenuti_formato_check;
alter table sheis_contenuti add  constraint sheis_contenuti_formato_check
  check (formato is null or formato in ('statico', 'carosello', 'video', 'ugc'));

-- ── 2. brand: una sola grafia, ovunque ──────────────────────────────────────
-- Si normalizzano le grafie già scritte prima di imporre il vincolo, così le
-- righe esistenti non vengono rifiutate e nessuno perde dati.
--
-- ⚠️ SEI marchi, non tre. Fino al 2026-08-04 il sistema ne conosceva tre
-- (sheis-color, babilon, younic) perché erano gli unici emersi dalle
-- trascrizioni. Il cliente ha poi consegnato il foglio marchi completo: ne
-- mancavano TRE — il marchio ombrello `sheis-beauty` (quello col cuore
-- disegnato a mano), la linea `sheis-color-first` e `vr-intelligent`.
--
-- Questa migrazione stava per essere applicata con l'elenco vecchio: avrebbe
-- messo un vincolo che RIFIUTA a scrittura tre marchi veri del cliente. Un
-- vincolo sbagliato è peggio di nessun vincolo — nessun vincolo lascia passare
-- l'errore, un vincolo sbagliato blocca il corretto e lo fa sembrare un bug
-- del programma.
create or replace function sheis_brand_canonico(v text) returns text as $$
  select case
    when v is null then null
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('babilon') then 'babilon'
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('younic', 'you-nic') then 'younic'
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('vr-intelligent', 'vr', 'vrintelligent') then 'vr-intelligent'
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('sheis-color-first', 'sheis-first', 'color-first', 'first') then 'sheis-color-first'
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('sheis-color', 'sheis-colour', 'color', 'sheiscolor') then 'sheis-color'
    when lower(regexp_replace(v, '[\s_]+', '-', 'g')) in ('sheis-beauty', 'sheis', 'sheisbeauty', 'sheis-beauty-international') then 'sheis-beauty'
    else lower(regexp_replace(v, '[\s_]+', '-', 'g'))
  end;
$$ language sql immutable;

update sheis_campagne  set brand = sheis_brand_canonico(brand) where brand is not null;
update sheis_contenuti set brand = sheis_brand_canonico(brand) where brand is not null;

alter table sheis_campagne  drop constraint if exists sheis_campagne_brand_check;
alter table sheis_campagne  add  constraint sheis_campagne_brand_check
  check (brand is null or brand in
    ('sheis-beauty', 'sheis-color', 'sheis-color-first', 'younic', 'babilon', 'vr-intelligent'));

alter table sheis_contenuti drop constraint if exists sheis_contenuti_brand_check;
alter table sheis_contenuti add  constraint sheis_contenuti_brand_check
  check (brand is null or brand in
    ('sheis-beauty', 'sheis-color', 'sheis-color-first', 'younic', 'babilon', 'vr-intelligent'));

-- Nota per chi legge fra sei mesi: il vincolo NON sostituisce la
-- normalizzazione a monte. Serve a far fallire rumorosamente chi sbaglia,
-- invece di lasciargli scrivere una riga che nessun filtro troverà mai. Il
-- posto giusto dove scrivere il valore giusto resta chi scrive.

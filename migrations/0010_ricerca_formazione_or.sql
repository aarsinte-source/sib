-- =============================================================================
-- SHEis Beauty — 0010 · la ricerca nelle formazioni cerca in OR, non in AND
--
-- DIFETTO MISURATO il 2026-08-04
-- ------------------------------
-- `sheis_cerca_formazione` usava `plainto_tsquery`, che unisce i termini in
-- AND: un pezzo esce solo se contiene TUTTE le parole della domanda. Su
-- domande scritte come le scrive una persona — «come apro una trattativa con
-- un salone nuovo» — non esce niente, perché nessun capoverso di parlato
-- contiene contemporaneamente «aprire», «trattativa» e «salone».
--
-- Misurato su quattro domande vere:
--   · «il cliente dice che costa troppo»            → 1 pezzo, fuori tema
--   · «non ho tempo adesso»                          → 3 pezzi
--   · «ci devo pensare»                              → 3 pezzi
--   · «come apro una trattativa con un salone nuovo» → NESSUN pezzo
--
-- Zero risultati su una domanda legittima è il peggiore dei fallimenti per uno
-- strumento come questo: chi lo prova una volta e non ottiene niente non torna,
-- e conclude che il materiale non c'è — quando invece c'è.
--
-- LA CORREZIONE
-- -------------
-- I termini si uniscono in OR e si ordina per pertinenza. Un pezzo che contiene
-- «trattativa» e «salone» sale in cima; uno che contiene solo «nuovo» resta in
-- fondo e non dà fastidio. In più si scartano le parole troppo corte, che in
-- OR porterebbero rumore («con», «un», «che»).
-- =============================================================================

create or replace function sheis_cerca_formazione(domanda text, quanti int default 8)
returns table (
  pezzo_id uuid, formazione_id uuid, titolo text, tenuta_il date,
  posizione int, minuto text, testo text, punteggio real
) as $$
declare
  q tsquery;
  termini text[];
begin
  -- Parole di almeno quattro lettere: sotto quella soglia, in OR, si pesca
  -- rumore. `regexp_split_to_array` invece di `to_tsvector` perché qui serve
  -- il testo grezzo della domanda, non la sua forma normalizzata.
  select array_agg(t) into termini
    from unnest(regexp_split_to_array(lower(domanda), '[^[:alnum:]àèéìòùç]+')) as t
   where length(t) >= 4;

  if termini is null or array_length(termini, 1) = 0 then
    -- Domanda fatta di sole parole corte: si ricade sul comportamento
    -- letterale invece di restituire il vuoto.
    q := plainto_tsquery('italian', domanda);
  else
    q := to_tsquery('italian', array_to_string(termini, ' | '));
  end if;

  return query
    select p.id, f.id, f.titolo, f.tenuta_il, p.posizione, p.minuto, p.testo,
           ts_rank(p.tsv, q) as punteggio
      from sheis_formazione_pezzi p
      join sheis_formazioni f on f.id = p.formazione_id
     where f.stato = 'attiva'
       and p.tsv @@ q
     order by punteggio desc, p.posizione asc
     limit greatest(1, quanti);
exception
  -- Una domanda con caratteri che rompono to_tsquery non deve far cadere il
  -- coach: si degrada alla forma letterale e si risponde comunque.
  when others then
    return query
      select p.id, f.id, f.titolo, f.tenuta_il, p.posizione, p.minuto, p.testo,
             ts_rank(p.tsv, plainto_tsquery('italian', domanda)) as punteggio
        from sheis_formazione_pezzi p
        join sheis_formazioni f on f.id = p.formazione_id
       where f.stato = 'attiva'
         and p.tsv @@ plainto_tsquery('italian', domanda)
       order by punteggio desc
       limit greatest(1, quanti);
end;
$$ language plpgsql stable;

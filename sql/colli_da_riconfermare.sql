-- I COLLI SI RICONTANO QUANDO CAMBIA LA MERCE.
--
-- Dal DDT 1980 (27/08/2026): in bolla 15 colli, il cliente ne ha contati 16.
-- Il numero scritto a mano VINCE sul conteggio delle righe, ed e' giusto cosi'
-- (le scatole vere possono essere diverse: accorpamenti, polybox). Ma un
-- numero confermato resta scritto anche se DOPO la merce cambia: righe
-- aggiunte, tolte, quantita' modificate, ordini uniti. A quel punto il numero
-- in bolla e' il conteggio di un ordine che non esiste piu'.
--
-- Regola: se la merce cambia, la conferma decade e i colli tornano "da
-- confermare" (il suggerito si mostra, la spedizione richiede la conferma).
-- Non si tocca niente quando il DDT e' gia' emesso o l'ordine e' archiviato:
-- quel numero e' gia' su un documento firmato.
create or replace function colli_da_riconfermare()
returns trigger language plpgsql as $$
declare
  v_id text;
begin
  v_id := coalesce(new.id_ordine, old.id_ordine);
  if v_id is null then return coalesce(new, old); end if;

  -- Un cambio di quantita' che non cambia niente non fa decadere nulla.
  if tg_op = 'UPDATE' and new.quantita_ordinata is not distinct from old.quantita_ordinata then
    return new;
  end if;

  -- L'abbuono non e' una scatola: metterlo o toglierlo non cambia i colli.
  if coalesce(new.id_prodotto, old.id_prodotto, '') like 'ABBUONO-%' then
    return coalesce(new, old);
  end if;

  update ordini o
     set colli = null
   where o.id_ordine = v_id
     and o.colli is not null
     and coalesce(o.archiviato, false) = false
     and coalesce(o.ddt_numero, '') = '';

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_colli_da_riconfermare on righe_ordine;
create trigger trg_colli_da_riconfermare
  after insert or delete or update of quantita_ordinata on righe_ordine
  for each row execute function colli_da_riconfermare();

NOTIFY pgrst, 'reload schema';

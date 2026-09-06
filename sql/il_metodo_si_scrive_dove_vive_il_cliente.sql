-- IL METODO SI SCRIVE DOVE VIVE IL CLIENTE.
--
-- Trovato in verifica il 03/09/2026, cliccando davvero il bottone "Scrivilo
-- sulla scheda" su SAN PIETRO. Il metodo veniva scritto, ma su una scheda
-- NUOVA (chiave "nome:san pietro - s.p.a. · positano", codice CLI-1036),
-- mentre il cliente aveva gia' la sua sotto l'altro codice (PN-000032). Due
-- schede per lo stesso cliente, e la nuova senza nemmeno la ragione sociale.
--
-- Cioe' il bottone che doveva chiudere il problema dei doppioni ne creava uno.
-- La chiave arrivava dall'elenco, che quando non trova la scheda se ne inventa
-- una: va bene per mostrare una riga, non per scriverci sopra.
--
-- Qui la scheda si CERCA: prima per codice, poi tra gli altri codici dello
-- stesso cliente (stessa partita IVA), e solo se davvero non esiste si crea,
-- con la ragione sociale dentro.

create or replace function scrivi_metodo_sulla_scheda(
  p_codice text, p_metodo text, p_operatore text, p_nome text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metodo text := metodo_pagamento_canonico(p_metodo);
  v_chiave text;
  v_nome   text;
begin
  if coalesce(btrim(p_codice),'') = '' then
    raise exception 'Serve il codice cliente per sapere su quale scheda scrivere';
  end if;
  if v_metodo is null then
    raise exception 'Metodo "%" non dice quando si incassa: non lo scrivo', p_metodo;
  end if;

  select chiave into v_chiave from clienti_override where codice_cliente = p_codice limit 1;

  if v_chiave is null then
    select chiave into v_chiave from clienti_override
     where codice_cliente in (select codici_dello_stesso_cliente(p_codice)) limit 1;
  end if;

  if v_chiave is null then
    -- Non ce l'ha davvero: si crea, ma con un nome addosso. Una scheda senza
    -- ragione sociale non si sa nemmeno di chi e'.
    select coalesce(nullif(btrim(p_nome),''), m.ragione_sociale, g.ragione_sociale)
      into v_nome
      from (select 1) z
      left join clienti_master m on m.codice = p_codice
      left join clienti_gestionale g on g.codice_cliente = ltrim(regexp_replace(p_codice,'^CLI-',''),'0');
    if coalesce(btrim(v_nome),'') = '' then
      raise exception 'Non so chi sia %: senza ragione sociale non creo la scheda', p_codice;
    end if;
    v_chiave := chiave_anagrafica((select piva from clienti_master where codice = p_codice), v_nome);
    insert into clienti_override (chiave, codice_cliente, ragione_sociale, operatore)
    values (v_chiave, p_codice, v_nome, p_operatore)
    on conflict (chiave) do nothing;
  end if;

  update clienti_override
     set metodo_pagamento = v_metodo,
         codice_cliente   = coalesce(nullif(codice_cliente,''), p_codice),
         operatore        = p_operatore,
         aggiornato_il    = now()
   where chiave = v_chiave;

  return v_chiave;
end;
$$;

grant execute on function scrivi_metodo_sulla_scheda(text, text, text, text) to anon, authenticated;

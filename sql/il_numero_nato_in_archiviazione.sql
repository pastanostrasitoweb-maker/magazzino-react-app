-- Il numero DDT nato dentro l'archiviazione (24/09/2026)
--
-- IL DIFETTO
-- Quando un ordine si archivia senza che il DDT sia stato stampato prima, il
-- numero lo assegna il trigger BEFORE ddt_alla_spedizione(), dentro la stessa
-- UPDATE che mette archiviato = true. I trigger che dovevano reagire al numero
-- erano scritti "AFTER UPDATE OF ddt_numero": in Postgres un trigger con la
-- lista di colonne scatta solo se la colonna e' nel SET dell'istruzione, e le
-- modifiche fatte da un trigger BEFORE non contano. Il numero c'era, ma per
-- quei trigger non era mai "cambiato".
--
-- Risultato, su sei DDT fra il 15/09 e il 23/09 (2161, 2168, 2169, 2205, 2233,
-- 2234): nessuna bolla congelata, nessun documento in cf_documenti col numero
-- del DDT, e per i due clienti a Ri.Ba. (2168 L'officina degli intolleranti,
-- 2169 Celiachiamo, gia' fatturato 1941) nessuna ricevuta da presentare.
-- La stessa cecita' vale per lo stato messo a 'Spedito' da zz_archiviato_e_spedito
-- e per il metodo normalizzato da ordine_metodo_da_storia.
--
-- LA CORREZIONE
-- Ogni trigger diventa due: uno per l'INSERT, uno per l'UPDATE con una WHEN
-- che confronta OLD e NEW. La WHEN di un trigger AFTER si valuta sulla riga
-- finale, quindi vede anche quello che hanno scritto i trigger BEFORE.

begin;

-- 1. La bolla congelata nasce quando nasce il numero, comunque nasca.
drop trigger if exists trg_congela_ddt on ordini;
drop trigger if exists trg_congela_ddt_upd on ordini;
create trigger trg_congela_ddt after insert on ordini
  for each row execute function congela_ddt();
create trigger trg_congela_ddt_upd after update on ordini
  for each row when (old.ddt_numero is distinct from new.ddt_numero)
  execute function congela_ddt();

-- 2. La ricevuta nasce quando il documento prende il numero, oppure quando il
--    metodo DIVENTA Ri.Ba. Non a ogni ritocco del metodo: una ricevuta gia'
--    registrata sotto l'id della partita (vedi v_riba_per_partita) non deve
--    trovarsi accanto una gemella da presentare solo perche' il metodo e' stato
--    normalizzato.
drop trigger if exists trg_riba_nasce_col_ddt on ordini;
drop trigger if exists trg_riba_nasce_col_ddt_upd on ordini;
create trigger trg_riba_nasce_col_ddt after insert on ordini
  for each row execute function riba_nasce_col_ddt();
create trigger trg_riba_nasce_col_ddt_upd after update on ordini
  for each row when (
       old.ddt_numero is distinct from new.ddt_numero
    or (coalesce(old.metodo_pagamento,'') !~* '(ri\.?\s?ba|ricevut\w*\s+banc)'
        and coalesce(new.metodo_pagamento,'') ~* '(ri\.?\s?ba|ricevut\w*\s+banc)'))
  execute function riba_nasce_col_ddt();

-- 3. Il metodo del documento (copia di comodo, la rifa' anche il giro dell'ora).
drop trigger if exists trg_metodo_fattura_cache on ordini;
drop trigger if exists trg_metodo_fattura_cache_upd on ordini;
create trigger trg_metodo_fattura_cache after insert on ordini
  for each row execute function metodo_fattura_al_documento();
create trigger trg_metodo_fattura_cache_upd after update on ordini
  for each row when (old.ddt_numero is distinct from new.ddt_numero
                  or old.metodo_pagamento is distinct from new.metodo_pagamento)
  execute function metodo_fattura_al_documento();

-- 4. Il documento nello scadenzario porta il numero del DDT.
drop trigger if exists trg_cf_documento_da_ordine on ordini;
drop trigger if exists trg_cf_documento_da_ordine_upd on ordini;
create trigger trg_cf_documento_da_ordine after insert on ordini
  for each row execute function cf_documento_da_ordine();
create trigger trg_cf_documento_da_ordine_upd after update on ordini
  for each row when (old.stato is distinct from new.stato
                  or old.ddt_numero is distinct from new.ddt_numero
                  or old.id_cliente is distinct from new.id_cliente
                  or old.data_ordine is distinct from new.data_ordine)
  execute function cf_documento_da_ordine();

commit;

-- UN ORDINE APP, UN ORDINE MAGAZZINO (14/09/2026)
--
-- La mattina del 14/09 sono usciti tre ordini doppi dentro una raffica di
-- import di 55 secondi: qualcuno li ha lavorati e poi sono stati cancellati a
-- mano. Non era il doppio clic dell'agente: in `ordini_agenti` il doppione e'
-- impossibile (id_ordine e' chiave primaria, e infatti li' non ce n'e'
-- nessuno). Nasceva all'import nel magazzino, dove il controllo "e' gia'
-- importato?" era leggi-poi-scrivi: fra la lettura e la scrittura di
-- "Importato" l'ordine magazzino era GIA' creato, e due copie del magazzino
-- aperte passavano tutte e due.
--
-- Il magazzino non teneva il riferimento all'ordine di partenza: il legame
-- esisteva solo nel verso opposto, in una colonna sovrascrivibile. Al secondo
-- import il link si spostava sul nuovo ordine e il primo restava orfano.
-- Dal 17/07 a oggi sono nove volte.
--
-- Qui il controllo torna dove si scrive (vedi feedback-il-bottone-non-e-un-permesso).

alter table ordini add column if not exists id_ordine_app text;

update ordini o set id_ordine_app = oa.id_ordine
  from ordini_agenti oa
 where oa.id_ordine_magazzino = o.id_ordine and o.id_ordine_app is null;

create unique index if not exists ordini_id_ordine_app_unico
  on ordini (id_ordine_app) where id_ordine_app is not null;

-- Provato il 14/09: 333 collegamenti ricostruiti, zero conflitti; due insert
-- con lo stesso id_ordine_app e il secondo riceve
-- "duplicate key value violates unique constraint".

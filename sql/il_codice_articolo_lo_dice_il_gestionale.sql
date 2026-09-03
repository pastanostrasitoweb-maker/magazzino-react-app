-- IL CODICE ARTICOLO LO DICE IL GESTIONALE.
--
-- Luca, 03/09/2026: "il mezzopacchero e' 036 invece tu dici 026 come codice,
-- perche' c'e' stato questo errore?".
--
-- Nel gestionale GAMMA: NFARMA 026 = "Pasta fresca uovo Pacchero" (intero),
-- NFARMA 036 = "Pasta Fresca Uovo Mezzo Pacchero". In catalogo il mezzo pacchero
-- c'era gia' col codice giusto (id 9, NFARMA 036, 119 righe vendute). Poi
-- qualcuno ne ha creato un SECONDO (id 104, "Mezzo pacchero all'uovo") e gli ha
-- scritto sopra 026: una cifra sbagliata, sul codice del pacchero intero.
--
-- Non ha fatto danno perche' nessuno l'ha mai selezionato: 0 righe, 0 lotti, e
-- tutti i DDT dei mezzi paccheri sono usciti con NFARMA 036. Ma bastava un
-- click per spedire mezzi paccheri fatturati come paccheri.
--
-- Il motivo per cui e' successo: il codice si scrive a mano quando si crea un
-- articolo, e NIENTE lo confronta con il gestionale. Da qui in poi si confronta.

-- I codici articolo del gestionale, per poterli confrontare. Si riempie dal
-- WS 500003 (M-CODMAG, M-DESCRIZIONE, M-ALIVA).
create table if not exists articoli_gestionale (
  codice          text primary key,
  descrizione     text,
  iva_pct         numeric,
  aggiornato_il   timestamptz not null default now()
);
comment on table articoli_gestionale is
  'Gli articoli come li conosce GAMMA. Serve a confrontare i codici del catalogo: un codice giusto con la descrizione di un altro prodotto e'' il modo piu'' silenzioso di sbagliare una fattura.';

-- Cosa non torna fra il nostro catalogo e il gestionale.
create or replace view v_articoli_da_controllare as
select p.id_prodotto,
       p.codice_prodotto,
       p.descrizione_prodotto,
       g.descrizione as descrizione_gestionale,
       case
         when g.codice is null then 'IL CODICE NON ESISTE NEL GESTIONALE'
         when (p.descrizione_prodotto ~* '(mezz|1/2)') <> (g.descrizione ~* '(mezz|1/2)')
           then 'MEZZO O INTERO: uno dei due dice mezzo e l''altro no'
         when g.iva_pct is not null and p.iva_pct is not null and g.iva_pct <> p.iva_pct
           then 'IVA DIVERSA da quella del gestionale'
       end as problema
  from prodotti p
  left join articoli_gestionale g on g.codice = p.codice_prodotto
 where g.codice is null
    or (p.descrizione_prodotto ~* '(mezz|1/2)') <> (g.descrizione ~* '(mezz|1/2)')
    or (g.iva_pct is not null and p.iva_pct is not null and g.iva_pct <> p.iva_pct);

comment on view v_articoli_da_controllare is
  'Articoli il cui codice non torna col gestionale. "Il codice non esiste" non e'' sempre un errore (prodotti nuovi, espositori, materiale nostro): e'' una cosa da guardare, non da correggere alla cieca.';

grant select on articoli_gestionale, v_articoli_da_controllare to anon, authenticated;

-- UN CODICE, UN ARTICOLO. Due schede con lo stesso codice sono due prezzi, due
-- giacenze e due descrizioni per la stessa cosa: prima o poi si sceglie quella
-- sbagliata.
create unique index if not exists prodotti_un_codice_un_articolo
  on prodotti (codice_prodotto)
  where coalesce(codice_prodotto, '') <> '';

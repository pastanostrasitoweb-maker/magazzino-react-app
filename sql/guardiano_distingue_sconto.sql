-- IL GUARDIANO DISTINGUE LO SCONTO DAL SOVRAPPREZZO.
--
-- Luca, 26/08/2026: DE.FI.MA. e Service Tour restavano in Spediti e non si
-- archiviavano, "dicevano che il prezzo era differente da quanto inserito
-- dall'agente".
--
-- Era vero, ma nel verso opposto al caso Il Celiaco: qui il cliente paga MENO
-- del concordato (10% su DE.FI.MA., 3% su Service Tour, messi a mano in
-- valorizzazione). Non e' un errore a danno di nessuno: e' uno sconto che
-- qualcuno ha deciso di fare.
--
-- Bloccare l'archiviazione per uno sconto concesso vuol dire fermare la merce
-- gia' spedita per una scelta commerciale legittima. Bloccarla per un
-- SOVRAPPREZZO invece e' giusto: li' il cliente pagherebbe piu' del pattuito e
-- se ne accorgerebbe dalla fattura.
--
-- Quindi: sovrapprezzo = si blocca. Sconto = si segnala e si passa.
create or replace function prezzo_concordato_prima_di_archiviare()
returns trigger language plpgsql as $$
declare
  v_sovrapprezzo numeric;
  v_righe        int;
begin
  if not (new.archiviato is true and coalesce(old.archiviato, false) is false) then
    return new;
  end if;
  -- Si guardano SOLO le righe dove il cliente pagherebbe di piu'.
  select count(*), coalesce(sum(scarto), 0) into v_righe, v_sovrapprezzo
    from v_prezzi_traditi where id_ordine = new.id_ordine and scarto > 0.50;
  if v_righe > 0 then
    raise exception
      'PREZZI PIU'' ALTI DI QUELLI CONCORDATI DALL''AGENTE: % righe, % EUR in piu'' a carico del cliente. '
      'L''ordine resta fra i Preparati finche'' qualcuno non decide. '
      'Guarda v_prezzi_traditi per il dettaglio riga per riga.',
      v_righe, round(v_sovrapprezzo, 2);
  end if;
  return new;
end;
$$;

-- Gli sconti concessi restano visibili, ma separati dagli errori.
create or replace view v_sconti_concessi as
  select id_ordine, max(cliente) cliente, max(ddt_numero) ddt_numero, max(data) data,
         count(*) righe, round(sum(scarto), 2) as sconto
    from v_prezzi_traditi
   where scarto < -0.50
   group by id_ordine
   order by sum(scarto);
grant select on v_sconti_concessi to anon, authenticated;

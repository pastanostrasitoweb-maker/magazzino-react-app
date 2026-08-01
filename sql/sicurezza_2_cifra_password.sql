-- SICUREZZA — PASSO 2: cifrare le password (hash bcrypt).
--
-- Dopo il passo 1 le password non sono piu' leggibili dall'esterno, ma sono
-- ancora salvate in chiaro nel database: chiunque abbia accesso al DB (o un
-- backup, o un domani un permesso sbagliato) le vedrebbe. Le trasformiamo in
-- hash bcrypt irreversibili.
--
-- SICURO PERCHE':
-- 1) Tutto in UNA transazione: se qualcosa non va, NON viene applicato niente.
-- 2) La nuova verify_login accetta SIA hash SIA password in chiaro: anche se
--    l'hashing non partisse, il login continuerebbe a funzionare.
-- 3) L'hashing gira dentro una funzione con search_path = public, extensions,
--    così `crypt`/`gen_salt` si trovano dovunque sia installato pgcrypto.
--
-- Le password degli utenti NON cambiano: restano quelle di sempre.

begin;

-- 1) verify_login tollerante (hash o chiaro), invariata nella firma usata dall'app.
drop function if exists public.verify_login(text, text);

create function public.verify_login(p_username text, p_password text)
returns table (username text, etichetta text)
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  return query
  select u.username, u.etichetta
    from public.app_utenti u
   where coalesce(u.attivo, true) = true
     and lower(btrim(u.username)) = lower(btrim(p_username))
     and case
           when u.password like '$2%' then u.password = crypt(p_password, u.password)
           else u.password = p_password
         end;
end;
$fn$;

revoke all on function public.verify_login(text, text) from public;
grant execute on function public.verify_login(text, text) to anon;

-- 2) Cifra le password ancora in chiaro (una volta sola).
create or replace function public._cifra_password_una_volta()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $h$
declare n integer;
begin
  update public.app_utenti
     set password = crypt(password, gen_salt('bf'))
   where password is not null
     and password not like '$2%';
  get diagnostics n = row_count;
  return n;
end;
$h$;

select public._cifra_password_una_volta() as password_cifrate;

drop function public._cifra_password_una_volta();

commit;

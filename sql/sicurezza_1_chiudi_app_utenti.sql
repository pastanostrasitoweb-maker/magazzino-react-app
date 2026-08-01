-- SICUREZZA — PASSO 1: chiudere l'esposizione delle credenziali.
--
-- PROBLEMA (verificato 2026-07-27): con la sola chiave pubblica dell'app
-- (anon, visibile nel browser) si legge public.app_utenti, comprese le
-- password IN CHIARO dei 3 account (produzione / ordini / amministrazione).
--
-- PERCHE' E' SICURO REVOCARE:
-- L'app NON legge piu' quella tabella. Usa due funzioni SECURITY DEFINER, che
-- girano coi permessi del proprietario e quindi NON sono toccate dalla revoca:
--   - verify_login(p_username, p_password)  -> login
--   - lista_utenti_attivi()                 -> tendina utenti
-- Verificato: nessuna delle 6 app fa query dirette su app_utenti.
--
-- DOPO QUESTO PASSO: login e tendina utenti funzionano come prima, ma la
-- tabella (e le password) non sono piu' raggiungibili dall'esterno.

revoke select, insert, update, delete on public.app_utenti from anon;

-- Cintura di sicurezza: anche al ruolo generico public.
revoke select, insert, update, delete on public.app_utenti from public;

-- Le due funzioni restano eseguibili dall'app.
grant execute on function public.verify_login(text, text) to anon;
grant execute on function public.lista_utenti_attivi() to anon;

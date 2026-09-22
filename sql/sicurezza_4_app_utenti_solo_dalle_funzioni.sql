-- SICUREZZA — PASSO 4: agli utenti del magazzino si arriva solo dalle funzioni.
--
-- TROVATO nella revisione del 22/09/2026, e provato davvero (transazione
-- annullata, `set local role authenticated`):
--
--   UPDATE app_utenti ...   -> UPDATE 1
--   DELETE FROM app_utenti  -> DELETE 1, utenti rimasti 3
--
-- Cioe': un account QUALUNQUE del gateway poteva leggere, modificare e
-- CANCELLARE gli utenti del magazzino. Non era un buco teorico: `authenticated`
-- non e' la squadra di casa, sono tutti gli account che hanno un JWT valido,
-- agenti compresi ([[feedback-authenticated-non-e-la-tua-squadra]]). Bastava
-- una DELETE per chiudere fuori il magazzino, e una UPDATE per entrarci.
-- La RLS su app_utenti e' spenta, quindi i GRANT erano l'unica porta.
--
-- Le password erano gia' hash bcrypt (passo 2), quindi la lettura esponeva
-- username + hash, non le password: grave, ma non una consegna di chiavi.
--
-- PERCHE' TOGLIERE I PERMESSI NON ROMPE IL LOGIN
-- Le due sole funzioni che toccano la tabella, `verify_login` e
-- `lista_utenti_attivi`, sono SECURITY DEFINER: girano coi diritti del
-- proprietario e non guardano i permessi di chi chiama. Verificato che nessuna
-- delle undici app legge `app_utenti` direttamente: nel magazzino c'e' solo il
-- commento che dice che non si fa piu'.
REVOKE ALL ON public.app_utenti FROM anon, authenticated;

-- E si chiude anche la porta di servizio: senza RLS un GRANT rimesso per
-- sbaglio domani riaprirebbe tutto. Con la RLS accesa e nessuna policy, la
-- tabella resta invisibile a chi non e' il proprietario anche se qualcuno le
-- ridesse un SELECT per errore. Le funzioni SECURITY DEFINER continuano a
-- passare (il proprietario salta la RLS).
ALTER TABLE public.app_utenti ENABLE ROW LEVEL SECURITY;

-- Le funzioni restano chiamabili: e' da li' che si entra.
GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated;

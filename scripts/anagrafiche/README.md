# Importazione anagrafiche dalle fatture

Il lavoro fatto il 03/08/2026, quando i documenti di trasporto e le fatture
sono passati dal gestionale al magazzino e ci si e' accorti che meta'
anagrafica non c'era.

## Perche' dalle fatture

La fattura elettronica e' la fonte piu' affidabile che abbiamo: quello che c'e'
dentro e' quello che e' stato davvero emesso e accettato dallo SdI. Contiene
proprio i campi che mancavano e che GAMMA non da': indirizzo completo, CAP,
comune, provincia, codice destinatario SdI, modalita' di pagamento.

Gli XML stanno in `~/Desktop/sibill-export/xml` (vedi la nota di memoria
`reference-storico-fatture-xml-sibill`).

## L'ordine dei passi

    python3 anagrafiche_da_fatture.py   # XML -> anagrafiche_fatture.json
    python3 abbina.py                   # abbina al registro clienti_master
    python3 doppioni2.py                # trova i doppioni
    python3 importa.py                  # prova a vuoto
    python3 importa.py --scrivi         # applica

## Le due regole che contano

**Non si sovrascrive mai un dato scritto a mano.** Chi ha corretto
un'anagrafica in app sapeva qualcosa che la fattura non sa, per esempio un
indirizzo di consegna diverso dalla sede. Si riempiono solo i buchi.

**Si scrive in `clienti_override`, non in `clienti_gestionale`.** Il secondo e'
lo specchio di GAMMA e viene risincronizzato: scriverci sopra vorrebbe dire
perdere tutto al prossimo allineamento. L'override e' il livello delle nostre
correzioni ed e' il primo che il DDT guarda.

## Trappole gia' pagate

- **Cloudflare blocca urllib.** La Management API risponde 403 "error code:
  1010" allo user-agent di Python: sembra un problema di permessi e non lo e'.
  Si passa da `curl`.
- **P.IVA segnaposto.** `00000000000`, `111111111`: una cifra sola ripetuta non
  identifica nessuno. Se non si escludono, si accoppia chiunque con chiunque
  (con la sola P.IVA si fondevano Giorgia Immovilli e Silvia Scapigliati).
- **La nostra P.IVA fra i clienti** e' un errore di anagrafica, non un doppione.
- **Nomi di persona.** "claudia", "francesca", "SIMONE" compaiono piu' volte nel
  registro e non sono doppioni: sono persone diverse. Per dire doppione servono
  DUE chiavi: stessa P.IVA valida piu' stesso nome, oppure stesso nome di
  azienda piu' stessa citta'.

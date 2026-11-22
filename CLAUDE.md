# Combriccola — raccolta di giochi da festa

Sito statico con giochi da festa da usare sul telefono (un telefono solo che passa di mano).

- **Indirizzo del sito**: https://paololoddo85.github.io/Raccolta-giochi/
- **Pubblicazione**: GitHub Pages, "Deploy from a branch", ramo `main`, cartella `/` (root).
- **Il nome del repository NON va cambiato**: indirizzo, app installata e service worker sono legati a `/Raccolta-giochi/`.
- Il repository è pubblico: tutto il codice e le carte (anche quelle "hot") sono visibili.

## Regole di lavoro

- Scrivi e rispondi **sempre in italiano**: codice commentato, commit, pull request.
- Il proprietario lavora da Claude Code sul web: niente installazioni locali, tutto passa da GitHub.
- **Piccoli passi**, commit chiari in italiano. Alla fine di ogni fase apri una pull request verso `main`
  con una descrizione semplice di cosa cambia e cosa provare. **Non unire mai le pull request**: lo fa il proprietario.
- Quando parli di una pull request (aperta, aggiornata, da controllare o da unire) scrivi **sempre il suo link**
  completo, es. `https://github.com/paololoddo85/Raccolta-giochi/pull/8`.
- **Prima di aprire ogni pull request** (richiesta del proprietario, vale in ogni sessione), sulle modifiche del ramo:
  1. `/code-review` — cerca errori; correggi quelli reali e aggiungi una prova che li copra;
  2. `/security-review` — soprattutto dove entra testo da fuori (import delle carte, nomi, risposte di iTunes ecc.);
  3. `/simplify` — ripulisce il codice cambiato senza cambiarne il comportamento;
  poi rilancia `node prove/esegui.js` e scrivi nella pull request cosa hanno trovato le revisioni e cosa è stato corretto.
  Per le parti grafiche nuove usa anche la skill `frontend-design`.
- Se una scelta non si può annullare o non è chiara, chiedi prima.
- Ogni gioco deve continuare a funzionare come prima: nessuna funzione persa.
- Prima di dire che una fase è finita: prova davvero nel browser (vedi "Come provare").

## Vincoli tecnici

- **Niente server e niente passaggi di build obbligatori**: i file nel repository sono già pronti da servire.
- **Percorsi relativi** ovunque (mai `/` iniziale) per link, script, stili, manifest, icone e service worker:
  il sito vive in una sottocartella e deve funzionare anche in locale.
- **Niente CDN a runtime**: stili, font e librerie stanno nel sito, così funziona offline.
  Le uniche richieste esterne ammesse sono i contenuti online dei giochi
  (catalogo e locandine di Pellicola, catalogo e audio di Giradischi e Ritornello).
- **Mai `confirm()`, `alert()` o `prompt()`** del browser: usa `RG.conferma()` e `RG.toast()`.
- **Mobile-first**, schermi da 360px in su; nessuno scorrimento orizzontale della pagina.
- Carte e contenuti dei giochi stanno in **file dati separati** (`dati/*.js`), non nel codice.
- Nomi di file e cartelle nuovi **in minuscolo e senza spazi** (trattini se servono).
- Script normali (niente moduli ES) e dati in `.js` (non `.json`): così tutto funziona anche aprendo i file dal computer.

## Struttura

```
index.html  menu.css  menu.js      menù della raccolta ("Chi gioca stasera", scatole dei giochi, suoni, versione)
manifest.webmanifest               app installabile: nome, icone, start_url e scope "./", scorciatoie ai giochi
sw.js                              service worker: VERSIONE + elenco FILE salvati offline (deve stare in radice)
icone/                             icone dell'app (192, 512, maskable, apple-touch, favicon)
HINT_FAKE.html                     vecchi indirizzi → rinvio automatico alla pagina nuova
cinestar_il_gioco_dei_film.html    (non cancellarli: sono nei preferiti e nelle app installate)
hitstar_il_gioco_della_musica.html
giochi/hint-fake/  giochi/hitstar/  giochi/cinestar/   vecchie cartelle: solo il rinvio a cinquina/, giradischi/, pellicola/
shared/
  stile/font.css                   @font-face dei font inclusi: Big Shoulders Display e Instrument Sans (licenza OFL)
  stile/notte.css                  stile comune "notte": colori, caratteri, pulsanti, campi, colore guida --accento
  stile/tailwind.css               Tailwind già compilato (vedi sotto)
  stile/tailwind-sorgente.css      da dove si rigenera tailwind.css
  stile/base.css                   componenti comuni: finestre, notifiche, "Partita in corso", tasto ←
  js/base.js                       spazio globale RG, utilità, RG.archivio (localStorage)
  js/aggiornamento.js              registra sw.js, avviso "Nuova versione disponibile — tocca per aggiornare"
  js/migrazioni.js                 copia dei dati dalle vecchie pagine alle chiavi nuove
  js/squadre.js                    "Chi gioca stasera": 6 nomi condivisi
  js/timer.js                      RG.Timer, schermo sempre acceso (Wake Lock), RG.vibra
  js/suoni.js                      suoni Web Audio sintetizzati + muto condiviso
  js/dialoghi.js                   RG.conferma, RG.toast
  js/partita.js                    salvataggio/ripresa, istantanee per "Annulla ultimo turno"
  js/importa.js                    import di pacchetti JSON, copia negli appunti
  vendor/confetti.js               canvas-confetti (coriandoli di Giradischi), licenza ISC
giochi/<nome>/
  index.html  gioco.js  stile.css  dati/…
giochi/cinquina/dati/carte.js      le 315 carte di Cinquina (prima "HINT FAKE")
giochi/pellicola/dati/film.js      88 film inclusi, titoli alternativi, ricerche del catalogo online (prima "CineStar")
giochi/giradischi/dati/ricerche.js ricerche iTunes e parole che scartano raccolte/remaster/live (prima "Hitstar")
giochi/giradischi/icone.js         icone Font Awesome incluse (SVG), licenza CC BY 4.0
giochi/ritornello/dati/brani.js    brani inclusi da canticchiare [titolo, artista, anno, gruppo it/rap/int/bimbi]
giochi/ritornello/dati/ricerche.js ricerche iTunes per categoria e parole che scartano raccolte/live/remix
prove/                             prove automatiche (Playwright): `node prove/esegui.js` — non fanno parte del sito
```

Ordine di caricamento degli script comuni: `base.js` sempre per primo, poi `migrazioni.js`, poi gli altri.

### Stile comune "notte" e colori dei giochi

Tutte le pagine usano lo stile di Pellicola, scritto una volta sola in `shared/stile/notte.css`: fondo blu notte
(`--notte #0A1020`, riquadri `--platea`, superfici `--velluto`, bordi `--filo`), testo `--luce`, titoli alti e stretti
in **Big Shoulders Display** (maiuscolo), testo in **Instrument Sans**, pulsanti e bordi sobri: niente vetro, niente
sfumature, ombre minime. Ogni pagina sceglie solo il suo colore guida in `stile.css`:

| Pagina | `--accento` | Note |
|---|---|---|
| Menù Combriccola | oro (predefinito) | scatole dei giochi nei loro colori |
| Cinquina | verde acqua `#4D9496` | Tailwind + strato "notte" in fondo a `stile.css` |
| Pellicola | oro `#E8B04B` | CSS proprio |
| Giradischi | rosa `#EC4899` (secondo colore ciano `#22D3EE`) | Tailwind + strato "notte" in fondo a `stile.css`, icone.js |
| Ritornello | viola `#A78BFA` (`--viola`) | CSS proprio; titolo tra i segni musicali di ritornello, timer a pentagramma |

Ordine dei fogli di stile in ogni pagina: `font.css`, (`tailwind.css`), `base.css`, `notte.css`, `stile.css` del gioco.

**Strato "notte" sopra Tailwind** (Cinquina e Giradischi): i due giochi sono scritti con classi Tailwind chiare o
"al neon". In fondo al loro `stile.css` ogni classe di colore usata viene riportata sul fondo notte
(es. `.bg-white` → `--platea`, `.text-slate-900` → `--luce`). Sono regole fuori da `@layer`, quindi vincono sulle
utilità di Tailwind e l'HTML non va toccato. **Se usi una classe di colore nuova in quei giochi, aggiungi lì la sua
versione scura** e guarda lo screenshot. Le regole sugli elementi di `notte.css` stanno in `@layer base`, così
le classi di Tailwind (es. `font-black`) restano più forti.

## Memoria sul dispositivo (localStorage)

Il localStorage è legato al dominio `paololoddo85.github.io` (condiviso con gli altri siti dello stesso account),
per questo tutte le chiavi hanno il prefisso `rg-`. Usa sempre `RG.archivio`, mai `localStorage` direttamente.

| Chiave | Contenuto |
|---|---|
| `rg-comune-squadre` | `{ nomi: [6 stringhe] }` — "Chi gioca stasera" |
| `rg-comune-impostazioni` | `{ muto }` — impostazioni condivise |
| `rg-hintfake-impostazioni` | `{ mode, includeHot }` |
| `rg-hintfake-carte-uscite-bambini` / `-adulti` | id delle carte già uscite |
| `rg-hintfake-carte-importate` | carte importate |
| `rg-hintfake-partita` | partita in corso (`v`, `savedAt`, …) |
| `rg-cinestar-film-giocati` | film già usciti (ultimi 600), prima `cinestar_played_movies_v1` |
| `rg-cinestar-partita` | partita in corso, compreso il film del turno e "annulla" |
| `rg-hitstar-brani-giocati` | brani già usciti (ultimi 500), prima `hitstar_played_songs_v1` |
| `rg-hitstar-partita` | partita in corso, compresi brano del turno, carte già verificate e "annulla" |
| `rg-ritornello-brani-cantati` | brani già cantati (ultimi 500): escono per ultimi |
| `rg-ritornello-partita` | partita in corso, compresi fase del turno, brano, aiuti, tempo rimasto e "annulla" |
| `rg-<gioco>-migrazione` | segno che la migrazione è già stata fatta |

**Nomi interni**: i giochi si chiamavano "HINT FAKE", "Hitstar" e "CineStar". Le chiavi di memoria (`rg-hintfake-…`, `rg-hitstar-…`, `rg-cinestar-…`)
e i valori `data-gioco="hintfake"` / `"hitstar"` / `"cinestar"` del menù **restano con il nome vecchio**: non si vedono e cambiarli
costringerebbe a migrare di nuovo partite e carte. Non rinominarli.

Le vecchie chiavi (`hintfake-…`, `cinestar_…`, `hitstar_…`) vengono **copiate** una volta sola e **non cancellate** (copia di sicurezza).
Le regole stanno in `shared/js/migrazioni.js`. Chi cambia il formato di un salvataggio alza la `versione`
in `RG.partita.crea(...)` e gestisce i salvataggi vecchi.

## Formato delle carte di Cinquina

File: `giochi/cinquina/dati/carte.js` → `window.CINQUINA_CARTE = { base, soloAdultiBase, extra }`.

- `base`: oggetti `{ id, abilita, tema, proibita, oggetti: [5] }` con id numerico. Pubblico "adulti" se l'id
  è in `soloAdultiBase`, altrimenti "tutti".
- `extra.bambini` / `extra.adulti` / `extra.hot`: righe compatte `[abilità, tema, proibita, o1, o2, o3, o4, o5]`.
  L'id nasce dalla posizione: `b1, b2…`, `a1…`, `h1…`.
  **Non riordinare e non cancellare righe**: si romperebbe la memoria delle carte già uscite. Le nuove vanno in fondo.
- `abilita`: `Parlare`, `Mimare`, `Canticchiare` o `Disegnare`.
- `proibita`: la risposta più ovvia del tema; `oggetti`: esattamente 5, diversi dalla proibita.

Formato di **import** (incollato nell'app, generato con "Copia richiesta per Claude"):

```json
[{"abilita":"Mimare","tema":"...","proibita":"...","oggetti":["...","...","...","...","..."],"pubblico":"tutti"}]
```

`pubblico`: `tutti` (entrambe le versioni), `bambini`, `adulti`, `hot` (solo Adulti con carte hot attive).
Sono accettate anche righe a elenco `[abilita, tema, proibita, o1..o5, pubblico]` e `{ "carte": [...] }`.
Le carte doppie (stesso tema e stessa proibita) vengono saltate.

Regola della replica avversaria (non cambiarla): oggetto normale +1 combinabile con tutto;
proibito indovinato +2 e proibito errato −2 alternativi tra loro.

## Salvataggio, ripresa e annulla nei tre giochi

In tutti i giochi: se la pagina viene **ricaricata** (anche dal telefono dopo averla chiusa in sottofondo) con una
partita in corso, si torna **subito in partita** (`RG.partita.ricaricata()`). Aprendo il gioco dal menù si vede
invece la schermata iniziale con il riquadro "Partita in corso" (Riprendi / Scarta).

- **Cinquina**: salva a ogni turno registrato e carta cambiata; "Annulla turno" riapre il passo 4 del turno precedente.
- **Pellicola**: salva a ogni turno, indizio e piazzamento. Dopo un ricaricamento il film del turno resta lo stesso
  (con gli indizi già pagati). "Annulla" torna a prima del piazzamento: dal risultato, nella premiazione o all'inizio
  del turno dopo, finché non si compra un indizio.
  Pellicola è "solo online" (come Giradischi): se il telefono è offline, toccando la sua scatola nel menù compare
  subito "Pellicola ha bisogno di internet" e non si entra (scatole con `data-solo-online`, in `menu.js`).
  Se si arriva al gioco lo stesso (scorciatoia, rete che non risponde) non parte e non riprende una partita:
  compare l'avviso e si resta nella preparazione, con la partita salvata. Se iTunes risponde ma senza film utili si gioca con i film
  inclusi; se la connessione cade a partita iniziata si continua con i film inclusi (locandina "non trovata").
- **Giradischi**: salva a ogni carta, scelta, sfida, gettone e conferma. "Annulla" torna a prima della conferma
  (anche il gettone bonus Pro incassato dopo si perde): dalla carta girata, nella vittoria o all'inizio del turno dopo,
  finché non si usano gettoni o sfide. L'audio non si salva mai: per riascoltare serve la connessione.
  Se la connessione cade, la partita non finisce: compare "Riprova". Come Pellicola è "solo online": offline,
  toccando la sua scatola nel menù compare "Giradischi ha bisogno di internet" e non si entra.

- **Ritornello**: un turno ha 4 fasi (passa il telefono, brano segreto, canta, svela) e si salva a ogni passaggio
  e a ogni secondo del timer. Ricaricando durante il canto si torna al canto con lo stesso brano e il tempo **fermo**
  ("Riprendi il tempo"). "Annulla" torna alla scelta dei punti del turno precedente: dall'esito, nella premiazione o
  all'inizio del turno dopo, finché non parte il tempo. Punti: titolo +2, solo artista +1, furto +1 (una squadra
  avversaria, una risposta), aiuti anno e prima lettera −1 ciascuno (mai sotto zero), chi dice una parola perde il turno.
  **Funziona anche offline** con i brani inclusi (niente `data-solo-online`): con internet arrivano anche brani da iTunes
  e allo svelamento si ascolta l'anteprima (per i brani inclusi viene cercata su iTunes al momento). Gli indirizzi
  di anteprime e copertine sono accettati solo se `https://`.
  Categorie "Italiane moderne" e "Rap italiano moderno" = **ultimi 10 anni** dalla data di oggi (anno in corso e i 9
  prima, `ANNO_MODERNO` in `gioco.js`); le ricerche iTunes con `{anno}` (`ricercheConAnno`) si ripetono per gli ultimi
  3 anni. Il rap ha gruppo `rap` e dal catalogo prende solo il genere hip-hop/rap; conta in "Solo italiane" ma
  **non** in "Italiane moderne" (lì il genere hip-hop/rap del catalogo viene scartato).
  In `dati/ricerche.js` le ricerche per artista si scrivono `"@nome"`: si tengono solo i brani in cui uno degli artisti
  si chiama esattamente così (cercando solo "gaia" iTunes trova anche artisti stranieri come "Gaia Noise").
  Più nomi per lo stesso artista: `"@guè|guè pequeno"` (si cerca il primo, valgono tutti).
  **Ogni anno** i brani inclusi più vecchi escono da queste due categorie: per giocarle bene offline aggiungi in
  `dati/brani.js` successi italiani e rap usciti di recente (nel 2026: 34 italiani recenti senza rap, 36 rap).

## Come aggiungere un nuovo gioco

1. Crea `giochi/<nome>/` con `index.html`, `gioco.js`, `stile.css` e `dati/`.
2. In `index.html` carica, con percorsi relativi `../../shared/…`: `font.css`, `base.css` (e `tailwind.css` se serve),
   poi gli script comuni che ti servono (`base.js` e `migrazioni.js` sempre per primi), poi `dati/…` e `gioco.js`.
3. Metti in alto a sinistra il tasto per tornare: `<a href="../../" class="rg-indietro" aria-label="Torna a Combriccola">…</a>`.
4. Usa `RG.archivio.spazio('<nome>')` per la memoria, `RG.partita.crea('<nome>', …)` per il salvataggio
   (chiave `partita`, così il menù mostra "Partita in corso"), `RG.squadre.nomi(n, predefiniti)` per i nomi.
5. Ridefinisci le variabili `--rg-*` in `stile.css` con i colori del gioco.
6. Aggiungi la scatola del gioco in `index.html` (classe `scatola`, `data-gioco="<nome>"`) e il suo colore in `menu.css`.
7. Aggiungi i file nuovi all'elenco `FILE` di `sw.js` (anche la cartella `giochi/<nome>/`), alza `VERSIONE`
   e aggiungi la scorciatoia in `manifest.webmanifest`. Carica `../../shared/js/aggiornamento.js` dopo `base.js`
   e collega manifest e icone nella `<head>` come negli altri giochi.
8. Aggiorna questo file e prova tutto nel browser.

## App installabile, offline e aggiornamenti (PWA)

- `manifest.webmanifest` e `sw.js` stanno nella radice; `start_url` e `scope` sono `./`, cioè la cartella del sito.
- Ogni pagina carica `shared/js/aggiornamento.js`, che registra `sw.js` ricavando la cartella del sito dalla sua posizione.
- Al primo accesso il service worker salva tutti i file dell'elenco `FILE`; poi i file del sito arrivano dalla cache
  (anche offline). Le richieste verso altri siti (iTunes, anteprime audio, locandine, Wikipedia…) non passano dalla cache.
- **A ogni rilascio** (ogni pull request che cambia file del sito):
  1. alza `VERSIONE` in `sw.js` (`'1'` → `'2'`…): senza, i telefoni continuano a usare i file vecchi;
  2. se hai aggiunto, tolto o rinominato file, aggiorna l'elenco `FILE` (la prova automatica controlla che sia completo).
- Quando c'è una versione nuova compare "Nuova versione disponibile — tocca per aggiornare" (con "Dopo" per chiuderlo).
  Toccando, la pagina si ricarica con la versione nuova e la partita in corso riparte da sola.
- Mentre la versione nuova si scarica compare "Aggiornamento in arrivo…"; se nel frattempo ne esce un'altra,
  l'avviso si ricollega sempre all'ultima.
- Nel menù, in fondo, si vede la versione installata ("Versione 4 · funziona anche senza connessione") e il pulsante
  **"Controlla aggiornamenti"** (`RG.cercaAggiornamenti()`): risponde "ultima versione", "versione nuova trovata",
  "serve la connessione" o "l'app si sta ancora preparando".
- Offline, un indirizzo che non è tra i file salvati **rimanda** al menù (al suo indirizzo, così stili e script si trovano).
- Su **iPhone** l'app installata ha una memoria separata da Safari: cancellare l'icona cancella partite, nomi e carte
  importate. Su Android la memoria è condivisa con Chrome.

## Tailwind

`shared/stile/tailwind.css` è Tailwind v4 **già compilato** e fa parte del repository: non serve nessun passaggio
per pubblicare. Contiene solo le classi usate in `giochi/cinquina/` e `giochi/giradischi/` (Pellicola, Ritornello e il menù hanno
CSS proprio). Se aggiungi classi Tailwind nuove in quei giochi, rigeneralo da un ambiente con Node e committalo:

```
npx @tailwindcss/cli -i shared/stile/tailwind-sorgente.css -o shared/stile/tailwind.css --minify
```

Giradischi era scritto per Tailwind v3: le piccole differenze sono compensate in `giochi/giradischi/stile.css`
(bordi grigi di default, cursore sui pulsanti). Dopo la rigenerazione confronta gli screenshot di Cinquina e Giradischi.

## Icone di Giradischi

Nel codice di Giradischi le icone si scrivono come prima, `<i class="fa-solid fa-play"></i>`: `giochi/giradischi/icone.js`
le disegna come SVG incluse, anche quando cambiano dopo. Per un'icona nuova aggiungi a `ICONE` il `viewBox` e il
percorso presi dal file SVG di Font Awesome Free (stesso nome, senza `fa-`).

## Come provare (prima di ogni pull request)

Le prove automatiche stanno in `prove/` e si lanciano dalla radice del repository, in un ambiente con Node, Playwright
e Chromium (l'ambiente cloud di Claude Code li ha già):

```
node prove/esegui.js                 # tutte (circa 180 controlli, qualche minuto)
node prove/esegui.js cinquina pwa    # solo alcune
```

`esegui.js` avvia un piccolo server che serve il repository sotto `/Raccolta-giochi/` (come GitHub Pages), lancia le prove
con uno schermo da 360×780, blocca le richieste verso internet e salva gli screenshot in `prove/screenshot/` (ignorata da git).

| Prova | Cosa controlla |
|---|---|
| `carte` | mazzo di Cinquina: abilità, 5 oggetti, parola proibita non ripetuta, temi senza doppioni |
| `menu` | nomi condivisi, "Partita in corso", interruttore suoni, ingresso in Pellicola dalla scatola |
| `cinquina` | vecchi indirizzi, migrazione, partita completa, annulla, ripresa, timer, import, muto |
| `pellicola offline` / `online` | offline: avviso "serve internet", niente partita né ripresa; online (risposte finte): partita completa, indizi, ripresa, annulla (3 casi) |
| `giradischi`, `giradischi-offline` | ascolto, sfida, gettoni, bonus Pro, annulla, ripresa, rete persa, avvio senza internet |
| `ritornello online` / `offline` | online (risposte finte): filtri del catalogo, anteprime, aiuti, furto, parola, tempo scaduto, ripresa, annulla (3 casi), vittoria, salvataggio manomesso; offline: si gioca con i brani inclusi |
| `larghezze` | nessuno scorrimento orizzontale in ogni schermata, a 320 e 360px (anche con pellicola lunga) |
| `pwa` | elenco `FILE` completo, installabilità, pagine offline, avviso "ha bisogno di internet" dal menù per Pellicola e Giradischi, avviso e "Controlla aggiornamenti" (su una copia del sito) |

- iTunes, MusicBrainz, Wikidata e Wikipedia non sono raggiungibili dall'ambiente cloud: le prove usano le risposte finte
  di `prove/finti-pellicola.js`, `prove/finti-giradischi.js` e `prove/finti-ritornello.js` (`context.route`).
- Se aggiungi una funzione, aggiungi il suo controllo alla prova del gioco. Guarda gli screenshot prima di chiudere una fase.
- `prove/` non va nell'elenco `FILE` del service worker (la prova `pwa` la esclude).

### Prove automatiche su GitHub (CI)

`.github/workflows/prove.yml` lancia da solo, a ogni pull request e a ogni unione in `main`, tutte le prove
(Chromium installato da Playwright) e allega gli screenshot all'esecuzione. In ogni pull request
`prove/controlla-versione.js` blocca la pull request se cambiano file del sito ma `VERSIONE` in `sw.js` non sale
(non contano `prove/`, `.github/`, i `.md`, `.gitignore` e la sorgente di Tailwind). La pubblicazione del sito resta
quella di GitHub Pages: il flusso delle prove non pubblica niente. Se una prova fallisce, la pull request mostra una X
rossa: va corretta prima di unire.

## Nomi

- **Cinquina** (prima "HINT FAKE"), **Pellicola** (prima "CineStar") e **Giradischi** (prima "Hitstar"): rinominati
  per non richiamare giochi commerciali (HINT, Hitster) né la catena di cinema CineStar. In Giradischi il grido della
  sfida è "SCRATCH!". **Ritornello** è nato con il suo nome: le chiavi di memoria sono `rg-ritornello-…`. Il regolamento di Cinquina è scritto con parole proprie: se lo modifichi, non copiare testi da
  regolamenti ufficiali.

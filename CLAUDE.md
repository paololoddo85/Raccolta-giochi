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
- Se una scelta non si può annullare o non è chiara, chiedi prima.
- Ogni gioco deve continuare a funzionare come prima: nessuna funzione persa.
- Prima di dire che una fase è finita: prova davvero nel browser (vedi "Come provare").

## Vincoli tecnici

- **Niente server e niente passaggi di build obbligatori**: i file nel repository sono già pronti da servire.
- **Percorsi relativi** ovunque (mai `/` iniziale) per link, script, stili, manifest, icone e service worker:
  il sito vive in una sottocartella e deve funzionare anche in locale.
- **Niente CDN a runtime**: stili, font e librerie stanno nel sito, così funziona offline.
  Le uniche richieste esterne ammesse sono i contenuti online dei giochi
  (catalogo e locandine di CineStar, catalogo e audio di Hitstar).
- **Mai `confirm()`, `alert()` o `prompt()`** del browser: usa `RG.conferma()` e `RG.toast()`.
- **Mobile-first**, schermi da 360px in su; nessuno scorrimento orizzontale della pagina.
- Carte e contenuti dei giochi stanno in **file dati separati** (`dati/*.js`), non nel codice.
- Nomi di file e cartelle nuovi **in minuscolo e senza spazi** (trattini se servono).
- Script normali (niente moduli ES) e dati in `.js` (non `.json`): così tutto funziona anche aprendo i file dal computer.

## Struttura

```
index.html  menu.css  menu.js      menù della raccolta ("Chi gioca stasera", scatole dei giochi, suoni)
HINT_FAKE.html                     vecchi indirizzi → rinvio automatico a giochi/<nome>/
cinestar_il_gioco_dei_film.html    (non cancellarli: sono nei preferiti e nelle app installate)
hitstar_il_gioco_della_musica.html
shared/
  stile/font.css                   @font-face dei font inclusi (font/*.woff2, licenza OFL)
  stile/tailwind.css               Tailwind già compilato (vedi sotto)
  stile/tailwind-sorgente.css      da dove si rigenera tailwind.css
  stile/base.css                   componenti comuni: finestre, notifiche, "Partita in corso", tasto ←
  js/base.js                       spazio globale RG, utilità, RG.archivio (localStorage)
  js/migrazioni.js                 copia dei dati dalle vecchie pagine alle chiavi nuove
  js/squadre.js                    "Chi gioca stasera": 6 nomi condivisi
  js/timer.js                      RG.Timer, schermo sempre acceso (Wake Lock), RG.vibra
  js/suoni.js                      suoni Web Audio sintetizzati + muto condiviso
  js/dialoghi.js                   RG.conferma, RG.toast
  js/partita.js                    salvataggio/ripresa, istantanee per "Annulla ultimo turno"
  js/importa.js                    import di pacchetti JSON, copia negli appunti
  vendor/confetti.js               canvas-confetti (coriandoli di Hitstar), licenza ISC
giochi/<nome>/
  index.html  gioco.js  stile.css  dati/…
giochi/hint-fake/dati/carte.js     le 304 carte di HINT FAKE
giochi/cinestar/dati/film.js       88 film inclusi, titoli alternativi, ricerche del catalogo online
giochi/hitstar/dati/ricerche.js    ricerche iTunes e parole che scartano raccolte/remaster/live
giochi/hitstar/icone.js            icone Font Awesome incluse (SVG), licenza CC BY 4.0
```

Ordine di caricamento degli script comuni: `base.js` sempre per primo, poi `migrazioni.js`, poi gli altri.

### Colori dei giochi
Ogni gioco ha la sua identità; le parti comuni si adattano ridefinendo le variabili `--rg-*` in `stile.css`.

| Gioco | Colore | Note |
|---|---|---|
| Menù Combriccola | prugna `#24142E`, latte `#FFF4E6` | font Bricolage Grotesque |
| HINT FAKE | verde acqua `#4D9496`, nero `#1E2024` | font Inter, Tailwind |
| CineStar | oro `#E8B04B` su notte `#0A1020` | font Big Shoulders Display + Instrument Sans, CSS proprio |
| Hitstar | rosa `#EC4899` e ciano `#22D3EE` su viola notte | font Inter + Space Grotesk, Tailwind, icone.js |

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
| `rg-<gioco>-migrazione` | segno che la migrazione è già stata fatta |

Le vecchie chiavi (`hintfake-…`, `cinestar_…`, `hitstar_…`) vengono **copiate** una volta sola e **non cancellate** (copia di sicurezza).
Le regole stanno in `shared/js/migrazioni.js`. Chi cambia il formato di un salvataggio alza la `versione`
in `RG.partita.crea(...)` e gestisce i salvataggi vecchi.

## Formato delle carte di HINT FAKE

File: `giochi/hint-fake/dati/carte.js` → `window.HINTFAKE_CARTE = { base, soloAdultiBase, extra }`.

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

- **HINT FAKE**: salva a ogni turno registrato e carta cambiata; "Annulla turno" riapre il passo 4 del turno precedente.
- **CineStar**: salva a ogni turno, indizio e piazzamento. Dopo un ricaricamento il film del turno resta lo stesso
  (con gli indizi già pagati). "Annulla" torna a prima del piazzamento: dal risultato, nella premiazione o all'inizio
  del turno dopo, finché non si compra un indizio.
- **Hitstar**: salva a ogni carta, scelta, sfida, gettone e conferma. "Annulla" torna a prima della conferma
  (anche il gettone bonus Pro incassato dopo si perde): dalla carta girata, nella vittoria o all'inizio del turno dopo,
  finché non si usano gettoni o sfide. L'audio non si salva mai: per riascoltare serve la connessione.
  Se la connessione cade, la partita non finisce: compare "Riprova".

## Come aggiungere un nuovo gioco

1. Crea `giochi/<nome>/` con `index.html`, `gioco.js`, `stile.css` e `dati/`.
2. In `index.html` carica, con percorsi relativi `../../shared/…`: `font.css`, `base.css` (e `tailwind.css` se serve),
   poi gli script comuni che ti servono (`base.js` e `migrazioni.js` sempre per primi), poi `dati/…` e `gioco.js`.
3. Metti in alto a sinistra il tasto per tornare: `<a href="../../" class="rg-indietro" aria-label="Torna a Combriccola">…</a>`.
4. Usa `RG.archivio.spazio('<nome>')` per la memoria, `RG.partita.crea('<nome>', …)` per il salvataggio
   (chiave `partita`, così il menù mostra "Partita in corso"), `RG.squadre.nomi(n, predefiniti)` per i nomi.
5. Ridefinisci le variabili `--rg-*` in `stile.css` con i colori del gioco.
6. Aggiungi la scatola del gioco in `index.html` (classe `scatola`, `data-gioco="<nome>"`) e il suo colore in `menu.css`.
7. Aggiungi i file nuovi alla lista del service worker e alza il suo numero di versione (dalla fase 4).
8. Aggiorna questo file e prova tutto nel browser.

## Tailwind

`shared/stile/tailwind.css` è Tailwind v4 **già compilato** e fa parte del repository: non serve nessun passaggio
per pubblicare. Contiene solo le classi usate in `giochi/hint-fake/` e `giochi/hitstar/` (CineStar e il menù hanno
CSS proprio). Se aggiungi classi Tailwind nuove in quei giochi, rigeneralo da un ambiente con Node e committalo:

```
npx @tailwindcss/cli -i shared/stile/tailwind-sorgente.css -o shared/stile/tailwind.css --minify
```

Hitstar era scritto per Tailwind v3: le piccole differenze sono compensate in `giochi/hitstar/stile.css`
(bordi grigi di default, cursore sui pulsanti). Dopo la rigenerazione confronta gli screenshot di HINT FAKE e Hitstar.

## Icone di Hitstar

Nel codice di Hitstar le icone si scrivono come prima, `<i class="fa-solid fa-play"></i>`: `giochi/hitstar/icone.js`
le disegna come SVG incluse, anche quando cambiano dopo. Per un'icona nuova aggiungi a `ICONE` il `viewBox` e il
percorso presi dal file SVG di Font Awesome Free (stesso nome, senza `fa-`).

## Come provare (prima di ogni pull request)

- Servi la **cartella che contiene il repository** chiamata `Raccolta-giochi` (es. un link simbolico) con un server
  statico, e apri `http://localhost:<porta>/Raccolta-giochi/`: così si simula la sottocartella di GitHub Pages.
- Playwright (già presente nell'ambiente cloud): schermo 360×780, blocca le richieste esterne per simulare l'offline,
  nessun errore in console, nessuno scorrimento orizzontale.
- Per ogni gioco: partita completa, annulla turno, ripresa dopo il ricaricamento, import (dove c'è).
- Controlla lo scorrimento orizzontale in **ogni schermata** di ogni gioco (non solo nella prima), a 320 e 360px.
- CineStar e Hitstar usano servizi online (iTunes, MusicBrainz, Wikidata, Wikipedia): nell'ambiente cloud non sono
  raggiungibili, quindi si provano con risposte finte servite da Playwright (`context.route`), più una prova offline.
- Controlla gli screenshot prima di chiudere la fase.

## Nomi

"HINT" e "Hitstar" ricordano giochi commerciali (HINT, Hitster); "CineStar" è anche una catena di cinema.
Per ora restano così; da rinominare (e regolamento da riscrivere con parole proprie) prima di una condivisione pubblica.

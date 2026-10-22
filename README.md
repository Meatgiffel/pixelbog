# PIXELBOG

Kontaktbog i 8-bit-stil til en selvhostet [Radicale](https://radicale.org)-server. Appen taler CardDAV direkte med Radicale, så kontakterne forbliver på din server og synkroniserer videre til telefon og mail-klient som hidtil.

- Adressebøger, søgning (navn, nummer, by …), karakterark og redigering
- Opret, ret og slet, med "Fortryd" efter sletning
- Konfliktdetektion: er kontakten ændret på en anden enhed, mens du redigerer, kan du vælge at genindlæse eller overskrive
- Import af `.vcf` (også mange kort i én fil) og eksport af en hel bog
- Bevarer alt, appen ikke selv viser: X-felter, Apple-labels, PREF og andre klienters data røres ikke
- Lys tilstand (Game Boy) og mørk tilstand (CRT), scanlines, 8-bit-lyde og animationer, som alle kan slås fra
- Fungerer på mobil, tablet og desktop

Designet ligger i `design/` (eksport fra Claude Design) og er kilden til layout, farver og komponenter.

## Kør med Docker

Containeren er en nginx, der serverer appen og proxyer `/dav/` videre til Radicale. Browseren taler altså kun med ét domæne, og der er ingen CORS at sætte op.

```sh
docker build -t pixelbog .
docker run -d --name pixelbog -p 8080:8080 -e RADICALE_URL=http://radicale:5232 pixelbog
```

Se også `docker-compose.example.yml`.

| Variabel | Standard | Betydning |
|---|---|---|
| `RADICALE_URL` | `http://radicale:5232` | Hvor containeren finder Radicale (uden `/` til sidst) |
| `LISTEN_PORT` | `8080` | Porten nginx lytter på i containeren |
| `BASE_PATH` | *(tom)* | Sæt fx `/kontakter`, hvis din reverse proxy lægger appen under en sti og fjerner stien, før den sender videre |

### Krav til Radicale

- Login med brugernavn og kodeord (`[auth] type = htpasswd` eller lignende). Appen sender det videre som Basic auth.
- Radicale skal kunne nås fra containeren. Den behøver ikke være eksponeret på internettet ud over det, du allerede har.

### Reverse proxy og HTTPS

Brug **HTTPS** foran containeren (Caddy, Traefik, nginx …). Basic auth sender kodeordet med hver forespørgsel, så over ren HTTP kan det læses af alle undervejs.

Kodeordet ligger i fanens `sessionStorage`, så du kan genindlæse siden uden at logge ind igen. Det slettes, når fanen lukkes, eller når du logger ud. Containeren sender en stram Content-Security-Policy, så fremmede scripts ikke kan læse det.

## Udvikling

```sh
npm install
npm run dev          # http://localhost:5173 — proxyer /dav/ til RADICALE_URL (standard http://127.0.0.1:5232)
npm test             # unit-tests af vCard-laget
npm run build        # typecheck + produktionsbuild i dist/
```

Integrationstests mod en rigtig Radicale (opretter og sletter midlertidige adressebøger):

```sh
RADICALE_TEST_URL=http://127.0.0.1:5232/ RADICALE_TEST_USER=test RADICALE_TEST_PASS=test npm test
```

### Struktur

```
src/vcard/       vCard-parser/-serializer og kontakt-model (bevarer ukendte felter)
src/dav/         WebDAV/CardDAV-klient
src/state/       app-tilstand, routing, indstillinger, dialoger/toasts
src/components/  React-komponenter (login, liste, karakterark, formular, import …)
src/styles/      tokens.css og app.css fra designet
docker/          nginx-konfiguration til containeren
```

## Værd at vide om Radicale

- **Radicale skriver kortene om.** Radicale gemmer ikke vCard'et byte for byte. Det sorterer egenskaberne og retter skrivemåden (fx `type=cell` til `TYPE=CELL`). Indholdet bevares.
- **vCard 4-fotos.** Radicale klipper `PHOTO:data:image/…;base64,…` over ved kommaet, så billedet går tabt. Appen skriver derfor vCard 4-fotos escapet (`data:image/jpeg\;base64\,…`), som Radicale bevarer. Fotos, der allerede er ødelagt på serveren, vises ikke.

## Afvigelser fra designet

- Skuffe-layoutet (sidebjælken skjult) bruges op til 1279 px i stedet for 1023 px. Tre kolonner gav vandret scroll ved 1024 px, også i designets egen prototype.
- Fotos gemmes i fuld kvalitet (256 × 256 JPEG) i vCard'et, så de ser normale ud på telefonen. Den pixelerede udgave laves kun til visning i appen.
- Fødselsdage uden årstal (fx fra iPhone) vises som "Gemt uden årstal" i formularen, fordi en datovælger ikke kan vise dem.
- Har kontoen ingen adressebøger, kan man oprette en fra listen.

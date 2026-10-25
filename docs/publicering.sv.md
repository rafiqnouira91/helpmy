# Helpy på GitHub Pages nu och Hostup VPS senare

Appen använder redan React. En statisk React-version består av färdigbyggd HTML, CSS och JavaScript som körs i webbläsaren. Det går därför att använda samma gränssnitt på GitHub Pages och senare behålla det på VPS:en.

## GitHub Pages: en engångsinställning

1. För över kodändringarna till GitHubs `main`-gren, inklusive `.github/workflows/pages.yml` och den uppdaterade `bun.lock`.
2. Öppna repot på GitHub och välj **Settings → Pages**.
3. Under **Build and deployment → Source**, välj **GitHub Actions**, i stället för publicering från en gren.
4. Öppna **Actions → Publish Helpy to GitHub Pages**. En push till `main` startar bygget. Vid behov välj **Run workflow** för att köra manuellt.
5. När både `build` och `deploy` är gröna, öppna `https://rafiqnouira91.github.io/helpmy/` och ladda om sidan. Det ska nu vara React-appen, inte README:n.

Workflow-filen är förberedd; den är inte körd eller publicerad från denna arbetsmiljö. GitHub kan kräva att Actions/Pages tillåts för repot. En eventuell publiceringsspärr hanteras i GitHub-inställningarna.

Bygget använder `bun install --frozen-lockfile` med Bun 1.3.14 och Node 24. Låsfilens Lovable-spegeladresser har ersatts med publika npm-adresser; versionsnummer och integritetskontrollsummor är oförändrade. Ingen privat Lovable-registernyckel behövs för installationen.

Workflow bygger med `npm run build:pages` och publicerar **enbart `dist-pages`**. Varken källkodens `.env`-fil, Node-servern eller servernycklar ska laddas upp som Pages-artifakt. Endast `VITE_*`-variabler bäddas in i webbläsarbygget. Repots `.env.pages` innehåller enbart den publika Supabase-konfiguration som används vid Pages-bygget; kontrollera rätt projekt innan publicering. Lägg aldrig hemligheter i `VITE_*`-variabler.

Standardadressen för byggda filer är `/helpmy/`. Workflow sätter automatiskt undermappen utifrån repots namn. Sidorna använder hash-routing, till exempel `/helpmy/#/auth`, eftersom GitHub Pages inte har en appserver för `/auth`. Ändra `PAGES_BASE_PATH` till `/` om du senare använder Pages på en egen domän direkt i roten.

### Vad fungerar i den statiska versionen?

- Samma React-gränssnitt, Tailwind-design, bilder och mobilnavigation.
- Inloggning, profiler, uppdragslistor och andra klientfunktioner via Supabase, beroende på databasens befintliga behörigheter.
- Uppdragens statusflöde använder Supabase direkt som före Stripe-förberedelsen. Ingen kortbetalning sker; gränssnittet säger det uttryckligen.
- Stripe-knappar och serveranrop för betalning är avstängda. Serverns hemliga nycklar behövs inte på GitHub Pages.

Använd helst ett separat Supabase-testprojekt för en publik demo. Lägg till `https://rafiqnouira91.github.io/helpmy/` bland Supabase Auths tillåtna Redirect URLs, så att bekräftelsemejl leder tillbaka till rätt undermapp. Kontrollera även projektets Site URL om ni använder den som standard. Efter att användaren återvänder låter appen Supabase hantera token innan hash-routern startar.

**Stripe-migrering 0006 kräver betalning för att avsluta jobb.** Applicera den inte på en databas som ska ha ett rent statiskt flöde utan betalning. Om den redan används kommer databasreglerna korrekt att stoppa obetalda jobb även från Pages. Vi kringgår aldrig databasens betalningsskydd. Skilj då testmiljöerna åt eller använd den framtida serverversionen.

### Bygga och kontrollera lokalt

```sh
bun install --frozen-lockfile
npm run build:pages
npm run preview:pages -- --host 127.0.0.1 --port 4173
```

Den byggda appens undermapp är `/helpmy/`. För utveckling utan bygge: `npm run dev:pages`, och öppna `/helpmy/pages.html`. Den separata HTML-ingången används bara för webbläsarbygget och påverkar inte Lovables serverrendering.

## Hostup VPS: förberett nästa steg

Det befintliga kommandot `npm run build` och `vite.config.ts` finns kvar för Lovable. För en vanlig Linux-VPS med Node används:

```sh
bun install --frozen-lockfile
npm run build:vps
npm run start:vps
```

`build:vps` väljer Nitros `node-server` i stället för Cloudflare. Resultatet ligger i `.output`. VPS-versionen använder vanliga adresser som `/auth`, utan hash. Den har en riktig server som kan ta emot `/api/stripe/*` när Stripe senare konfigureras.

Bygg med Node 24/Bun på VPS:en eller motsvarande Linux-arkitektur. De publika Supabase-variablerna behöver finnas vid bygget. Serverhemligheter ska däremot läggas in vid körning och aldrig skrivas in i frontendfilerna. `npm run start:vps` läser lokal `.env` automatiskt. Vid systemd-drift används i stället miljöfilen nedan.

Planerad installation:

1. Skapa användaren `helpy` och en appkatalog på `/srv/helpy/current` på VPS:en.
2. Lägg checkout och byggresultat där, med rätt läsbehörigheter. Installera Node 24 och Bun 1.3.14.
3. Lägg runtime-inställningar i `/etc/helpy.env`, som bara administratören får läsa. Supabase-URL och publik nyckel behövs på servern. Stripe-hemligheter fylls i först när Stripe tas i bruk; se Stripe-guiden.
4. Anpassa och installera `deploy/helpmy.service` som en systemd-tjänst. Den kör Node på `127.0.0.1:3000` och startar om processen vid fel. Kontrollera sökvägen till Node.
5. Anpassa `deploy/nginx.conf.example` till er riktiga domän. Nginx skickar trafiken till Node-servern. Lägg till HTTPS-certifikat och kontrollera Nginx-konfigurationen innan tjänsten aktiveras.
6. Uppdatera Supabase Auths tillåtna returadresser till den nya domänen. När Stripe aktiveras ska även `APP_URL` och webhookens adress motsvara den nya HTTPS-domänen.

Filerna är exempel för en vanlig Linux-VPS; ingen ändring är gjord på något Hostup-konto och ingen domän eller TLS-installation är utförd. Vi går igenom de faktiska VPS-stegen när ni har servern.

## Verifiering i utvecklingsmiljön

Båda produktionsbyggena och projektets TypeScript-kontroll passerade. Den byggda Pages-versionen testades i Chromium med mobil- och datorstorlek: startsida, CSS, typsnitt, inloggningsnavigation och omladdning av `#/auth` fungerade utan JavaScript- eller lokala assetfel. Den byggda Node-servern startades och testades med startsida och `/auth`, inklusive omladdning utan hydreringsfel.

Supabase-svaren i webbläsartestet simulerades eftersom nätverket blockerar det externa projektet här. Verklig inloggning, mejlbekräftelse, databasändringar och GitHubs/Hostups publicering är separata kontroller som återstår.

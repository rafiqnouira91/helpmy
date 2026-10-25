# Koppla Stripe-testbetalningar till Helpmy

Den här versionen är **endast för sandlåda**. Live-nycklar och live-webhookevent nekas.
Ingen produktkatalog behövs: servern hämtar uppdragets pris från Supabase. Kunden
reserverar beloppet på sitt kort efter accept; vid kundens godkännande debiteras kortet
och hjälparens andel överförs till hjälparens anslutna Stripe-testkonto.

Helpmy använder Checkout, Express Connect och *separate charges and transfers*.
Varje hjälpare får ett eget anslutet konto genom appens registreringsflöde.
Det generiska testkonto du skapade i dashboarden kopplas alltså inte automatiskt till
någon appanvändare. Det behövs inget `acct_`-värde i `.env`: servern sparar kopplingen.

Vid 500 kr får hjälparen 425 kr och plattformen behåller 75 kr **före Stripes avgifter**.
Hjälparens ersättning avrundas till hela kronor för att matcha appens gränssnitt.
En överföring till Stripe-saldot är inte en bankutbetalning. Kortreservationer har en
begränsad giltighetstid; detta är inte en escrow-tjänst.

## 1. Hämta koden och skapa din lokala .env

Installera Node.js 24 LTS, Git och Bun. Använd befintlig projektmapp om den finns.
I en molnuppgift används befintlig checkout; skapa inte någon extra Git-worktree.

```sh
git clone https://github.com/rafiqnouira91/helpmy.git
cd helpmy
bun install --frozen-lockfile
```

Öppna projektet i kodeditor. Om `.env` saknas: kopiera `.env.example` och döp kopian
till `.env`. Om filen redan finns: behåll befintliga värden och fyll på med de saknade.
`.env` är ignorerad av Git. Skicka aldrig dess innehåll i chatten eller till GitHub.

GitHub lagrar koden, inte inloggningskontona eller databasen. Appen använder fortfarande
Supabase även när du kör den utanför Lovable. Du behöver tillgång till samma Supabase-projekt,
eller en separat testdatabas där alla tidigare migrationer installerats.

## 2. Supabase-uppgifter

Öppna ditt projekt på https://supabase.com/dashboard.

1. Leta efter **Connect** eller **Settings → API / API Keys**.
2. Kopiera projektets URL till både `VITE_SUPABASE_URL` och `SUPABASE_URL` i `.env`.
3. Kopiera den publika **publishable**-nyckeln (äldre projekt: `anon`) till både
   `VITE_SUPABASE_PUBLISHABLE_KEY` och `SUPABASE_PUBLISHABLE_KEY`.
4. Under projektets API-nycklar, visa servernyckeln **service_role** (kan ligga under
   legacy API keys). Fyll bara i den i `SUPABASE_SERVICE_ROLE_KEY`.
5. Under **Authentication → URL Configuration**, lägg till `http://localhost:3000`
   bland tillåtna returadresser för lokal testning. Lägg senare till din riktiga HTTPS-domän.

`service_role` kringgår databasens behörighetsregler. Den får aldrig ligga i en
`VITE_`-variabel. De två `VITE_SUPABASE_*`-värdena är däremot avsedda för webbläsaren.

Om du inte har tillgång till projektets servernyckel behöver projektåtkomsten ordnas
först. Ett nytt tomt Supabase-projekt innehåller inte automatiskt befintlig data.

## 3. Databasmigrationer – görs en gång

Använd helst en separat Supabase-testdatabas. Befintliga migrationer **0000–0005**
måste redan vara installerade. Öppna **SQL Editor → New query** i Supabase:

1. Öppna `drizzle/migrations/0006_stripe_payments.sql` i kodeditor.
2. Kopiera innehållet till SQL Editor och kör som databasägare, om migrationen inte redan körts.
3. Kör sedan `drizzle/migrations/0007_test_card_reservations.sql` på samma sätt.
4. Kontrollera att båda körningarna lyckas. Kör inte create-table-migrationen igen om den redan finns.

0006 skapar privata konto-/betalningstabeller och betalningsskydd. 0007 lägger till
kortreservationer. Webbläsaren får inte läsa eller ändra betalningstabellerna direkt.
Detta engångssteg behövs **utöver att fylla i `.env`**.

Migrationerna finns också i Drizzle-journalen. Blanda inte manuella SQL-körningar och
automatisk migrering utan att stämma av migrationshistoriken. Använd inte `drizzle-kit push`
för att återskapa databasen: projektets genererade schemafil är tom.

Applicera inte betalningskraven i en databas som ska stödja en ren GitHub Pages-demo
utan betalningsserver. Reglerna stoppar då obetalda jobb även från Pages. Vi kringgår dem inte.

## 4. Stripe-nyckeln i sandlådan

1. Öppna https://dashboard.stripe.com och välj **Helpy-sandlåda** uppe till vänster.
2. Kontrollera den blå raden som säger att ändringar inte påverkar riktiga betalningar.
3. Använd sökfältet högst upp och sök efter **API-nycklar / API keys**.
   Menyn kan också finnas under **Developers / Workbench**.
4. Visa och kopiera sandlådans **hemliga nyckel**, som börjar med `sk_test_`.
5. Lägg värdet i `STRIPE_SECRET_KEY` i `.env`.

Du behöver ingen `pk_test_`-nyckel för detta Checkout-upplägg. Använd aldrig en live-nyckel.
Plattformens Connect-inställningar måste tillåta svenska Express-konton med överföringar.

Sätt också `APP_URL=http://localhost:3000`. Använd exakt den adressen i webbläsaren;
`127.0.0.1` är ett annat ursprung och nekas om APP_URL säger localhost.

## 5. Koppla webhook för lokal testning

En webhook gör att Stripe kan meddela servern om betalningar även om kunden stänger sidan.
Installera Stripe CLI enligt https://docs.stripe.com/stripe-cli.
Autentisera mot **samma sandlåda** som nyckeln i appen, och kör i en separat terminal:

```sh
stripe login
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,charge.refunded,charge.dispute.created --forward-to localhost:3000/api/stripe/webhook
```

Om standardinloggningen väljer fel konto/sandlåda, använd CLI:ns dokumenterade stöd för
sandlådans API-nyckel via den lokala miljövariabeln `STRIPE_API_KEY`. Skriv inte hemliga
nycklar som argument i kommandon eller skicka dem i chatten.

CLI:n visar en signeringshemlighet som börjar med `whsec_`. Lägg den i
`STRIPE_WEBHOOK_SECRET` i `.env`. Detta måste vara ett verkligt värde i serverprocessen:
en proxyplatshållare kan inte verifiera signaturer lokalt.

Låt CLI-processen fortsätta köra. Starta appen i en annan terminal:

```sh
npm run dev
```

Starta om appen varje gång du ändrar `.env`. Serverkommandona läser `.env` automatiskt.
Inga hemligheter ska läggas i `VITE_`-variabler.

## 6. Första betalningstestet i appen

Använd två olika appanvändare: en beställare och en hjälpare. Appinloggningen är via
Supabase, inte ditt eget Stripe-administratörskonto. Separata webbläsarprofiler förenklar.

1. Logga in som **hjälparen** och öppna **Profil**.
2. Klicka **Anslut / uppdatera utbetalningskonto**. Du skickas till Stripe.
3. Kontrollera att det är testmiljön och slutför test-onboarding. Använd Stripes
   erbjudna testdata enligt https://docs.stripe.com/connect/testing – inte riktiga
   identitets- eller bankuppgifter. För svensk testbank används exempelvis IBAN
   `SE3550000000054910000003`. Funktionerna transfers och payouts måste vara aktiva.
4. Gå tillbaka till Helpmy. Logga in som **beställaren** och skapa ett uppdrag, t.ex. 500 kr.
5. Som hjälparen: acceptera uppdraget.
6. Som beställaren: öppna **Aktivitet → Jag behöver hjälp**. Klicka
   **Reservera 500 kr på kort** på uppdraget.
7. På Stripe Checkout: använd kort `4242 4242 4242 4242`, ett framtida utgångsdatum
   och valfri tresiffrig CVC. Slutför.
8. Tillbaka i Aktivitet: vänta tills **Kortreservation bekräftad** visas. Status hämtas
   från servern ungefär var 15:e sekund. Returadressen är inget betalningsbevis.
9. Som hjälparen: klicka **Jag är klar** i Aktivitet.
10. Som beställaren: klicka **Godkänn och avsluta**. Servern debiterar reservationen,
    överför hjälparens andel och slutför uppdraget först när stegen lyckats.
11. Kontrollera betalningen och överföringen i Stripes sandlåda. Ett Stripe-saldo är
    skilt från utbetalningen till banken, som följer kontots utbetalningsschema.

Prova även avvisat kort `4000 0000 0000 9995` och autentiseringstestet
`4000 0025 0000 3155`. Kontrollera att ett avvisat kort inte ger bekräftad reservation.
Upprepade Checkout-klick återanvänder en öppen session. Upprepat godkännande ska inte
debitera eller överföra dubbelt.

## 7. Utgångna reservationer, återbetalningar och begränsningar

Kontrollera capture-fristen i Stripe. En reservation kan inte hållas obegränsat.
Om den löper ut kan godkännandet inte debitera; hjälparen ska inte börja arbeta utan
bekräftad giltig reservation. Appen har ännu ingen omboknings-/avbokningsvy.
Använd ett nytt testuppdrag för nästa försök efter utgången session/reservation.

Gamla ofullständiga Checkout-/överföringsförsök stoppas efter idempotensfönstret för att
undvika dubbelbetalning. Återställ inte databasfält på måfå. Kontrollera först belopp,
Stripe-session, charge och eventuell transfer i dashboarden.

Teståterbetalningar hanteras i Stripe Dashboard. En refund av en separat charge tar
**inte automatiskt tillbaka en transfer** till hjälparen; en transfer reversal kan behövas.
Refund-/tvistwebhooks spärrar fortsatt automatisk överföring, men löser inte supportärendet.
Ingen färdig administrationsvy eller fullständigt liveflöde ingår.

## 8. Senare på Hostup

Du behöver ett abonnemang som kan köra en **Node.js-server/VPS**. Statisk webbhosting
eller GitHub Pages kan inte köra servern som skyddar nycklar och tar emot webhooks.
Koden kan ligga på GitHub under tiden; kör betalningstestet på din dator eller utvecklingsserver.

```sh
bun install --frozen-lockfile
npm run build:vps
npm run start:vps
```

Använd Node.js 24. Vid build behövs de publika Supabase-variablerna. Serverhemligheter
behövs vid körning. Ändra `APP_URL` till den publika HTTPS-domänen och uppdatera Supabase
Auths returadresser. Kör Node bakom HTTPS-reverse proxy och processhanterare; exempel
finns i `deploy/` och [publiceringsguiden](publicering.sv.md).

I sandlådans **Workbench → Webhooks / Event destinations** skapar du en destination
för **plattformskontots event**, med samma händelser som i steg 5 och endpoint
`https://DIN-DOMÄN/api/stripe/webhook`. Använd API-version `2024-06-20` om versionsval erbjuds.
Ange destinationens egen `whsec_` på servern; CLI-hemligheten gäller inte den endpointen.
Reverse proxyn måste behålla rå request-body och `Stripe-Signature` oförändrade.
Servern behöver utgående HTTPS till `api.stripe.com` och ditt Supabase-projekt.

Behåll `sk_test_` även på en offentligt nåbar testserver. Servern spärrar live-nycklar.
För riktiga pengar krävs separat lanseringsarbete med företagsverifiering, skatter,
plattformsvillkor, återbetalningar, tvister, övervakning och avstämning.

## Kodkontroller

```sh
npm run test:payments
npm run typecheck
npm run build:vps
npm run build:pages
```

API-testerna simulerar Stripe och databasen och verifierar bl.a. signaturer, belopp,
behörigheter, reservation och debitering före överföring. SQL-testerna
`tests/stripe-payment-rules.sql` och `tests/stripe-reservation-rules.sql` kan köras som
ägare i en separat testdatabas efter migrationerna; de återställer data med ROLLBACK.
Dessa ersätter inte betalningstestet med dina egna sandlådenycklar och din databas.

# Stripe i Helpy – från första konto till testbetalning

## Vad Stripe gör här

Stripe tar emot kortbetalningen. **Checkout** är Stripes färdiga betalningssida; Helpy hanterar aldrig kortnummer. **Connect** ger varje hjälpare ett anslutet Stripe-konto. Stripe samlar in de identitets- och bankuppgifter som behövs. Ett anslutet konto är inte samma sak som BankID-verifiering i Helpy.

Helpy använder *separate charges and transfers*: kunden betalar till plattformen, och plattformen för sedan över hjälparens del till ett anslutet konto. Det är två olika åtgärder. En överföring till Stripe-kontot är i sin tur inte samma sak som att pengarna har nått hjälparens bankkonto.

Exempel: kunden betalar **500 kr**, hjälparens del är **425 kr**, plattformens del är **75 kr före Stripes avgifter och eventuella skatter**. Helpy står för Stripes avgifter i den här modellen. För att matcha befintligt gränssnitt avrundas hjälparens del till hela kronor. Stripe får beloppen som heltal i öre.

Kunden debiteras när Checkout slutförs efter att en hjälpare accepterat. Pengarna förs vidare först när kunden godkänner jobbet. Detta är inte en kortreservation eller en escrow-tjänst. Utred Stripes tillåtna tidsgränser, plattformsansvar och era villkor innan produktion. Automatisk bankutbetalning, väntetider och extra Connect-avgifter styrs också av ert Stripe-avtal och kontoinställningar.

## 1. Skapa plattformens konto och använd testmiljön

1. Skapa ett konto på https://dashboard.stripe.com/register för företaget bakom Helpy.
2. Öppna en testmiljö/sandbox i Stripe Dashboard. Kontrollera att du arbetar med testdata.
3. Aktivera **Connect**. Beskriv verksamheten som en marknadsplats där kunder köper tjänster av hjälpare. Denna kod använder svenska **Express-konton**, Stripe-hostad onboarding och separata debiteringar/överföringar. Välj inställningar som stöder det flödet; gränssnittets exakta frågor kan variera.
4. Börja med Sverige och SEK. Be Stripe bekräfta att ert företag och era kategorier av uppdrag kan använda modellen innan ni aktiverar riktiga pengar.

Ni behöver inte skapa en Stripe-produkt eller ett abonnemang. Varje uppdrags pris blir en egen Checkout-rad från databasen.

## 2. Hitta nycklarna – dela dem aldrig i chatten

Under Developers/Workbench/API keys finns testmiljöns **secret key**, vanligtvis `sk_test_…`. Den får bara finnas på servern. Hosted Checkout behöver ingen publishable Stripe-nyckel i webbläsaren.

I Supabase-projektets API-inställningar behöver servern även service-role-nyckeln. Den kringgår databasens användarbehörigheter och får aldrig skickas till webbläsaren. Använd samma Supabase-projekt som appens befintliga URL och publika nyckel.

Kopiera variabelnamnen från `.env.stripe.example` till `.env.local` lokalt, eller lägg in dem som hemligheter/variabler hos driftsleverantören:

| Namn | Innehåll |
| --- | --- |
| `APP_URL` | Appens exakta publika ursprung, till exempel `https://din-app.example`. Lokalt: `http://localhost:3000`. |
| `STRIPE_SECRET_KEY` | Hemlig Stripe-testnyckel. |
| `STRIPE_WEBHOOK_SECRET` | Signeringshemligheten för webhook-endpointen, börjar normalt med `whsec_`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase-projektets hemliga servernyckel. |
| `SUPABASE_URL` | Befintlig Supabase-URL, även tillgänglig på servern. |
| `SUPABASE_PUBLISHABLE_KEY` | Befintlig publik Supabase-nyckel, även tillgänglig på servern. |

Använd aldrig `VITE_` framför hemliga nycklar. Ändra inte den spårade `.env`-filen för att lägga in dem. `.env.local` är ignorerad av Git. Starta om servern efter ändringar. Om driftmiljön använder proxyhemligheter måste **webhook-hemligheten vara ett verkligt värde i serverprocessen**, eftersom signaturen verifieras lokalt. En platshållare som bara ersätts i utgående HTTP-anrop fungerar inte där.

## 3. Förbered databasen

Gör först detta i ett separat utvecklings-/testprojekt i Supabase. Säkerhetskopiera innan produktionsändringar.

Appens tidigare SQL-migreringar 0000–0005 måste redan vara applicerade. Kör därefter innehållet i `drizzle/migrations/0006_stripe_payments.sql` **en gång i Supabase SQL Editor som databasägare**. Den nya filen är inte registrerad i Drizzles genererade migrationsjournal; använd inte `drizzle-kit push` eller anta att `drizzle-kit migrate` kör den automatiskt.

Migreringen skapar privata tabeller för Stripe-konton och betalningar, en serverfunktion för överföringar och en databas-trigger som kräver betalning före färdigmarkering och överföring före avslut. Ingen vanlig användare får läsa eller skriva betalningstabellerna direkt.

Historiskt slutförda jobb konverteras inte till Stripe-betalningar. Befintliga accepterade jobb utan betalning kommer att behöva betalas innan de kan gå vidare. Tidigare SQL-statusprover förutsätter inte de nya betalningskraven och måste anpassas med Stripe-konto och betalningsfixturer innan de kan användas med migration 0006.

## 4. Lägg till webhooken

En **webhook** är ett automatiskt meddelande från Stripe till Helpy, exempelvis när ett köp lyckas. Att kunden återvänder till appen bevisar aldrig att betalningen lyckats.

Publicera kodens serverdel på en HTTPS-adress. I Stripe-testmiljöns Workbench/Webhooks skapar du en endpoint för plattformens konto:

`https://din-app.example/api/stripe/webhook`

Prenumerera på:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`

Använd webhookens signing secret som `STRIPE_WEBHOOK_SECRET` i samma testmiljö. Stripe-endpointen måste kunna nås utifrån, utan ett inloggningsskydd framför den. Helpy verifierar Stripes signatur på den oförändrade request-kroppen och avvisar felaktiga/äldre signaturer. Vanliga betalnings-API:er kräver däremot inloggning och rätt appursprung.

Lokalt kan du använda den officiella Stripe CLI efter installation och `stripe login`:

```sh
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

CLI:n visar en separat `whsec_…` som bara gäller den lyssnaren. Använd den lokalt, inte Dashboard-endpointens hemlighet. Kör appen med `npm run dev -- --host 0.0.0.0 --port 3000` i repots katalog. Kontrollera att appen öppnas från det ursprung som `APP_URL` anger.

## 5. Gör ett fullständigt test utan riktiga pengar

1. Skapa två vanliga Helpy-testkonton: en beställare och en hjälpare. Använd separata webbläsarprofiler så de har separata sessioner.
2. Som hjälpare: öppna **Profil → Anslut / uppdatera utbetalningskonto**. Slutför Stripes test-onboarding med Stripes rekommenderade testuppgifter. Inga riktiga bankuppgifter behövs för test. Kontot måste få aktiva transfers och tillåtna payouts.
3. Som beställare: skapa ett nytt uppdrag på **500 kr**.
4. Som hjälpare: acceptera uppdraget. **Börja inte jobba innan Aktivitet visar Betalt.**
5. Som beställare: öppna Aktivitet och välj **Betala 500 kr med kort**.
6. På Stripes testbetalningssida: använd `4242 4242 4242 4242`, ett framtida utgångsdatum och valfri tresiffrig CVC. Använd endast i testmiljön. Prova även Stripes dokumenterade testkort för nekad betalning och 3D Secure.
7. Kontrollera i Stripe att betalningen är 500 SEK och i Helpy att betalningsstatus blivit Betalt. Om kunden stänger sidan efter betalningen ska webhooken ändå registrera den. Statuskontrollen kan också återställa saknad bekräftelse genom att hämta sessionen direkt från Stripe.
8. Som hjälpare: välj **Jag är klar**.
9. Som beställare: välj **Godkänn och avsluta**. Kontrollera att en överföring på **425 SEK** finns till rätt Connect-konto. Slutfört jobb betyder inte att bankutbetalningen redan hunnit ske.
10. Upprepa godkännandeförfrågan och simulera nätverksavbrott. Det ska inte skapas ytterligare överföringar. Kontrollera även att kunden inte kan acceptera eget jobb, att hjälparen inte kan betala/godkänna åt kunden och att obetalda jobb inte kan färdigmarkeras direkt via Supabase-API:t.
11. Återbetala en testbetalning och kontrollera webhookens leveranser. Betalningen ska spärras från framtida överföring. Återbetalning av en redan överförd betalning kräver separat hantering av överföringen.

Automatiska tester för betalningslogiken körs med Node 24:

```sh
node --test tests/stripe.test.mjs
```

Testerna simulerar nätverkssvar. De ersätter inte testet mot Stripe eller ett fullständigt applikationsbygge. Databasreglerna har även verifierats i en isolerad PGlite/PostgreSQL-instans med förenklad Supabase-auth. `tests/stripe-payment-rules.sql` kan köras som ägare i en separat Supabase-testdatabas efter migreringarna, med `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/stripe-payment-rules.sql`. Alla fixturer rullas tillbaka; fel förväntningar stoppar körningen. Riktig Supabase-verifiering återstår.

## 6. Fel, avbrott och återbetalningar

Checkout-sessioner återanvänds vid dubbelklick. Om en session löpt ut stoppas nya försök tills en administratör har kontrollerat att det gamla försöket verkligen är obetalt och inte kan användas. Om servern aldrig lyckades spara sessionens ID och mer än 23 timmar gått, stoppas även det försöket för manuell avstämning. Skapa aldrig ett nytt försök genom att blint tömma betalningsraden.

Överföringen använder ett stabilt idempotens-ID och sparas innan jobbet markeras slutfört. Om Stripe hinner svara men databasskrivningen misslyckas kan samma åtgärd upprepas inom 23 timmar från överföringsstart. Därefter krävs manuell avstämning mot Stripe eftersom deras idempotenshistorik inte kan antas finnas för alltid. Kontrollera befintliga överföringar, belopp, destination och jobbreferens innan ni åtgärdar databasen. Använd aldrig ett nytt idempotens-ID bara för att komma förbi ett fel.

Vid återbetalning: spärra betalningen före andra administrativa åtgärder, och stäm av eventuell redan skapad överföring. Separata charges/transfers betyder att en refund **inte automatiskt tar tillbaka hjälparens överföring**. En transfer reversal kan behövas. Stoppa samtidiga godkännanden under hanteringen. Tvister kräver samma typ av manuell avstämning; webhooken spärrar men löser inte tvisten åt er.

Det finns ännu ingen administrationsvy för återbetalningar, avbokningar, tvister eller avstämning. Betalda jobb som aldrig slutförs måste hanteras av support. Ingen automatisk återbetalning eller automatisk överföring sker vid tidsgräns. Lägg inte riktiga kunder på detta förrän den rutinen är bestämd och provad.

## 7. Innan riktiga betalningar

Slutför Stripes företagsverifiering och Connect-inställningar. Kontrollera aktuella villkor och priser direkt hos Stripe. Bestäm hur avbokningar, reklamationer, negativa saldon, moms och hjälparnas skatteuppgifter hanteras. Plattformen bär betalningsansvar i den valda modellen.

Testa en publicerad server med rätt nycklar, migration, webhookleveranser och nätverksåtkomst innan live. Publik webhookåtkomst och utgående åtkomst är separata krav. Servern behöver `api.stripe.com` och Supabase; kundens webbläsare behöver Stripes Checkout/Connect-sidor. Ett miljöutkast gör inte automatiskt en Lovable-driftsmiljö konfigurerad.

Live använder separata live-nycklar, en separat live-webhook med egen signing secret och ny onboarding av hjälpare i live. Blanda inte test- och live-konton eller databaser. De testkonton och betalningar ni skapat blir inte riktiga konton eller betalningar.

### Läs vidare hos Stripe

- Checkout: https://docs.stripe.com/payments/checkout
- Connect Express: https://docs.stripe.com/connect/express-accounts
- Separata debiteringar och överföringar: https://docs.stripe.com/connect/separate-charges-and-transfers
- Webhooks: https://docs.stripe.com/webhooks
- Testkort: https://docs.stripe.com/testing

Implementationen använder Stripes HTTPS-API direkt med API-version `2024-06-20`, utan att lägga till ett SDK-beroende. Kontrollera webhookens version/payload och API-kompatibilitet i er testmiljö. Stripes aktuella dokumentation kunde inte hämtas från denna utvecklingsmiljö på grund av nätverkets HTTP 403; verklig API-verifiering återstår.

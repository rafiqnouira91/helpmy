# Helpmy

Build a beautiful, modern, mobile-first marketplace app where people can post small jobs, errands, urgent requests and services that other nearby users can accept for payment.

The core concept is:

"Behöver du hjälp? Lägg ut ett uppdrag."

Examples:

"Jag har fått slut på bensin. Kan någon komma med 10 liter? 500 kr."

"Kan någon handla på Coop åt mig? 200 kr för ärendet."

"Behöver hjälp att bära en soffa. 400 kr."

"Kan någon hämta mitt paket? 150 kr."

"Behöver hjälp att montera en TV. 500 kr."

The product should feel trustworthy, extremely simple and fast. The user should understand what the app does within 3 seconds.

BRAND / VISUAL STYLE

Create a premium but friendly Scandinavian design.

Style:

Minimalistic

Clean

Modern

Soft rounded corners

Lots of whitespace

Subtle shadows

Clear typography

Large touch targets

Mobile-first

Feels like a serious startup, not a cheap gig app

Use a warm off-white / very light background.
Use one strong accent color throughout the interface.
Keep the UI mostly white with subtle gray borders.

Typography should be modern and highly readable.

Avoid:

Too many colors

Complex menus

Corporate-looking dashboards

Excessive gradients

Clutter

Tiny text

The interface should feel effortless.

APP NAVIGATION

Bottom navigation with 4 items:

Home
Explore
Activity
Profile

Use simple line icons.

HOME SCREEN

At the top:

"Vad behöver du hjälp med?"

Underneath, a large rounded search/input card:

"Beskriv vad du behöver..."

with a microphone icon and subtle AI sparkle icon.

Below:

"Populärt just nu"

Display horizontal category chips:

🚗 Transport
🛒 Ärenden
🏠 Hem
📦 Hämtning
🔧 Småjobb
🐕 Djur
⚡ Akut

Then a prominent CTA:

"+ Lägg ut ett uppdrag"

Below:

"Uppdrag nära dig"

Show attractive cards.

Example:

🚗 AKUT

"Behöver bensin"

"10 liter bensin till E4"

500 kr

📍 3,2 km bort · Nu

[ Hjälp till ]

🛒 ÄRENDE

"Handla på Coop"

"Mjölk, ägg, kaffe och blöjor"

200 kr

📍 1,8 km bort · Idag

[ Hjälp till ]

📦 HÄMTNING

"Hämta mitt paket"

"PostNord, Sollentuna"

150 kr

📍 2,4 km bort · Senast 18:00

[ Hjälp till ]

Cards should be compact, beautiful and easy to scan.

CREATE JOB FLOW

When the user presses "+ Lägg ut ett uppdrag", open a very simple multi-step flow.

STEP 1:

"Vad behöver du hjälp med?"

Large text field:

"Exempel: Kan någon hämta mitt paket?"

Allow free-form text.

Button:

"Fortsätt"

Use AI to automatically understand the request and suggest a category.

For example:

User writes:
"Jag sitter fast med tom tank på E4:an"

AI generates:

⚡ Akut hjälp
"Leverans av bensin"

STEP 2:

"Vad vill du betala?"

Large price field:

500 kr

Underneath:

"Du betalar endast när uppdraget är slutfört."

Show suggested price:

"Liknande uppdrag brukar ligga runt 400–600 kr"

Allow user to edit.

STEP 3:

"När behöver du hjälp?"

Options:

Nu
Idag
Imorgon
Välj tid

STEP 4:

"Var?"

Show map/location card.

"📍 Din plats"

Allow user to adjust the location.

STEP 5:

Preview:

"Så här ser ditt uppdrag ut"

Large card:

⚡ AKUT

"Behöver bensin"

"Jag sitter fast på E4:an och behöver 10 liter bensin."

500 kr

📍 Stockholm

Nu

Then:

"Publicera uppdrag"

JOB DETAIL SCREEN

When a user opens a job:

Large category icon.

"Behöver bensin"

⚡ Akut

500 kr

"Jag sitter fast på E4:an och behöver 10 liter bensin. Kan någon hjälpa mig?"

Map preview.

"3,2 km från dig"

"Publicerad för 4 min sedan"

Requester profile:

[Profile photo]

"Ahmed"

⭐ 4.9

127 genomförda uppdrag

"Verifierad med BankID"

Large bottom CTA:

"Jag kan hjälpa"

When pressed, show confirmation:

"Vill du ta detta uppdrag?"

"You receive 425 kr"

"Platform fee: 75 kr"

"Total customer payment: 500 kr"

[ Acceptera uppdrag ]

TRUST / PROFILE

Profiles should strongly emphasize trust.

Profile:

Profile photo

"Ahmed"

⭐ 4.9

127 uppdrag

"Verifierad"

Badges:

✓ BankID-verifierad
✓ Telefonnummer verifierat
✓ Betalningshistorik

Show:

"Genomförda uppdrag"

with reviews.

Reviews should be simple:

⭐️⭐️⭐️⭐️⭐️

"Superbra och snabb hjälp!"

ACTIVITY

Create an Activity screen with two tabs:

"Jag behöver hjälp"

"Jag hjälper"

Show active and completed jobs.

Example:

AKTIVT

"Behöver bensin"

500 kr

"Väntar på hjälpare"

SLUTFÖRT

"Hämtade paket"

250 kr

✓ Slutfört

EXPLORE

Explore should feel like a local marketplace.

Top:

"Uppdrag nära dig"

Map/list toggle.

Filters:

Avstånd
Pris
Kategori
Tid

Cards show:

Category
Title
Price
Distance
Time

Example:

🚗 Transport
"Flytta två kartonger"
350 kr
1,4 km

IMPORTANT FEATURE: "PÅ VÄGEN"

Create a special feature called:

"På vägen"

This lets users say where they are going.

Example:

"Stockholm → Uppsala"

The app shows small jobs that are along or near their route:

📦 Hämta paket
+100 kr

🛒 Handla på ICA
+75 kr

📄 Lämna dokument
+150 kr

This should feel like a powerful differentiating feature.

Add a CTA:

"Jag är på väg någonstans"

PAYMENTS

Design a clean payment confirmation screen.

Customer:

500 kr

Platform fee:

75 kr

Helper receives:

425 kr

Show:

"Betalningen reserveras tills uppdraget är slutfört."

Use clear trust messaging.

NOTIFICATIONS

Examples:

"🎉 Någon vill hjälpa dig!"

"Ahmed har accepterat ditt uppdrag."

"📍 Ahmed är på väg."

"✓ Uppdraget är klart."

"💰 425 kr har betalats ut."

AI FEATURES

Use AI subtly throughout the product.

When a user writes a messy request, automatically structure it.

Example:

User:

"tja jag sitter på e4an typ vid sollentuna och bilen dog behöver bensin snabbt"

AI converts it into:

⚡ AKUT

"Leverans av bensin"

"10 liter bensin"

"Behöver hjälp snarast"

Suggested price:

500 kr

Do not make AI feel complicated. It should happen automatically.

EMPTY STATES

Create friendly empty states.

Example:

"Det finns inga uppdrag nära dig just nu."

"Var först med att lägga ut ett."

[ + Lägg ut uppdrag ]

MICROINTERACTIONS

Add subtle animations:

Cards gently animate on tap

Buttons have small press feedback

Successful job completion has a satisfying check animation

Payment confirmation has subtle success animation

New nearby jobs can appear with a soft animation

Keep animations fast and professional.

RESPONSIVE DESIGN

The primary experience is mobile.

Desktop should look like a polished web app with:

Left sidebar navigation
Main content area
Right-side map / nearby jobs panel

But do not make desktop feel like an admin dashboard.

DESIGN PRINCIPLE

The most important thing:

The app must make this interaction incredibly easy:

I need something.

I write what I need.

I choose a price.

Someone nearby accepts.

The job gets done.

Payment happens automatically.

Everything else is secondary.

Do not overload the first version with unnecessary features.

Create a polished clickable prototype with realistic Swedish content and realistic user profiles.

Use Swedish throughout the interface.
Use SEK (kr).
Use Stockholm as the example market.

The overall feeling should be:

"Vad behöver du hjälp med? Någon i närheten kan fixa det."

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://helpmy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/df9622e6-24e0-4905-9b54-0ba85939f28d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

# StormShield

**Extreme weather alert and emergency response platform.** StormShield predicts severe weather, works out who is in harm's way from their home, work and GPS locations, classifies the danger, sends alerts automatically in the person's own language, and tracks who is safe and who needs help.

Built for the FNB App of the Year Hackathon 2026, *Climate resilience and essential services* (focus area: local alerts). The showcase scenario is a **flood in Durban (eThekwini)**.

## Try it

Every account also has a one-tap button on the login page.

| Account | Role | Sign in |
| --- | --- | --- |
| Selemani Ecasa | Admin, disaster management | username `selemani`, password `1234` |
| Ayanda Sibanda | Admin, disaster management | username `ayanda`, password `1234` |
| Naledi Khumalo | Insurer staff, ShieldSure Insurance (fictional demo insurer) | `claims@shieldsure.demo`, password `1234` |
| Thandi Mkhize | Resident, Umlazi, isiZulu, insured | `thandi@stormshield.demo`, password `Demo@2026` |
| Pieter van der Merwe | Resident, Amanzimtoti, Afrikaans, elderly, insured | `pieter@stormshield.demo`, password `Demo@2026` |
| Gogo Nomvula Mkhize | Basic phone only (no app), Umlazi, isiZulu, elderly, Thandi's mother | open **/phone** (no sign-in) |

Staff accounts are created by the demo seed; public registration only creates residents.

A demo walk-through that shows everything in about 3 minutes:

1. Open `/` without signing in. Search "Umlazi" or tap an area. Switch between **Now / +3 h / +6 h / +12 h**.
2. Open **Full map** and press **Play** to watch the flood spread, rivers rise, roads close and shelters get cut off over 12 hours.
3. Sign in as **Thandi**. Her home is in an extreme-risk zone: alerts are in isiZulu with English underneath. Press **I am safe**, then **EMERGENCY → Rescue required**.
4. In Family safety, press **Ask to check in** on Gogo Nomvula, then **Open their check-in link** and reply as her. Her status turns green on Thandi's dashboard.
5. Sign in as **Selemani** (admin). On **Call outreach** watch the live call board: demo residents answer or miss calls on their own, and people who miss 3 calls move to **Unreached**. Open **People**, pick Thandi and press **Call**: her screen rings. Press **Send help** to dispatch a unit; her dashboard shows the unit and ETA.
6. On **Dispatch**, send the suggested unit for a waiting request. **Reports** lists every incident with source and location, and exports CSV. **Situation report** prints a one-page summary.
7. Open **Feature phone** (`/phone`). Gogo Nomvula's basic phone is loaded. Dial `*120*7867#`, press 9 for English, then **1 I am safe** or **2 I need help**. Press **ask StormShield to call this phone**, answer, press 1–4 and answer the follow-up questions. Open the inbox: every SMS ends with the emergency numbers. As Selemani, **Feature phones** shows each session live with the full transcript, and Thandi's Family tab updates.
8. Sign in as **Naledi** (insurer). See exposure, launch **pre-loss calls** to policyholders at risk, and work the **claims queue**: each claim is checked against the flood model.

## Features

- **Landing page**: interactive city map, current risk, weather overview, active alerts, address search and "use my location".
- **Map** (Leaflet + OpenStreetMap/Esri): green, yellow, orange and red danger zones, flood extent simulation (shallow and deep water), animated flood progression paths, water level gauges, storm cell and track, evacuation corridors, road closures, shelters, hospitals, police, fire stations, community halls and community reports. Dark, street and satellite base maps.
- **Fullscreen map** with a 12-hour forecast timeline (play, scrub) and a full legend.
- **Registration** in 4 steps: details, locations (search, tap the map or GPS, with instant risk feedback), safety profile (11 languages with a live alert preview, emergency contact, vulnerability, medical), review with POPIA consent.
- **Role-based auth**: residents and admins; bcrypt passwords; signed httpOnly session cookie.
- **Resident dashboard**: simplified to the essentials (risk, check-in, emergency button, live help tracker) with tabs for Overview, Family, Shelters & help, Insurance and Calls & messages; pop-up notifications for dispatches and updates; incoming-call phone simulator; missed-call banner. Includes: risk card with gauge, 12 h forecast and score breakdown; mini map; panic button (GPS, time stamp, user details, emergency contact SMS, ticket tracker); safety check-in; weather impact with flood depth against a person and car and a tickable action checklist; alerts in preferred language + English; family safety with one-tap check-in links for people without the app; shelter locator with distance, drive/walk time, and closed shelters flagged; community hazard reports; full message log.
- **Command centre** (admins): overview with KPIs, live map of residents, help requests and response units; help queue with dispatch; unreached queue; areas; broadcast; shelter capacity forecast; drill controls. Plus **Call outreach**, **Dispatch** (17 units: EMS, fire, swift-water, SAPS, evacuation buses, DM teams, helicopter; nearest unit and ETA; resident sees the unit approaching), **Reports** (every incident with source, reporter, area and coordinates; filters; verify/dismiss reports; CSV export; staff action log), **People** (search, filters, full profile with timeline; call, send help, SMS) and a printable **Situation report**. Pop-up notifications for new help requests, keypad 3/4 and unreached people.
- **Insurer portal**: see above.
- **Automatic alerting**: when an area's level rises (or a road closes) an alert is created and delivered to every resident whose home or work is there, by push, SMS (orange+) and voice call (red). When it falls, an "easing" alert goes out.

## Call outreach

When an area turns **red**, everyone registered there (home or work) is called; when it turns **orange**, vulnerable people are called. Staff and insurers can also launch calls.

1. SMS in the person's language, then call 1.
2. No answer: SMS reminder, call 2 (5 min later in production; 30 s in the demo).
3. Call 3 (10 min later; 60 s in the demo).
4. Still no answer: the emergency contact and SOS family members get an SMS and a call; the person goes to the admin **Unreached** queue; vulnerable people get an automatic welfare-check request.

Keypad options: **1** safe/prepared · **2** preparing or evacuating (gets SMS with nearest open shelter; recorded as "protected" for insured customers) · **3** needs help to evacuate (transport request) · **4** in danger now (urgent rescue request) · **5** repeat in English. Checking in on the app also stops the calls.

Calls are simulated: residents' screens ring with a phone simulator, and demo residents answer automatically. A real voice provider (e.g. Africa's Talking) with native-speaker recorded prompts would replace the simulator.

## Feature phones (USSD, SMS, voice)

For people without a smartphone or data. Everything works on the cheapest handset.

- **On-screen feature phone** (`/phone`): LCD handset with keypad, soft keys, ringtone and SMS inbox. Pick a SIM card: Gogo Nomvula (basic phone, isiZulu), Thandi or Pieter, or a new unregistered number.
- **USSD `*120*7867#`** (`/api/ussd`, Africa's Talking request/response format). Registered menu, with the area's live risk in the header and isiZulu/English toggle (9):
  1 I am safe (home / shelter / family / on the way) · 2 I need help (type → number of people → vulnerable person? → at home or typed landmark) · 3 Flood risk · 4 Nearest open shelter (+ SMS directions) · 5 Report a hazard · 6 Family status, ask them to check in or tell them you're safe · 7 Call me back · 8 Emergency numbers.
  Unregistered numbers can register in 5 screens (name, area, language, vulnerability, POPIA consent), check an area's risk, or ask for help.
- **Voice call keypad with follow-up questions**: after pressing 1–4 the caller is asked one or two short questions (where are you; do you have transport; how many people; anyone vulnerable; what is happening). Answers update the help request (type, people, priority).
- **What admins get** (`/admin/phones`): live feed of every session, outcome, the structured answers, the help request with Dispatch / Call back, the person's profile and family, a map of where it came from, and the full transcript (every screen shown and every key pressed, with timings). Pop-up notifications for new USSD outcomes. USSD check-ins and help requests also appear in the help queue, People, Reports, the family's app and the outreach board (calls stop once someone answers by USSD).
- **Emergency numbers on every SMS**: `EMERGENCY: Emergency 112 | Ambulance 10177 | Police 10111 | eThekwini Disaster/Fire 031 361 0000. No data? Dial *120*7867#`.
- **Going live**: point an aggregator's USSD callback at `/api/ussd` and set `USSD_SHARED_SECRET` (sent as `x-ussd-secret`). Without it only demo numbers are accepted. Set `PHONE_SIMULATOR=off` to disable the demo phone. USSD carries no GPS, so location comes from the registered address or a typed landmark.

## Insurer portal

Insurers see only customers who opted in at registration. The portal shows exposure (policyholders and sum insured in high-risk areas), who was warned and responded, who protected their car and valuables, an estimate of losses avoided, pre-loss call campaigns, and a claims queue. Each claim is automatically compared with the flood model at that address (inside the flood extent? area level? modelled depth vs reported depth?) and flagged "matches flood data" or "needs review".

## How the "intelligence" works

- **Risk engine** (`lib/engine.ts`, `lib/live.ts`): scores each area 0–100 from rainfall (last 18 h + next 6 h), short bursts, soil saturation, river flow (GloFAS discharge vs median), low-lying terrain, storms, and **community reports**. Levels: green < 25, yellow 25–49, orange 50–74, red ≥ 75. It forecasts 12 hours ahead and predicts when high/extreme risk arrives, the peak, how long it lasts, and the likely water depth.
- **Flood model**: river stages travel downstream with a lag; the flood extent is a variable-width ribbon along each river. Shelters inside it are marked closed.
- **Need-help prediction** (`lib/insights.ts`): a logistic score from flood level and depth at the person's location, vulnerability, medical needs and time silent since the alert. It ranks the admin call list.
- **Shelter demand**: estimates affected population per area and spreads predicted arrivals over the 3 nearest open shelters, flagging overflow.

## Modes

- **Drill** (default): a simulated KZN cut-off low. Everything is labelled SIMULATED. Admins control the clock.
- **Live**: real Open-Meteo forecasts and GloFAS river flow for every area, refreshed every 10 minutes. If the service can't be reached the app shows **NO LIVE DATA**, never "safe".

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No database setup needed: an embedded Postgres (PGlite) is created in `.data/` and seeded on first request. Delete `.data/` to reset the demo.

## Deploy (free)

1. Push to GitHub.
2. Create a free Postgres database on [Neon](https://neon.tech) and copy the connection string.
3. Import the repo in [Vercel](https://vercel.com). Set environment variables:
   - `DATABASE_URL` = Neon connection string
   - `AUTH_SECRET` = a long random string (`openssl rand -base64 32`)
   - `GEOCODER_CONTACT` = your email (sent to OpenStreetMap Nominatim)
4. Deploy. Tables and demo data are created on the first request.

Without `DATABASE_URL`, Vercel falls back to PGlite in `/tmp`, which resets when the function goes cold. Use Neon for judging.

## Tech

Next.js 16.4 (App Router, route handlers), React 19.3, Tailwind CSS 4, TypeScript. Leaflet / react-leaflet. Postgres (Neon) or PGlite. jose (JWT), bcryptjs. Open-Meteo forecast + flood APIs, OpenStreetMap Nominatim geocoding. All free.

```
app/            pages (/, /map, /phone, /login, /register, /dashboard, /profile, /admin, /c/[token]) and API routes
components/     map, dashboard panels, forms, UI
lib/engine.ts   risk engine + drill scenario      lib/live.ts      Open-Meteo live mode
lib/alerts.ts   automatic alerting + delivery     lib/i18n.ts      11-language alert text
lib/geo.ts      zones, rivers, facilities, routes lib/insights.ts  need-help + shelter predictions
lib/schema.ts   tables + demo seed                lib/db.ts        Neon / PGlite
lib/ussd.ts     USSD menus + actions              lib/ivr.ts       voice keypad follow-ups
lib/phone.ts    feature-phone helpers, session log lib/emergency.ts SMS emergency footer
tests/          ussd_smoke.py (end-to-end test of the feature-phone channels)
```

## Known limits

- USSD menus are in English and isiZulu (draft); other languages fall back to English. Alerts and calls stay in all 11 languages.
- SMS, voice calls and push are **simulated** (recorded in each user's Message log). Africa's Talking or Clickatell can be plugged into `deliverAlert`.
- isiZulu, isiXhosa, Afrikaans, Sesotho, Setswana, Xitsonga, Tshivenda, Sepedi, siSwati and isiNdebele text are **draft translations** awaiting native-speaker review.
- Facility locations, road closures and population figures are approximate demo data.
- Risk thresholds should be tuned with eThekwini disaster management officers.
- StormShield supports, but does not replace, official SAWS warnings.

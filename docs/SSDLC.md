# StormShield: Secure Software Development Life Cycle

## 1. Requirements and threat model

StormShield holds sensitive personal information (home and work locations, phone numbers, medical conditions, vulnerability status) and is used during emergencies, when availability and trust matter most.

| Threat | Impact | Mitigation |
| --- | --- | --- |
| Account takeover | Attacker sees a person's home and medical details | bcrypt password hashing (cost 10), 8+ character passwords with letters and numbers, login rate limit (12/min/IP), generic login error |
| Session theft | Impersonation | HS256-signed JWT in an `httpOnly`, `SameSite=Lax` cookie, `Secure` on HTTPS, 7-day expiry, account existence re-checked every request |
| Privilege escalation | Resident sends city-wide alerts | Role read from the database on every request; all `/api/admin/*` routes call `requireAdmin()`; ticket status changes by residents limited to closing their own |
| Insecure direct object references | Reading or editing someone else's family list or tickets | Every family/ticket query is scoped to the session user ID |
| Fake panic flooding | Responders overwhelmed | Panic and check-in rate limits per IP; tickets deduplicated for check-in "need help" |
| SQL injection | Data loss or leakage | Parameterised queries everywhere; the only dynamic SQL fragments are built from server-side whitelists |
| XSS | Session or data theft | React escapes output; no `dangerouslySetInnerHTML` with user data; map popups render user text as React text nodes |
| Clickjacking / sniffing | UI redress | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, geolocation-only permissions policy |
| Check-in link guessing | False "safe" status | 128-bit random tokens (`crypto.randomUUID`), format-validated, rate-limited |
| False reassurance | People stay in danger | If live data is unavailable the app shows "NO LIVE DATA", never "SAFE"; drills are labelled SIMULATED everywhere |

## 2. Privacy by design (POPIA)

- Explicit consent at registration, explaining exactly how locations and safety data are used.
- Data minimisation: medical and vulnerability fields are optional; GPS is shared only when the user chooses, and expires from risk calculations after 12 hours.
- Purpose limitation: medical and vulnerability details are only visible to admins (responders), never to family members.
- Right of access: "Download my data" on the profile page.
- Right to erasure: "Delete my account" (password-confirmed) cascades to locations, family circle, check-ins, tickets and messages; community reports are kept anonymously.
- Family members without accounts are only stored as name, relationship and phone, added by the user.

## 3. Secure design and implementation

- All input is validated and length-limited on the server (`lib/http.ts`), regardless of client validation. Phone numbers are normalised to E.164.
- Errors are mapped to safe messages; stack traces are only logged server-side.
- Secrets come from environment variables (`AUTH_SECRET`, `DATABASE_URL`); `.env` files are git-ignored and `.env.example` documents them.
- External calls (Open-Meteo, Nominatim) have timeouts, caching and failure back-off, so a slow provider cannot take the app down.
- Dependencies are pinned to exact versions; `npm audit` reports 0 vulnerabilities at the time of submission.

### Feature-phone channels (USSD, voice keypad)

- `/api/ussd` trusts a caller's number only when the gateway sends `x-ussd-secret` matching `USSD_SHARED_SECRET` (16+ characters). Without it the endpoint serves only demo residents and the `+2779…` sandbox range, so nobody can check in, ask for help or read messages as a real person by forging `phoneNumber`.
- The on-screen simulator (`/api/phone`) has the same restriction, refuses staff numbers, is rate-limited, and can be switched off with `PHONE_SIMULATOR=off`.
- USSD input is replayed from the root on every request (stateless), validated per screen (menu numbers, 1–20 people, 2–80 character free text) and stored as plain text. Terminal actions run once per session; repeats return the stored final screen.
- Registration by USSD records POPIA consent explicitly; an unregistered help request creates a minimal record under the vital-interest ground.
- Every session (screens, keys, timings, outcome) is kept in `phone_sessions` for audit and is visible only to admins.

## 4. Verification

- TypeScript strict mode, `next build` type checks.
- End-to-end API test script covering registration validation, duplicate accounts, login, panic, check-in, family links, reports, profile changes, admin-only access (403 for residents), wrong passwords (401), invalid tokens (404), ticket assignment, broadcasts and drill control.
- Browser tests of the registration wizard, dashboard and maps at desktop and mobile sizes.

## 5. Deployment and operations

- HTTPS-only hosting on Vercel; managed Postgres on Neon with encryption at rest.
- Rotate `AUTH_SECRET` to invalidate all sessions if a compromise is suspected.
- Next steps before production: shared rate limiter (e.g. Upstash Redis), audit log of admin actions, admin 2FA, verified SMS provider with delivery receipts, and penetration testing.

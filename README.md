# Knee Rehab Tracker

A mobile-first PWA for tracking daily knee pain and training load while recovering from a knee injury, with a daily
**GREEN / AMBER / RED** load guidance status based on your own thresholds.

- **Stack:** Vite + React 19 + TypeScript, Tailwind CSS v4, Recharts, React Router, vite-plugin-pwa, Firebase modular SDK (Auth + Firestore)
- **Hosting:** static SPA on Vercel, talking directly to Firebase (no server)
- **Auth:** Google sign-in (Firebase Auth popup), single user

> Guidance is based on your own thresholds — check them with your physio.

---

## Contents

- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Emulators and tests](#emulators-and-tests)
- [Data model](#data-model)
- [How the guidance works](#how-the-guidance-works)
- [Deploying (Firebase + Vercel)](#deploying-firebase--vercel)
- [Project layout](#project-layout)

---

## Local development

Requirements: Node 20+ (22 recommended), and Java 11+ for the Firebase emulators.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config (see below)
npm run dev                  # http://localhost:5173, uses your real Firebase project
```

To develop fully offline against the emulators (no real project needed):

```bash
npm run emulators            # terminal 1: Auth :9099, Firestore :8080, UI :4000
npm run dev:emulators        # terminal 2: app wired to the emulators
```

In emulator mode the sign-in screen also shows **“Sign in as emulator test user”**, which signs in with a fake Google
credential. That button only appears when `VITE_USE_EMULATORS=true`.

## Environment variables

All Firebase config comes from `VITE_FIREBASE_*` variables. They're embedded in the client bundle at build time. They are public
identifiers, not secrets; access is enforced by `firestore.rules`.

| Variable                            | Required | Notes                                                        |
| ----------------------------------- | -------- | ------------------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`             | yes      | Firebase console → Project settings → Your apps → Web app   |
| `VITE_FIREBASE_AUTH_DOMAIN`         | yes      | usually `<project-id>.firebaseapp.com`                       |
| `VITE_FIREBASE_PROJECT_ID`          | yes      |                                                              |
| `VITE_FIREBASE_STORAGE_BUCKET`      | yes      |                                                              |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes      |                                                              |
| `VITE_FIREBASE_APP_ID`              | yes      |                                                              |
| `VITE_FIREBASE_MEASUREMENT_ID`      | no       | only if you enable Analytics (not used by the app)           |
| `VITE_USE_EMULATORS`                | no       | `true` → connect to local emulators. **Never set in Vercel.** |
| `VITE_EMULATOR_HOST`                | no       | emulator host, default `127.0.0.1`                           |

## Emulators and tests

| Command              | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run lint`       | ESLint (typescript-eslint + react-hooks)                                                       |
| `npm run typecheck`  | `tsc -b`                                                                                       |
| `npm test`           | Vitest unit tests (`src/**/*.test.ts`): load maths, gap-filling, aggregation, every guidance rule, CSV |
| `npm run test:rules` | Starts the Firestore emulator and runs `tests/rules` with `@firebase/rules-unit-testing`       |
| `npm run build`      | Typecheck + production build (incl. service worker + manifest)                                 |
| `npm run test:e2e`   | Starts Auth + Firestore emulators and runs Playwright on an iPhone 13 viewport (`e2e/`)        |
| `npm run test:all`   | All of the above, in order                                                                     |

The emulators use the demo project id `demo-knee-tracker`, so they can never touch a real project. `firebase-tools` is a
dev dependency (no global install needed). The first run downloads the emulator JARs.

Playwright needs a Chromium build. Run `npx playwright install chromium` once, or point it at an existing binary with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium`.

CI (`.github/workflows/ci.yml`) runs the full suite on every pull request.

## Data model

All data lives under `users/{uid}/` and only that user can read or write it (see `firestore.rules`):

| Path                        | Content                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `days/{YYYY-MM-DD}`         | `{ date, pain }`: one overall daily pain score 0–10. Separate from sessions, so rest days can have a score.  |
| `entries/{autoId}`          | One session: `date, activityTypeId, activityName, kind (strength/cardio), durationMin (cardio), distanceKm?, exercises[] (name, sets, reps, loadKg, holdSec?), painDuring?, painNextMorning?, swelling (none/mild/moderate), notes` |
| `settings/main`             | Thresholds and the editable activity-type list                                                               |

The rules validate value ranges: pain 0–10, duration 0–1440 (required for cardio), legacy RPE 1–10 if present, swelling enum, date-id format, and they reject unknown fields.

**Metrics**

There's no effort rating (RPE) to fill in. Load is measured from what you did, as two separate streams that are never added together:

- **Strength load** = tonnage in kg = Σ sets × reps × kg. Heavier work counts for more on its own: a Romanian deadlift at 3 × 8 @ 60 kg (1,440 kg)
  outweighs a light accessory exercise. **Isometric holds** log seconds instead of reps and count *seconds ÷ 3* as reps, so 4 × 45 s @ 20 kg =
  4 × 15 × 20 = 1,200 kg. Bodyweight-only exercises (0 kg) add 0.
- **Cardio load** = minutes × the activity's **knee-load factor**, in *knee-minutes*. The factor says how hard an activity is on the knee
  per minute, relative to cycling (1.0). Defaults: walking 0.5, cycling 1, other 1, running 1.5, sport 1.5, **kitesurfing 2** (built in).
  These are starting points: change them per activity in **Settings → Activity types** (0.1–5), ideally with your physio. Factors are
  applied when the data is read, so changing one re-weights past sessions too and keeps week-to-week comparisons consistent. 3.5 h of
  kitesurfing = 210 min × 2 = 420 knee-min. Distance is recorded but not used for load.
- **Acute load** = 7-day rolling average daily load. **Chronic load** = 28-day rolling average. **ACWR** = acute / chronic. All of these are computed
  per stream.

Entries logged before RPE was removed keep their stored RPE, but it's no longer used.

**Untracked days.** Any calendar day with no daily score and no sessions is filled in at read time as pain 0 / load 0. No placeholder documents are
written. This applies everywhere: history, charts, weekly totals and averages, rolling loads, and the daily CSV (one row per day from your first log to
today). These days are shown as *not logged* (dashed outlines, hollow chart dots, `logged = no` in the CSV) and **never** count as evidence for
progressing.

A day's pain for zones and charts is the daily score. If there's no daily score but a session has a “pain during” value, the highest one is used. A day
counts as a *logged pain day* only if one of those exists. Days with a session but no pain value at all add load, but they don't count toward pain rules
or green streaks.

## How the guidance works

The engine is a set of pure functions in `src/domain/guidance.ts`, with no React or Firestore. It's re-evaluated on every data
change and shown at the top of **Today**. Each rule is reported as *triggered*, *OK*, or *not enough data yet* (open “Show all
rules” on the card).

**Reference day.** “Today” rules look at today if anything has been logged for it. That means a daily score, a session, or
next-morning pain for yesterday's session. Otherwise they look at yesterday. This keeps the card meaningful first thing in the
morning.

### RED: Reduce load (any of)

| Rule | Fires when | Not enough data when |
| --- | --- | --- |
| Pain above threshold | Daily pain, any session “pain during”, or next-morning pain (felt on the reference day) is **> pain threshold** (default 5) | Nothing logged today or yesterday |
| Next-morning jump | Next-morning pain after the previous day's sessions is **≥ 2 points higher** than that day's pain | No next-morning value, or no pain logged that day |
| 3 amber days | The last **3 logged pain days** (gaps skipped) are all amber or worse (pain > green cut-off) | Fewer than 3 logged pain days |
| Moderate swelling | Any session on the reference day reports **moderate** swelling | — |
| ACWR high | Strength **or** cardio ACWR **> upper limit** (default 1.3) | Fewer than 28 days of history (a stream with no load in 28 days is skipped) |

### AMBER: Hold current load (any of, if no RED)

| Rule | Fires when | Not enough data when |
| --- | --- | --- |
| Amber pain today | Reference-day pain is in the amber zone (or worse) | No pain today/yesterday |
| Week-over-week increase | Strength (kg) **or** cardio (knee-min) over the last 7 days vs the 7 days before rises **> max %** (default 10%) | Fewer than 14 days of history, or that stream's previous 7 days had 0 load |
| Rising pain trend | Least-squares slope of pain over the **last 7 logged pain days** (x = actual calendar day) is **> 0** | Fewer than 7 logged pain days |

### GREEN: OK to progress (only if)

1. No RED or AMBER rule fires, **and**
2. the last **N logged pain days** (default 7) were all green. Not-logged days are skipped and **don't count toward N**, **and**
3. ACWR is within the lower and upper limits (0.8–1.3) for every stream you use. A stream with no load in the last 4 weeks is skipped. If there isn't enough data for ACWR yet, the card says so and still allows GREEN.

If the green requirements aren't met (e.g. only 5 of 7 logged green days, or ACWR below the lower limit) the status is AMBER,
and the card explains why.

Thresholds are compared strictly at the boundaries: pain *equal to* the threshold, a load increase of *exactly* 10%, or ACWR of *exactly*
1.3 don't fire.

### Suggested target for the next 7 days

One target per stream you use (e.g. *Strength 6,300–7,200 kg · Cardio 98–112 knee-min*). Base = that stream's load over the last 7 days. If
that's 0, its 28-day weekly average is used instead. Kilos are rounded to the nearest 10.

- **RED:** base × (1 − 30%) … base × (1 − 20%), shown as a range (e.g. `700–800 min`)
- **AMBER:** base (hold)
- **GREEN:** base × (1 + 10%)

All percentages come from Settings.

## Deploying (Firebase + Vercel)

Nothing in this repo deploys automatically. Steps:

### 1. Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create (or open) your project.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Set the support email.
3. **Build → Firestore Database → Create database** (production mode; pick a region close to you).
4. **Project settings → Your apps → Web app (`</>`)**: register an app and copy the config values for the env vars above.

### 2. Deploy the Firestore rules

```bash
npx firebase login
npx firebase use --add          # pick your project; this writes .firebaserc (git-ignored)
npx firebase deploy --only firestore:rules,firestore:indexes
```

Re-run the last command whenever `firestore.rules` changes. You can also paste the file into **Firestore → Rules** in the console.

### 3. Vercel

1. In [Vercel](https://vercel.com/new), import this GitHub repository. The framework preset is detected as **Vite**. `vercel.json`
   sets `npm run build` / `dist` and rewrites all non-file routes to `index.html` for SPA routing.
2. **Settings → Environment Variables:** add each `VITE_FIREBASE_*` variable (Production, and Preview if you use preview
   deployments). Do **not** add `VITE_USE_EMULATORS`.
3. Deploy. Changing env vars requires a redeploy, because Vite inlines them at build time.

### 4. Authorize the Vercel domain in Firebase Auth

Google sign-in only works from authorized domains:

1. Firebase console → **Authentication → Settings → Authorized domains → Add domain**.
2. Add your production domain, e.g. `knee-tracker.vercel.app`, plus any custom domain. Preview deployments get unique
   URLs. Add the ones you need, or test sign-in on production only.

### 5. Install on your phone

Open the site on your phone. **iOS Safari:** Share → *Add to Home Screen*. **Android Chrome:** menu → *Install app*.
Firestore's offline cache means you can log entries without a connection; they sync when you're back online.

## Project layout

```
src/
  domain/        pure logic + unit tests (no React/Firebase)
    dates.ts       local calendar-date helpers (DST-safe)
    load.ts        strength load (tonnage, holds), cardio load (minutes)
    series.ts      gap-filled daily series
    aggregate.ts   weekly summaries, rolling averages, ACWR, streaks, load-vs-next-day-pain
    guidance.ts    rules engine, targets, status timeline
    csv.ts         CSV export
    settings.ts    defaults, zones, validation
  data/repo.ts   Firestore reads/writes
  state/         auth, data (subscriptions + derived series/guidance), toasts
  pages/         Today, History, DayDetail, EntryForm, Stats, Settings, Login
  components/    status card, pain scale, charts, layout
tests/rules/     Firestore security rules tests (emulator)
e2e/             Playwright tests (emulators, iPhone viewport)
firestore.rules, firebase.json, vercel.json
```

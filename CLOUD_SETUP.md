# Cloud version (Flutter + Supabase)

Same queue system, but the server is Supabase in the cloud instead of the office PC.
Every device just needs internet — no shared Wi-Fi/LAN, no IP addresses, no Windows server.

```
flutter_app/   Flutter app: guard, counters, TV display, admin (Android, iOS, web, Windows, macOS)
supabase/
  migrations/  Database + all queue rules (Postgres functions)
  functions/   manage-staff: admin creates staff accounts / resets passwords
  scripts/     create-staff.mjs: creates the first accounts
```

## One-time setup (~15 minutes)

1. **Create a project** at https://supabase.com (free tier is enough for one office).
   Pick the region closest to the office.
2. **Create the database.** Install the CLI (`brew install supabase/tap/supabase`), then:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   (Or paste `supabase/migrations/20261118000000_queue_system.sql` into the dashboard's SQL Editor.)
3. **Staff email domain.** Staff sign in with a username; Supabase needs an email, so
   `guard` becomes `guard@staff.example.com`. No email is ever sent. If you change the
   domain, change it in all three places: `flutter_app/lib/config.dart`,
   `supabase/functions/manage-staff/index.ts`, `supabase/scripts/create-staff.mjs`.
4. **Turn off public sign-ups**: Dashboard → Authentication → Providers → Email →
   disable "Allow new users to sign up". Only the admin creates accounts.
5. **Create the first accounts** (admin, guard, counter1-3 with random passwords):
   ```
   SUPABASE_URL=https://xxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<Dashboard → Project Settings → API → service_role> \
   node supabase/scripts/create-staff.mjs
   ```
   Write down the printed passwords. The service-role key is a master key: never put it in the app.
6. **Deploy the staff function** (lets the admin add accounts / reset passwords in the app):
   ```
   supabase functions deploy manage-staff
   ```
7. **Point the app at your project.** In `flutter_app/`: `cp env.example.json env.json`, fill in
   the project URL and the public key (Project Settings → API).

## Run / build

```
cd flutter_app
flutter run -d chrome --dart-define-from-file=env.json          # try it
flutter build web --release --dart-define-from-file=env.json    # TV + any browser
flutter build apk --release --dart-define-from-file=env.json    # guard phone / counter tablets
flutter build windows --release --dart-define-from-file=env.json
```

Host `build/web` on any static host (Supabase doesn't host sites; Netlify, Cloudflare Pages
or Firebase Hosting are free). Then each device just opens that link.

## Plug and play, per device

- **Open the app → tap what this device is → sign in once.** It reopens on that station after a
  restart and stays signed in.
- **TV:** open the web link, tap *Public display*, tap the screen once (browsers require a tap
  before they allow sound). It keeps the screen awake. Press and hold the screen to exit.
- **Guard phone (Android):** pair the 58mm printer in Bluetooth settings once, tap the printer
  button in the app. It reconnects by itself next time. On web/desktop, tickets use the print dialog.

## What changed vs. the offline version

- **It needs internet.** The original promise was "works with the internet down". This does not.
  Each screen shows a warning banner when it loses connection and catches up when it returns,
  but nobody can issue tickets or call numbers while offline. Decide if the office is OK with that
  (a phone hotspot as a backup connection is a cheap safety net).
- **Backups:** Supabase takes daily backups on paid plans; the free plan does not. The admin
  "Backups" tab was dropped; the History tab's CSV export is the per-day record.
- **Security model:** apps never touch tables directly. Every action is a database function that
  checks the signed-in user's role (guard issues, counter calls, admin manages). A counter
  account can only operate its own counter.
- **Passwords:** random per account at setup, so no more shared default `admin123`.

## Not yet verified (please test)

- Tested: the SQL against a local Postgres (all queue flows, permissions, day rollover), the Flutter
  analyzer, unit tests, and a web build.
- **Not tested against a real Supabase project**: Realtime delivery, the Auth trigger, the
  `manage-staff` function, and the Android/iOS/Windows builds (no Android SDK on the dev Mac).
  Expect to fix small things on first run, especially Bluetooth printing on a real printer.

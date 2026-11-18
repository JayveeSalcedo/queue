#!/usr/bin/env node
// One-time setup: creates the default staff accounts in your Supabase project.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node supabase/scripts/create-staff.mjs
//
// The service-role key is in Supabase Dashboard -> Project Settings -> API.
// Keep it secret: never put it in the Flutter app.
//
// Each account gets a random password, printed once at the end. Accounts that
// already exist are left alone. Needs Node 18+ (no npm install needed).

import { randomBytes } from "node:crypto";

// Must match staffEmailDomain in flutter_app/lib/config.dart
const STAFF_EMAIL_DOMAIN = "staff.example.com";

const ACCOUNTS = [
  { username: "admin", full_name: "System Administrator", role: "ADMIN" },
  { username: "guard", full_name: "Security Guard", role: "GUARD" },
  { username: "counter1", full_name: "Counter 1 Operator", role: "COUNTER", counter_id: 1 },
  { username: "counter2", full_name: "Counter 2 Operator", role: "COUNTER", counter_id: 2 },
  { username: "counter3", full_name: "Counter 3 Operator", role: "COUNTER", counter_id: 3 },
];

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).");
  process.exit(1);
}

// Easy to read aloud and type on a phone: no 0/O or 1/l/I
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newPassword = () =>
  Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("");

const created = [];
for (const account of ACCOUNTS) {
  const password = newPassword();
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${account.username}@${STAFF_EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
      app_metadata: {
        staff_role: account.role,
        username: account.username,
        full_name: account.full_name,
        counter_id: account.counter_id ?? null,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    created.push({ username: account.username, password, role: account.role });
  } else if (/already|registered|exists/i.test(JSON.stringify(body))) {
    console.log(`- ${account.username}: already exists, left unchanged`);
  } else {
    console.error(`! ${account.username}: ${res.status} ${JSON.stringify(body)}`);
    process.exitCode = 1;
  }
}

if (created.length) {
  console.log("\nCreated staff accounts (write these down, they are not shown again):\n");
  console.table(created);
  console.log("Change passwords any time from the app's Admin > Staff tab.");
}

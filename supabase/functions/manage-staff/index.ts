// Admin-only staff account management for the Queue app.
//
// Creating Auth users and setting other people's passwords needs the
// service-role key, which must never ship inside the app. This function
// holds it server-side and only acts for signed-in ADMIN accounts.
//
// Deploy:  supabase functions deploy manage-staff
//
// Body: { action: "create", username, password, full_name, role, counter_id? }
//       { action: "set_password", user_id, password }
//       { action: "delete", user_id }

import { createClient } from "jsr:@supabase/supabase-js@2";

// Must match staffEmailDomain in flutter_app/lib/config.dart
const STAFF_EMAIL_DOMAIN = "staff.example.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Who is calling?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply(401, { error: "Please sign in again." });

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (callerProfile?.role !== "ADMIN") return reply(403, { error: "Only an admin can manage staff accounts." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid JSON body" });
  }

  const password = typeof body.password === "string" ? body.password : "";

  switch (body.action) {
    case "create": {
      const username = String(body.username ?? "").trim().toLowerCase();
      const role = String(body.role ?? "").toUpperCase();
      const fullName = String(body.full_name ?? "").trim() || username;
      const counterId = body.counter_id == null || body.counter_id === "" ? null : Number(body.counter_id);

      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return reply(400, { error: "Username must be 3-32 letters, numbers, dots, dashes or underscores." });
      }
      if (!["ADMIN", "GUARD", "COUNTER"].includes(role)) {
        return reply(400, { error: "Role must be ADMIN, GUARD or COUNTER." });
      }
      if (password.length < 8) return reply(400, { error: "Password must be at least 8 characters." });

      const { data, error } = await admin.auth.admin.createUser({
        email: `${username}@${STAFF_EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        // Read by the on_auth_user_created trigger to create the staff profile
        app_metadata: {
          staff_role: role,
          username,
          full_name: fullName,
          counter_id: role === "COUNTER" ? counterId : null,
        },
      });
      if (error) {
        const taken = /already|registered|exists/i.test(error.message);
        return reply(400, { error: taken ? "That username is already taken." : error.message });
      }
      return reply(200, { id: data.user.id, username, role });
    }

    case "set_password": {
      const userId = String(body.user_id ?? "");
      if (password.length < 8) return reply(400, { error: "Password must be at least 8 characters." });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    case "delete": {
      const userId = String(body.user_id ?? "");
      if (userId === caller.user.id) return reply(400, { error: "You cannot delete your own account." });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    default:
      return reply(400, { error: "Unknown action" });
  }
});

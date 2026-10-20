// Super-admin-only user management for the CMS portal.
//
// The browser can't create auth users (that needs the service-role key), so the
// portal calls this function. It checks the caller is an active super admin
// before doing anything, then uses the service-role client.
//
// Actions (POST JSON): { action: "invite", email, full_name, role }
//                      { action: "set_role", user_id, role }
//                      { action: "set_active", user_id, active }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["super_admin", "admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  // Who is calling?
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who.user) return json({ error: "Not signed in" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin.from("user_roles")
    .select("role, active").eq("user_id", who.user.id).maybeSingle();
  if (!me || !me.active || me.role !== "super_admin") return json({ error: "Super admins only" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
    if (!ROLES.includes(role)) return json({ error: "Unknown role" }, 400);

    const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName }, redirectTo,
    });
    if (error || !data.user) return json({ error: error?.message ?? "Invite failed" }, 400);

    const { error: roleErr } = await admin.from("user_roles").upsert({
      user_id: data.user.id, role, email, full_name: fullName, active: true, created_by: who.user.id,
    });
    if (roleErr) return json({ error: roleErr.message }, 400);
    return json({ ok: true, user_id: data.user.id });
  }

  if (body.action === "set_role") {
    const role = String(body.role ?? "");
    if (!ROLES.includes(role)) return json({ error: "Unknown role" }, 400);
    const { error } = await admin.from("user_roles").update({ role }).eq("user_id", String(body.user_id));
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (body.action === "set_active") {
    const active = body.active === true;
    const id = String(body.user_id);
    const { error } = await admin.from("user_roles").update({ active }).eq("user_id", id);
    if (error) return json({ error: error.message }, 400);
    // Also block / unblock sign-in itself
    await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});

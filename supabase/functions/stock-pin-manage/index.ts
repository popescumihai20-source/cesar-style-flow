import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.45.0/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEAK_PINS = new Set(["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAdmin(employeeId: string, pinLogin: string): Promise<boolean> {
  if (!employeeId || !/^\d{4}$/.test(pinLogin)) return false;
  const { data } = await supabase
    .from("employees")
    .select("role, pin_login, active")
    .eq("id", employeeId)
    .maybeSingle();
  return !!data && data.active && data.role === "admin" && data.pin_login === pinLogin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "verify") {
      const role = body.role === "admin" ? "admin" : "casier";
      const pin = String(body.pin || "");
      if (!/^\d{4}$/.test(pin)) return json({ valid: false }, 400);
      const key = role === "admin" ? "stock_pin_admin" : "stock_pin_casier";
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) return json({ valid: false, error: error.message }, 500);
      return json({ valid: !!data && data.value === pin });
    }

    if (action === "get") {
      const ok = await verifyAdmin(String(body.admin_employee_id || ""), String(body.admin_pin || ""));
      if (!ok) return json({ error: "Neautorizat" }, 403);
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["stock_pin_admin", "stock_pin_casier"]);
      if (error) return json({ error: error.message }, 500);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return json({ pins: map });
    }

    if (action === "set") {
      const ok = await verifyAdmin(String(body.admin_employee_id || ""), String(body.admin_pin || ""));
      if (!ok) return json({ error: "Neautorizat" }, 403);
      const key = body.key === "stock_pin_admin" ? "stock_pin_admin" : body.key === "stock_pin_casier" ? "stock_pin_casier" : null;
      const value = String(body.value || "");
      if (!key) return json({ error: "Cheie invalidă" }, 400);
      if (!/^\d{4}$/.test(value)) return json({ error: "PIN trebuie să fie 4 cifre" }, 400);
      if (WEAK_PINS.has(value)) return json({ error: "PIN prea slab" }, 400);
      const { error } = await supabase
        .from("system_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Acțiune necunoscută" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
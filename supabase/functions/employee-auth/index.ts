import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.45.0/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "quick_login") {
      const role = body.role === "admin" ? "admin" : "casier";
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, employee_card_code, user_id")
        .eq("role", role)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: `Nu există angajat activ cu rolul ${role}` }, 404);
      return json({
        employee: {
          id: data.id,
          name: data.name,
          role: data.role,
          card_code: data.employee_card_code,
          user_id: data.user_id,
        },
      });
    }

    if (action === "lookup_card") {
      const cardCode = String(body.card_code || "").trim();
      if (!/^\d{4,10}$/.test(cardCode)) return json({ error: "Cod card invalid" }, 400);
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, employee_card_code, user_id")
        .eq("employee_card_code", cardCode)
        .eq("active", true)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Card invalid sau inactiv" }, 404);
      return json({
        employee: {
          id: data.id,
          name: data.name,
          role: data.role,
          card_code: data.employee_card_code,
          user_id: data.user_id,
        },
      });
    }

    if (action === "verify_pin") {
      const employeeId = String(body.employee_id || "");
      const pin = String(body.pin || "");
      if (!employeeId || !/^\d{4}$/.test(pin)) return json({ valid: false, error: "Date invalide" }, 400);
      const { data, error } = await supabase
        .from("employees")
        .select("pin_login")
        .eq("id", employeeId)
        .eq("active", true)
        .maybeSingle();
      if (error) return json({ valid: false, error: error.message }, 500);
      return json({ valid: !!data && data.pin_login === pin });
    }

    return json({ error: "Acțiune necunoscută" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
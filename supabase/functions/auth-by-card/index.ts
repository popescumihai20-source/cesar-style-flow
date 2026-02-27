import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { card_code, pin_login } = await req.json();

    if (!card_code || typeof card_code !== "string" || !/^\d{7}$/.test(card_code)) {
      return new Response(
        JSON.stringify({ error: "Cod card invalid — trebuie exact 7 cifre" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pin_login || typeof pin_login !== "string" || !/^\d{4}$/.test(pin_login)) {
      return new Response(
        JSON.stringify({ error: "PIN invalid — trebuie exact 4 cifre" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Configurare server lipsă" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up employee by card code
    const { data: employee, error: empError } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("employee_card_code", card_code.trim())
      .eq("active", true)
      .maybeSingle();

    if (empError) throw empError;

    if (!employee) {
      return new Response(
        JSON.stringify({ error: "Card angajat invalid sau inactiv" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate pin_login
    if (!employee.pin_login || employee.pin_login !== pin_login) {
      return new Response(
        JSON.stringify({ error: "PIN incorect" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = `emp_${card_code.trim()}@cesars.internal`;
    const password = `cesars_pos_${card_code.trim()}_secure`;

    let userId = employee.user_id;

    if (!userId) {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_name: employee.name, employee_id: employee.id },
      });

      if (createError) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u: any) => u.email === email);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          throw createError;
        }
      } else {
        userId = createData.user.id;
      }

      await supabaseAdmin
        .from("employees")
        .update({ user_id: userId })
        .eq("id", employee.id);

      // Assign role based on card prefix
      const defaultRole = card_code.startsWith("9") ? "admin" : "casier";
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: defaultRole }, { onConflict: "user_id,role" });
    }

    // Sign in
    await supabaseAdmin.auth.admin.updateUserById(userId!, { password });

    const signInResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const signInData = await signInResponse.json();

    if (!signInResponse.ok) {
      throw new Error(signInData.error_description || signInData.msg || "Sign in failed");
    }

    // Fetch roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        session: {
          access_token: signInData.access_token,
          refresh_token: signInData.refresh_token,
        },
        employee: { id: employee.id, name: employee.name },
        roles: (roles || []).map((r: any) => r.role),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

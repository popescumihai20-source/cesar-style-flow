import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { card_code } = await req.json();

    if (!card_code || typeof card_code !== "string") {
      return new Response(
        JSON.stringify({ error: "Cod card lipsă" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    let userId = employee.user_id;

    // If employee doesn't have a linked auth user, create one
    if (!userId) {
      const email = `emp_${card_code.trim()}@cesars.internal`;
      const password = crypto.randomUUID(); // random password, not used directly

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_name: employee.name, employee_id: employee.id },
      });

      if (createError) throw createError;

      userId = newUser.user.id;

      // Link user_id to employee
      await supabaseAdmin
        .from("employees")
        .update({ user_id: userId })
        .eq("id", employee.id);

      // Assign casier role by default
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "casier" });
    }

    // Generate session for this user
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: `emp_${card_code.trim()}@cesars.internal`,
      });

    if (sessionError) throw sessionError;

    // Extract the token from the link and use it to create a session
    const token = sessionData?.properties?.hashed_token;

    // Alternative: directly create a session
    // We'll use signInWithPassword approach - update the user's password to a known value temporarily
    const tempPassword = `temp_${crypto.randomUUID()}`;
    await supabaseAdmin.auth.admin.updateUser(userId, { password: tempPassword });

    // Now sign in with the temp password using the anon client
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAnon = createClient(supabaseUrl, anonKey);

    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: `emp_${card_code.trim()}@cesars.internal`,
      password: tempPassword,
    });

    if (signInError) throw signInError;

    // Fetch roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        session: signInData.session,
        employee: { id: employee.id, name: employee.name },
        roles: (roles || []).map((r) => r.role),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

    const email = `emp_${card_code.trim()}@cesars.internal`;
    const password = `cesars_pos_${card_code.trim()}_secure`;

    let userId = employee.user_id;

    if (!userId) {
      // Create auth user for this employee
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_name: employee.name, employee_id: employee.id },
      });

      if (createError) {
        // User might already exist (from a previous attempt)
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

      // Link user_id to employee
      await supabaseAdmin
        .from("employees")
        .update({ user_id: userId })
        .eq("id", employee.id);

      // Assign casier role by default
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "casier" }, { onConflict: "user_id,role" });
      
      if (roleError) {
        console.log("Role assignment note:", roleError.message);
      }
    }

    // Sign in with email/password
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAnon = createClient(supabaseUrl, anonKey);

    let signInResult = await supabaseAnon.auth.signInWithPassword({ email, password });

    // If sign-in fails (password mismatch from old creation), reset password and retry
    if (signInResult.error) {
      // Update user password using admin API
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId!, {
        password,
      });
      if (updateErr) throw updateErr;

      // Retry sign in
      signInResult = await supabaseAnon.auth.signInWithPassword({ email, password });
      if (signInResult.error) throw signInResult.error;
    }

    // Fetch roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        session: signInResult.data.session,
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

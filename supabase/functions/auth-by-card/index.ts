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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing env vars:", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
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
        // User might already exist
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
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "casier" }, { onConflict: "user_id,role" });
    }

    // Sign in - use service role client to sign in on behalf of user
    // First ensure password is set correctly
    await supabaseAdmin.auth.admin.updateUserById(userId!, { password });

    // Create a new anon client for sign-in using the service role key to get anon key
    // Actually, we can use signInWithPassword via admin client workaround:
    // Use a fresh client with the anon key
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    
    if (!anonKey) {
      // Fallback: generate session directly via admin
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      
      if (sessionError) throw sessionError;

      // Use admin to create a session directly
      // Sign in with password using the admin client's underlying fetch
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
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
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

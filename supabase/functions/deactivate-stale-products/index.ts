import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Deactivate products that haven't been received in 6 months
  const { data, error } = await supabase
    .from("products")
    .update({ active: false })
    .eq("active", true)
    .lt("last_received_at", sixMonthsAgo.toISOString())
    .select("id, name, base_id");

  // Also deactivate products that have NEVER been received and were created > 6 months ago
  const { data: neverReceived, error: error2 } = await supabase
    .from("products")
    .update({ active: false })
    .eq("active", true)
    .is("last_received_at", null)
    .lt("created_at", sixMonthsAgo.toISOString())
    .select("id, name, base_id");

  const deactivated = [...(data || []), ...(neverReceived || [])];

  return new Response(
    JSON.stringify({
      success: !error && !error2,
      deactivated_count: deactivated.length,
      deactivated: deactivated.map(p => ({ id: p.id, name: p.name, base_id: p.base_id })),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

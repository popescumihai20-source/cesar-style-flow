import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportLine {
  description: string;
  quantity: number;
  barcode: string;
}

interface ImportRequest {
  lines: ImportLine[];
  location: "depozit" | "magazin"; // depozit -> stock_depozit, magazin -> stock_general
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { lines, location } = (await req.json()) as ImportRequest;

    const errors: { line: number; description: string; barcode: string; reason: string }[] = [];
    const validLines: { description: string; quantity: number; barcode: string; baseId: string; price: number }[] = [];

    // Validate barcodes
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const code = l.barcode.trim();
      if (!/^\d{17}$/.test(code)) {
        errors.push({
          line: i + 1,
          description: l.description,
          barcode: code,
          reason: code.length !== 17
            ? `Lungime invalidă: ${code.length} cifre (trebuie 17)`
            : "Conține caractere non-numerice",
        });
        continue;
      }
      validLines.push({
        description: l.description,
        quantity: l.quantity,
        barcode: code,
        baseId: code.substring(0, 7),
        price: parseInt(code.substring(13, 17), 10),
      });
    }

    // Aggregate by base_id
    const aggregated = new Map<string, { baseId: string; description: string; totalQty: number; price: number }>();
    for (const vl of validLines) {
      const existing = aggregated.get(vl.baseId);
      if (existing) {
        existing.totalQty += vl.quantity;
      } else {
        aggregated.set(vl.baseId, {
          baseId: vl.baseId,
          description: vl.description,
          totalQty: vl.quantity,
          price: vl.price,
        });
      }
    }

    let created = 0;
    let updated = 0;
    const stockField = location === "depozit" ? "stock_depozit" : "stock_general";

    for (const [baseId, item] of aggregated) {
      // Check if product exists
      const { data: existing } = await supabase
        .from("products")
        .select("id, stock_depozit, stock_general")
        .eq("base_id", baseId)
        .maybeSingle();

      if (existing) {
        // Update the relevant stock field
        const updateData: Record<string, any> = {
          [stockField]: item.totalQty,
          active: true,
        };
        await supabase.from("products").update(updateData).eq("id", existing.id);
        updated++;
      } else {
        // Create new product
        const insertData: Record<string, any> = {
          base_id: baseId,
          name: item.description,
          selling_price: item.price,
          cost_price: 0,
          [stockField]: item.totalQty,
          active: true,
        };
        await supabase.from("products").insert(insertData);
        created++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalLines: lines.length,
          validLines: validLines.length,
          invalidLines: errors.length,
          uniqueProducts: aggregated.size,
          created,
          updated,
          location: location === "depozit" ? "Depozit Central" : "Magazin Ferdinand",
        },
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

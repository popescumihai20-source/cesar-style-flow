import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImportLine {
  description: string;
  quantity: number;
  barcode: string;
}

function parseCSV(rawText: string): ImportLine[] {
  const lines = rawText.split(/\r?\n/);
  const results: ImportLine[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/,+$/, "").trim();
    if (!trimmed) continue;

    // Parse CSV handling quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < trimmed.length && trimmed[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());

    if (fields.length < 3) continue;

    const description = fields[0];
    const qtyStr = fields[1];
    const code = fields[2];

    if (!code || !/^\d{17}$/.test(code)) continue;

    const quantity = parseInt(qtyStr, 10);
    if (isNaN(quantity) || quantity <= 0) continue;

    if (/^(Descriere|Column)/i.test(description)) continue;

    results.push({ description, quantity, barcode: code });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing server configuration (SUPABASE_URL or SERVICE_ROLE_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const location: "depozit" | "magazin" = body.location || "depozit";

    let lines: ImportLine[];
    if (body.csvText) {
      lines = parseCSV(body.csvText);
    } else if (body.lines && Array.isArray(body.lines)) {
      lines = body.lines;
    } else {
      lines = [];
    }

    console.log(`Parsed ${lines.length} valid lines for location: ${location}`);

    if (lines.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { totalLines: 0, validLines: 0, invalidLines: 0, uniqueProducts: 0, created: 0, updated: 0, totalQuantity: 0, location: location === "depozit" ? "Depozit Central" : "Magazin Ferdinand" },
          errors: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate by base_id (first 7 digits)
    const aggregated = new Map<string, { baseId: string; description: string; totalQty: number; price: number }>();
    for (const vl of lines) {
      const baseId = vl.barcode.substring(0, 7);
      const price = parseInt(vl.barcode.substring(13, 17), 10);
      const existing = aggregated.get(baseId);
      if (existing) {
        existing.totalQty += vl.quantity;
      } else {
        aggregated.set(baseId, { baseId, description: vl.description, totalQty: vl.quantity, price });
      }
    }

    let created = 0;
    let updated = 0;
    const stockField = location === "depozit" ? "stock_depozit" : "stock_general";
    const totalQuantity = Array.from(aggregated.values()).reduce((s, a) => s + a.totalQty, 0);

    // Fetch existing products in chunks
    const baseIds = Array.from(aggregated.keys());
    const existingMap = new Map<string, string>();

    for (let i = 0; i < baseIds.length; i += 100) {
      const chunk = baseIds.slice(i, i + 100);
      const { data } = await supabase.from("products").select("id, base_id").in("base_id", chunk);
      if (data) {
        for (const p of data) existingMap.set(p.base_id, p.id);
      }
    }

    // Batch insert new products in chunks of 500
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; qty: number }[] = [];

    for (const [baseId, item] of aggregated) {
      const existingId = existingMap.get(baseId);
      if (existingId) {
        toUpdate.push({ id: existingId, qty: item.totalQty });
      } else {
        toInsert.push({
          base_id: baseId,
          name: item.description,
          selling_price: item.price,
          cost_price: 0,
          stock_depozit: stockField === "stock_depozit" ? item.totalQty : 0,
          stock_general: stockField === "stock_general" ? item.totalQty : 0,
          active: true,
        });
      }
    }

    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from("products").insert(chunk);
      if (!error) created += chunk.length;
      else console.error("Insert batch error:", error.message);
    }

    for (const upd of toUpdate) {
      const { error } = await supabase.from("products").update({ [stockField]: upd.qty, active: true }).eq("id", upd.id);
      if (!error) updated++;
    }

    console.log(`Import done: ${created} created, ${updated} updated, total qty: ${totalQuantity}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalLines: lines.length,
          validLines: lines.length,
          invalidLines: 0,
          uniqueProducts: aggregated.size,
          created,
          updated,
          totalQuantity,
          location: location === "depozit" ? "Depozit Central" : "Magazin Ferdinand",
        },
        errors: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

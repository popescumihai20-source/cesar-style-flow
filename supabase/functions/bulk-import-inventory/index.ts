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

// Parse CSV text: extract Column1=description, Column2=quantity, Column3=code
function parseCSV(rawText: string): ImportLine[] {
  const lines = rawText.split(/\r?\n/);
  const results: ImportLine[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse CSV properly handling quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
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

    // We need at least 3 columns
    if (fields.length < 3) continue;

    const description = fields[0];
    const qtyStr = fields[1];
    const code = fields[2];

    // Skip header rows
    if (!code || !/^\d+$/.test(code)) continue;
    if (code.length !== 17) continue;

    const quantity = parseInt(qtyStr, 10);
    if (isNaN(quantity) || quantity <= 0) continue;

    // Skip if description looks like a header
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const location: "depozit" | "magazin" = body.location;
    
    // Support both raw CSV text and pre-parsed lines
    let lines: ImportLine[];
    if (body.csvText) {
      lines = parseCSV(body.csvText);
    } else {
      lines = body.lines || [];
    }

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
    const totalQuantity = Array.from(aggregated.values()).reduce((s, a) => s + a.totalQty, 0);

    // Process in batches - first fetch all existing products
    const baseIds = Array.from(aggregated.keys());
    const existingMap = new Map<string, { id: string }>();
    
    for (let i = 0; i < baseIds.length; i += 100) {
      const chunk = baseIds.slice(i, i + 100);
      const { data } = await supabase
        .from("products")
        .select("id, base_id")
        .in("base_id", chunk);
      if (data) {
        for (const p of data) {
          existingMap.set(p.base_id, { id: p.id });
        }
      }
    }

    // Batch upserts
    const toInsert: Record<string, any>[] = [];
    const toUpdate: { id: string; data: Record<string, any> }[] = [];

    for (const [baseId, item] of aggregated) {
      const existing = existingMap.get(baseId);
      if (existing) {
        toUpdate.push({
          id: existing.id,
          data: { [stockField]: item.totalQty, active: true },
        });
      } else {
        toInsert.push({
          base_id: baseId,
          name: item.description,
          selling_price: item.price,
          cost_price: 0,
          [stockField]: item.totalQty,
          stock_depozit: stockField === "stock_depozit" ? item.totalQty : 0,
          stock_general: stockField === "stock_general" ? item.totalQty : 0,
          active: true,
        });
      }
    }

    // Batch insert in chunks of 500
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from("products").insert(chunk);
      if (!error) created += chunk.length;
      else console.error("Insert error:", error.message);
    }

    // Batch update (one by one since different data per row)
    for (const upd of toUpdate) {
      const { error } = await supabase.from("products").update(upd.data).eq("id", upd.id);
      if (!error) updated++;
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
          totalQuantity,
          location: location === "depozit" ? "Depozit Central" : "Magazin Ferdinand",
        },
        errors: errors.slice(0, 50), // limit error output
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

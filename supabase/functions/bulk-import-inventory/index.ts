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

interface ValidationError {
  line: number;
  description: string;
  barcode: string;
  reason: string;
}

function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  if (tabCount >= semiCount && tabCount >= commaCount) return "\t";
  if (semiCount >= commaCount) return ";";
  return ",";
}

function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return /^(descriere|column|header|nr|#|produs)/i.test(lower);
}

function splitLine(line: string, delimiter: string): string[] {
  // For tab and semicolon, simple split
  if (delimiter === "\t" || delimiter === ";") {
    return line.split(delimiter).map(f => f.trim());
  }
  // CSV with quoted fields
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
  return fields;
}

function parseCSV(rawText: string): { valid: ImportLine[]; errors: ValidationError[] } {
  const valid: ImportLine[] = [];
  const errors: ValidationError[] = [];

  if (!rawText || typeof rawText !== "string") return { valid, errors };

  const rawLines = rawText.split(/\r?\n/);
  if (rawLines.length === 0) return { valid, errors };

  const firstNonEmpty = rawLines.find(l => l.trim().length > 0) || "";
  const delimiter = detectDelimiter(firstNonEmpty);

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/[,;\t]+$/, "").trim();
    if (!raw) continue;
    if (isHeaderLine(raw)) continue;

    const fields = splitLine(raw, delimiter);
    if (fields.length < 3) {
      errors.push({ line: i + 1, description: fields[0] || "", barcode: "", reason: "Mai puțin de 3 coloane" });
      continue;
    }

    const description = fields[0].trim();
    const qtyStr = fields[1].trim();
    const barcode = fields[2].trim();

    if (!description) {
      errors.push({ line: i + 1, description: "", barcode, reason: "Descriere lipsă" });
      continue;
    }

    const quantity = parseInt(qtyStr, 10);
    if (isNaN(quantity) || quantity < 0) {
      errors.push({ line: i + 1, description, barcode, reason: `Cantitate invalidă: "${qtyStr}"` });
      continue;
    }

    if (!/^\d{17}$/.test(barcode)) {
      errors.push({ line: i + 1, description, barcode, reason: `Cod invalid (${barcode.length} cifre, trebuie 17)` });
      continue;
    }

    valid.push({ description, quantity, barcode });
  }

  return { valid, errors };
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
        JSON.stringify({ success: false, error: "Missing server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const locationKey = (body.location as string) === "magazin" ? "magazin" : "depozit";
    const locationLabel = locationKey === "depozit" ? "Depozit Central" : "Magazin Ferdinand";
    const stockField = locationKey === "depozit" ? "stock_depozit" : "stock_general";

    const csvText = typeof body.csvText === "string" ? (body.csvText as string) : "";

    if (!csvText.trim()) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { totalLines: 0, validLines: 0, uniqueProducts: 0, created: 0, updated: 0, totalQuantity: 0, location: locationLabel },
          errors: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { valid: lines, errors: validationErrors } = parseCSV(csvText);

    console.log(`Parsed ${lines.length} valid lines, ${validationErrors.length} errors for ${locationLabel}`);

    if (lines.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { totalLines: validationErrors.length, validLines: 0, uniqueProducts: 0, created: 0, updated: 0, totalQuantity: 0, location: locationLabel },
          errors: validationErrors.slice(0, 50),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate by base_id (first 7 digits)
    const aggregated = new Map<string, { baseId: string; description: string; totalQty: number; price: number; fullBarcode: string }>();
    for (const line of lines) {
      const baseId = line.barcode.substring(0, 7);
      const price = parseInt(line.barcode.substring(13, 17), 10);
      const existing = aggregated.get(baseId);
      if (existing) {
        existing.totalQty += line.quantity;
      } else {
        aggregated.set(baseId, { baseId, description: line.description, totalQty: line.quantity, price, fullBarcode: line.barcode });
      }
    }

    const totalQuantity = Array.from(aggregated.values()).reduce((s, a) => s + a.totalQty, 0);
    let created = 0;
    let updated = 0;

    // Fetch existing products to know which exist
    const baseIds = Array.from(aggregated.keys());
    const existingMap = new Map<string, { id: string; full_barcode: string | null }>(); // base_id -> product

    for (let i = 0; i < baseIds.length; i += 100) {
      const chunk = baseIds.slice(i, i + 100);
      const { data } = await supabase.from("products").select("id, base_id, full_barcode").in("base_id", chunk);
      if (data) {
        for (const p of data) existingMap.set(p.base_id, { id: p.id, full_barcode: p.full_barcode });
      }
    }

    // LOCATION-SAFE: For existing products, ONLY update the target stock field
    // NEVER touch the other location's stock
    for (const [baseId, item] of aggregated) {
      const existingProduct = existingMap.get(baseId);
      if (existingProduct) {
        // Update ONLY the target stock field
        const updateData: Record<string, unknown> = { [stockField]: item.totalQty, active: true };
        // Save full_barcode only once, do not overwrite existing value
        if (!existingProduct.full_barcode) {
          updateData.full_barcode = item.fullBarcode;
        }
        const { error } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", existingProduct.id);
        if (!error) updated++;
        else console.error(`Update error for ${baseId}:`, error.message);
      } else {
        // Insert new product with ONLY the target location's stock set
        const newProduct: Record<string, unknown> = {
          base_id: baseId,
          name: item.description,
          selling_price: item.price,
          cost_price: 0,
          stock_depozit: stockField === "stock_depozit" ? item.totalQty : 0,
          stock_general: stockField === "stock_general" ? item.totalQty : 0,
          full_barcode: item.fullBarcode,
          active: true,
        };
        const { error } = await supabase.from("products").insert(newProduct);
        if (!error) created++;
        else console.error(`Insert error for ${baseId}:`, error.message);
      }
    }

    console.log(`Import ${locationLabel}: ${created} created, ${updated} updated, qty=${totalQuantity}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalLines: lines.length + validationErrors.length,
          validLines: lines.length,
          uniqueProducts: aggregated.size,
          created,
          updated,
          totalQuantity,
          location: locationLabel,
        },
        errors: validationErrors.slice(0, 50),
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

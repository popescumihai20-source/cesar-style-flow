import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImportLine {
  description: string;
  quantity: number;
  barcode: string;
  sourceLineNumber: number;
  rawQuantity: string;
}

interface ValidationError {
  line: number;
  description: string;
  barcode: string;
  reason: string;
}

/**
 * Locale-aware number parsing.
 * Handles European (1.234,56) and US (1,234.56) formats,
 * plus plain integers. Returns null for unparseable values.
 */
function parseNumericValue(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;

  let cleaned = value.toString().replace(/\s/g, "").replace(/[R$\u20AC$]/g, "");

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot === -1 && lastComma === -1) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.round(num);
  }

  if (lastDot > lastComma) {
    // US/UK format: 1,234.56 — remove thousand separators
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    // European format: 1.234,56 — remove thousand separators, convert decimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
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

  console.log(`[IMPORT-PARSE] Total raw lines: ${rawLines.length}, delimiter: "${delimiter === "\t" ? "TAB" : delimiter}"`);

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/[,;\t]+$/, "").trim();
    if (!raw) continue;
    if (isHeaderLine(raw)) {
      console.log(`[IMPORT-PARSE] Line ${i + 1}: SKIPPED (header) → "${raw.substring(0, 80)}"`);
      continue;
    }

    const fields = splitLine(raw, delimiter);
    if (fields.length < 3) {
      const reason = `Mai puțin de 3 coloane (${fields.length} găsite)`;
      console.log(`[IMPORT-PARSE] Line ${i + 1}: ERROR → ${reason} → "${raw.substring(0, 80)}"`);
      errors.push({ line: i + 1, description: fields[0] || "", barcode: "", reason });
      continue;
    }

    const description = fields[0].trim();
    const rawQtyStr = fields[1].trim();
    const barcode = fields[2].trim();

    if (!description) {
      const reason = "Descriere lipsă";
      console.log(`[IMPORT-PARSE] Line ${i + 1}: ERROR → ${reason}`);
      errors.push({ line: i + 1, description: "", barcode, reason });
      continue;
    }

    // Use locale-aware parsing instead of plain parseInt
    const quantity = parseNumericValue(rawQtyStr);
    if (quantity === null || quantity < 0) {
      const reason = `Cantitate invalidă: "${rawQtyStr}" (parsed as ${quantity})`;
      console.log(`[IMPORT-PARSE] Line ${i + 1}: ERROR → ${reason} → desc="${description}"`);
      errors.push({ line: i + 1, description, barcode, reason });
      continue;
    }

    if (!/^\d{17}$/.test(barcode)) {
      const reason = `Cod invalid (${barcode.length} cifre, trebuie 17): "${barcode}"`;
      console.log(`[IMPORT-PARSE] Line ${i + 1}: ERROR → ${reason} → desc="${description}", qty=${quantity}`);
      errors.push({ line: i + 1, description, barcode, reason });
      continue;
    }

    console.log(`[IMPORT-PARSE] Line ${i + 1}: OK → desc="${description}", rawQty="${rawQtyStr}", parsedQty=${quantity}, barcode=${barcode}`);
    valid.push({ description, quantity, barcode, sourceLineNumber: i + 1, rawQuantity: rawQtyStr });
  }

  console.log(`[IMPORT-PARSE] Result: ${valid.length} valid, ${errors.length} errors`);
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

    // Resolve inventory_locations ID for this location
    const locationType = locationKey === "depozit" ? "warehouse" : "store";
    const { data: locData } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("type", locationType)
      .eq("active", true)
      .limit(1)
      .single();
    const inventoryLocationId = locData?.id ?? null;

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

    console.log(`[IMPORT] Parsed ${lines.length} valid lines, ${validationErrors.length} errors for ${locationLabel}`);

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

    // Aggregate by base_id (first 7 digits) — track totalValue as sum of (price × qty) per barcode
    const aggregated = new Map<string, { baseId: string; description: string; totalQty: number; totalValue: number; fullBarcode: string; sourceRows: { line: number; qty: number; rawQty: string; barcode: string; price: number; lineValue: number }[] }>();
    for (const line of lines) {
      const baseId = line.barcode.substring(0, 7);
      const price = parseInt(line.barcode.slice(-4), 10);
      const lineValue = price * line.quantity;
      const existing = aggregated.get(baseId);
      if (existing) {
        existing.totalQty += line.quantity;
        existing.totalValue += lineValue;
        existing.sourceRows.push({ line: line.sourceLineNumber, qty: line.quantity, rawQty: line.rawQuantity, barcode: line.barcode, price, lineValue });
        console.log(`[IMPORT-AGG] baseId=${baseId} ("${existing.description}"): merged line ${line.sourceLineNumber} qty=${line.quantity} price=${price} lineValue=${lineValue} → cumulativeQty=${existing.totalQty} cumulativeValue=${existing.totalValue}`);
      } else {
        aggregated.set(baseId, {
          baseId,
          description: line.description,
          totalQty: line.quantity,
          totalValue: lineValue,
          fullBarcode: line.barcode,
          sourceRows: [{ line: line.sourceLineNumber, qty: line.quantity, rawQty: line.rawQuantity, barcode: line.barcode, price, lineValue }],
        });
        console.log(`[IMPORT-AGG] baseId=${baseId} ("${line.description}"): NEW entry, line ${line.sourceLineNumber}, qty=${line.quantity}, price=${price}, lineValue=${lineValue}`);
      }
    }

    // Debug: log all aggregated products with row breakdowns
    for (const [baseId, item] of aggregated) {
      console.log(`[IMPORT-AGG-FINAL] baseId=${baseId} desc="${item.description}" totalQty=${item.totalQty} totalValue=${item.totalValue} from ${item.sourceRows.length} rows:`);
      for (const row of item.sourceRows) {
        console.log(`  → line ${row.line}: rawQty="${row.rawQty}" parsedQty=${row.qty} barcode=${row.barcode} price=${row.price} lineValue=${row.lineValue}`);
      }
    }

    const totalQuantity = Array.from(aggregated.values()).reduce((s, a) => s + a.totalQty, 0);
    let created = 0;
    let updated = 0;

    // Fetch existing products to know which exist
    const baseIds = Array.from(aggregated.keys());
    const existingMap = new Map<string, { id: string; full_barcode: string | null }>();

    for (let i = 0; i < baseIds.length; i += 100) {
      const chunk = baseIds.slice(i, i + 100);
      const { data } = await supabase.from("products").select("id, base_id, full_barcode").in("base_id", chunk);
      if (data) {
        for (const p of data) existingMap.set(p.base_id, { id: p.id, full_barcode: p.full_barcode });
      }
    }

    // LOCATION-SAFE: For existing products, ONLY update the target stock field
    for (const [baseId, item] of aggregated) {
      const existingProduct = existingMap.get(baseId);
      if (existingProduct) {
        // ALWAYS update full_barcode to fix any previously corrupted values from float64 precision loss
        const updateData: Record<string, unknown> = { [stockField]: item.totalQty, active: true, full_barcode: item.fullBarcode };
        const { error } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", existingProduct.id);
        if (!error) {
          updated++;
          console.log(`[IMPORT-DB] UPDATED baseId=${baseId} "${item.description}" ${stockField}=${item.totalQty}`);
          if (inventoryLocationId) {
            await supabase.from("inventory_stock").upsert(
              { product_id: existingProduct.id, location_id: inventoryLocationId, quantity: item.totalQty },
              { onConflict: "product_id,location_id" }
            );
          }
        } else {
          console.error(`[IMPORT-DB] Update error for ${baseId}:`, error.message);
        }
      } else {
        const newProduct: Record<string, unknown> = {
          base_id: baseId,
          name: item.description,
          selling_price: item.sourceRows[0]?.price || 0,
          cost_price: 0,
          stock_depozit: stockField === "stock_depozit" ? item.totalQty : 0,
          stock_general: stockField === "stock_general" ? item.totalQty : 0,
          full_barcode: item.fullBarcode,
          active: true,
        };
        const { data: inserted, error } = await supabase.from("products").insert(newProduct).select("id").single();
        if (!error && inserted) {
          created++;
          console.log(`[IMPORT-DB] CREATED baseId=${baseId} "${item.description}" ${stockField}=${item.totalQty}`);
          if (inventoryLocationId) {
            await supabase.from("inventory_stock").upsert(
              { product_id: inserted.id, location_id: inventoryLocationId, quantity: item.totalQty },
              { onConflict: "product_id,location_id" }
            );
          }
        } else {
          console.error(`[IMPORT-DB] Insert error for ${baseId}:`, error?.message);
        }
      }
    }

    console.log(`[IMPORT] Complete for ${locationLabel}: ${created} created, ${updated} updated, totalQty=${totalQuantity}`);

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
    console.error("[IMPORT] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

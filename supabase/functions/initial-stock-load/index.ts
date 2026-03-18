import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StockEntry {
  barcode: string;
  quantity: number;
  rawQuantity: string;
  sourceLineNumber: number;
}

interface EntryResult {
  barcode: string;
  baseId: string;
  productName: string;
  quantity: number;
  status: "ok" | "error";
  reason?: string;
}

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
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma > lastDot) {
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
  return /^(descriere|column|header|nr|#|produs|barcode|cod)/i.test(lower);
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t" || delimiter === ";") {
    return line.split(delimiter).map(f => f.trim());
  }
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV/TSV with format: Barcode, Quantity
 * (2 columns minimum — barcode first, quantity second)
 * OR: Description, Quantity, Barcode (3 columns — same as bulk import)
 */
function parseEntries(rawText: string): { valid: StockEntry[]; errors: EntryResult[] } {
  const valid: StockEntry[] = [];
  const errors: EntryResult[] = [];
  if (!rawText || typeof rawText !== "string") return { valid, errors };

  const rawLines = rawText.split(/\r?\n/);
  const firstNonEmpty = rawLines.find(l => l.trim().length > 0) || "";
  const delimiter = detectDelimiter(firstNonEmpty);

  console.log(`[INIT-STOCK-PARSE] Total lines: ${rawLines.length}, delimiter: "${delimiter === "\t" ? "TAB" : delimiter}"`);

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/[,;\t]+$/, "").trim();
    if (!raw) continue;
    if (isHeaderLine(raw)) continue;

    const fields = splitLine(raw, delimiter);
    
    let barcode = "";
    let rawQtyStr = "";

    if (fields.length >= 3) {
      // 3-column format: Description, Quantity, Barcode
      rawQtyStr = fields[1].trim();
      barcode = fields[2].trim();
    } else if (fields.length >= 2) {
      // 2-column format: Barcode, Quantity
      // Detect which field is the barcode (17 digits)
      if (/^\d{17}$/.test(fields[0].trim())) {
        barcode = fields[0].trim();
        rawQtyStr = fields[1].trim();
      } else if (/^\d{17}$/.test(fields[1].trim())) {
        rawQtyStr = fields[0].trim();
        barcode = fields[1].trim();
      } else {
        barcode = fields[0].trim();
        rawQtyStr = fields[1].trim();
      }
    } else {
      errors.push({ barcode: "", baseId: "", productName: "", quantity: 0, status: "error", reason: `Linie cu mai puțin de 2 coloane` });
      continue;
    }

    if (!/^\d{17}$/.test(barcode)) {
      errors.push({ barcode, baseId: "", productName: "", quantity: 0, status: "error", reason: `Cod invalid (${barcode.length} cifre, trebuie 17)` });
      continue;
    }

    const quantity = parseNumericValue(rawQtyStr);
    if (quantity === null || quantity < 0) {
      errors.push({ barcode, baseId: barcode.substring(0, 7), productName: "", quantity: 0, status: "error", reason: `Cantitate invalidă: "${rawQtyStr}"` });
      continue;
    }

    valid.push({ barcode, quantity, rawQuantity: rawQtyStr, sourceLineNumber: i + 1 });
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
      return new Response(JSON.stringify({ success: false, error: "Missing server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const mode = body.mode as string; // "bulk" or "single"
    const locationKey = (body.location as string) === "magazin" ? "magazin" : "depozit";
    const locationLabel = locationKey === "depozit" ? "Depozit Central" : "Magazin Ferdinand";
    const stockField = locationKey === "depozit" ? "stock_depozit" : "stock_general";

    // Resolve inventory_locations ID
    const locationType = locationKey === "depozit" ? "warehouse" : "store";
    const { data: locData } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("type", locationType)
      .eq("active", true)
      .limit(1)
      .single();
    const inventoryLocationId = locData?.id ?? null;

    let entries: StockEntry[] = [];
    let parseErrors: EntryResult[] = [];

    if (mode === "single") {
      const barcode = (body.barcode as string || "").trim();
      const quantity = Number(body.quantity ?? 0);
      if (!/^\d{17}$/.test(barcode)) {
        return new Response(JSON.stringify({ success: false, error: "Cod de bare invalid (trebuie 17 cifre)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (quantity < 0) {
        return new Response(JSON.stringify({ success: false, error: "Cantitatea nu poate fi negativă" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      entries = [{ barcode, quantity, rawQuantity: String(quantity), sourceLineNumber: 1 }];
    } else {
      const csvText = typeof body.csvText === "string" ? body.csvText as string : "";
      if (!csvText.trim()) {
        return new Response(JSON.stringify({ success: true, results: [], summary: { total: 0, success: 0, errors: 0, location: locationLabel } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const parsed = parseEntries(csvText);
      entries = parsed.valid;
      parseErrors = parsed.errors;
    }

    // Aggregate by FULL BARCODE — SUM quantities for repeated rows of the same exact barcode
    const aggregated = new Map<string, { barcode: string; baseId: string; totalQty: number; lineCount: number }>();
    for (const entry of entries) {
      const existing = aggregated.get(entry.barcode);
      if (existing) {
        existing.totalQty += entry.quantity;
        existing.lineCount += 1;
      } else {
        aggregated.set(entry.barcode, {
          barcode: entry.barcode,
          baseId: entry.barcode.substring(0, 7),
          totalQty: entry.quantity,
          lineCount: 1,
        });
      }
    }

    // Fetch existing products — EXACT full_barcode match ONLY (no fallback)
    const barcodes = Array.from(aggregated.keys());
    const existingMap = new Map<string, { id: string; name: string; baseId: string; currentStock: number }>();
    
    for (let i = 0; i < barcodes.length; i += 100) {
      const chunk = barcodes.slice(i, i + 100);
      const { data } = await supabase.from("products").select(`id, base_id, full_barcode, name, ${stockField}`).in("full_barcode", chunk);
      if (data) {
        for (const p of data) {
          const fullBarcode = (p as any).full_barcode as string;
          existingMap.set(fullBarcode, {
            id: p.id,
            name: p.name,
            baseId: p.base_id,
            currentStock: (p as any)[stockField],
          });
        }
      }
    }

    const unmatchedCount = barcodes.filter(b => !existingMap.has(b)).length;
    console.log(`[INIT-STOCK] Exact matches: ${existingMap.size}, Unmatched (no fallback): ${unmatchedCount}`);

    const results: EntryResult[] = [...parseErrors];
    let successCount = 0;

    for (const [barcode, item] of aggregated) {
      const product = existingMap.get(barcode);
      if (!product) {
        results.push({
          barcode,
          baseId: item.baseId,
          productName: "",
          quantity: item.totalQty,
          status: "error",
          reason: `Barcode inexistent (potrivire exactă full_barcode). Nu se folosește fallback pe base_id.`,
        });
        continue;
      }

      // SET stock to exact quantity (not add)
      const { error } = await supabase
        .from("products")
        .update({ [stockField]: item.totalQty })
        .eq("id", product.id);

      if (error) {
        results.push({
          barcode,
          baseId: product.baseId,
          productName: product.name,
          quantity: item.totalQty,
          status: "error",
          reason: `Eroare DB: ${error.message}`,
        });
        continue;
      }

      // Update inventory_stock too
      if (inventoryLocationId) {
        await supabase.from("inventory_stock").upsert(
          { product_id: product.id, location_id: inventoryLocationId, quantity: item.totalQty },
          { onConflict: "product_id,location_id" }
        );
      }

      console.log(`[INIT-STOCK] SET ${barcode} (${product.baseId}) "${product.name}" ${stockField}: ${product.currentStock} → ${item.totalQty} (location: ${locationLabel}, merged_rows: ${item.lineCount})`);

      results.push({
        barcode,
        baseId: product.baseId,
        productName: product.name,
        quantity: item.totalQty,
        status: "ok",
      });
      successCount++;
    }

    const exactMatches = successCount;
    const unmatchedRows = results.filter(r => r.status === "error" && r.reason?.includes("inexistent"));
    
    return new Response(JSON.stringify({
      success: true,
      results,
      summary: {
        total: aggregated.size + parseErrors.length,
        success: successCount,
        errors: results.filter(r => r.status === "error").length,
        exactMatches,
        unmatchedRows: unmatchedRows.length,
        collisions: 0,
        location: locationLabel,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[INIT-STOCK] Fatal error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

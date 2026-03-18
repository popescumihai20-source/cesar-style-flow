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
  sourceProductName: string;
}

interface EntryResult {
  barcode: string;
  baseId: string;
  productName: string;
  quantity: number;
  status: "ok" | "error";
  reason?: string;
}

interface ZeroQuantitySourceRow {
  sourceLineNumber: number;
  barcode: string;
  stableKey: string;
  sourceProductName: string;
  rawQuantity: string;
  parsedQuantity: number;
  delimiter: string;
  rawLine: string;
  fields: string[];
}

interface ZeroQuantityDebugRow {
  stableKey: string;
  assignedQuantity: number;
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchStatus: "matched" | "unmatched" | "collision";
  collisionProductIds: string[];
  reason: string;
  sourceRows: ZeroQuantitySourceRow[];
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
    return line.split(delimiter).map((f) => f.trim());
  }
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
      } else if (ch === ",") {
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

/**
 * Parse CSV/TSV with format: Barcode, Quantity
 * (2 columns minimum — barcode first, quantity second)
 * OR: Description, Quantity, Barcode (3 columns — same as bulk import)
 */
function parseEntries(rawText: string): {
  valid: StockEntry[];
  errors: EntryResult[];
  zeroQuantitySourceRows: ZeroQuantitySourceRow[];
} {
  const valid: StockEntry[] = [];
  const errors: EntryResult[] = [];
  const zeroQuantitySourceRows: ZeroQuantitySourceRow[] = [];
  if (!rawText || typeof rawText !== "string") return { valid, errors, zeroQuantitySourceRows };

  const rawLines = rawText.split(/\r?\n/);
  const firstNonEmpty = rawLines.find((l) => l.trim().length > 0) || "";
  const delimiter = detectDelimiter(firstNonEmpty);

  console.log(`[INIT-STOCK-PARSE] Total lines: ${rawLines.length}, delimiter: "${delimiter === "\t" ? "TAB" : delimiter}"`);
  // Log first 5 data lines for column alignment debugging
  let debugSampleCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const rawOriginal = rawLines[i];
    const raw = rawOriginal.replace(/[,;\t]+$/, "").trim();
    if (!raw) continue;
    if (isHeaderLine(raw)) continue;

    const fields = splitLine(raw, delimiter);

    // Log first 5 parsed data lines for debugging
    if (debugSampleCount < 5) {
      debugSampleCount++;
      console.log(`[INIT-STOCK-SAMPLE] line=${i + 1}, fields_count=${fields.length}, fields=${JSON.stringify(fields.slice(0, 5))}`);
    }

    let barcode = "";
    let rawQtyStr = "";
    let sourceProductName = "";

    if (fields.length >= 3) {
      // 3-column format: Description, Quantity, Barcode
      sourceProductName = fields[0].trim();
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
      errors.push({ barcode: "", baseId: "", productName: "", quantity: 0, status: "error", reason: "Linie cu mai puțin de 2 coloane" });
      continue;
    }

    if (!/^\d{17}$/.test(barcode)) {
      errors.push({ barcode, baseId: "", productName: sourceProductName, quantity: 0, status: "error", reason: `Cod invalid (${barcode.length} cifre, trebuie 17)` });
      continue;
    }

    const quantity = parseNumericValue(rawQtyStr);
    if (quantity === null || quantity < 0) {
      errors.push({ barcode, baseId: barcode.substring(0, 7), productName: sourceProductName, quantity: 0, status: "error", reason: `Cantitate invalidă: "${rawQtyStr}"` });
      continue;
    }

    // Debug: capture rows parsed as zero BEFORE DB writes
    if (quantity === 0) {
      const debugRow: ZeroQuantitySourceRow = {
        sourceLineNumber: i + 1,
        barcode,
        stableKey: barcode.substring(0, 7),
        sourceProductName,
        rawQuantity: rawQtyStr,
        parsedQuantity: quantity,
        delimiter,
        rawLine: rawOriginal,
        fields,
      };
      zeroQuantitySourceRows.push(debugRow);
      console.log(`[INIT-STOCK-PARSE-ZERO] line=${debugRow.sourceLineNumber}, barcode=${debugRow.barcode}, stable_key=${debugRow.stableKey}, source_product="${debugRow.sourceProductName}", raw_qty="${debugRow.rawQuantity}", parsed_qty=${debugRow.parsedQuantity}, fields=${JSON.stringify(debugRow.fields)}`);
    }

    valid.push({
      barcode,
      quantity,
      rawQuantity: rawQtyStr,
      sourceLineNumber: i + 1,
      sourceProductName,
    });
  }

  return { valid, errors, zeroQuantitySourceRows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing server configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    let zeroQuantitySourceRows: ZeroQuantitySourceRow[] = [];

    if (mode === "single") {
      const barcode = ((body.barcode as string) || "").trim();
      const quantity = Number(body.quantity ?? 0);
      if (!/^\d{17}$/.test(barcode)) {
        return new Response(JSON.stringify({ success: false, error: "Cod de bare invalid (trebuie 17 cifre)" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (quantity < 0) {
        return new Response(JSON.stringify({ success: false, error: "Cantitatea nu poate fi negativă" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      entries = [{ barcode, quantity, rawQuantity: String(quantity), sourceLineNumber: 1, sourceProductName: "" }];
      if (quantity === 0) {
        zeroQuantitySourceRows.push({
          sourceLineNumber: 1,
          barcode,
          stableKey: barcode.substring(0, 7),
          sourceProductName: "",
          rawQuantity: String(quantity),
          parsedQuantity: quantity,
          delimiter: "manual",
          rawLine: String(quantity),
          fields: [barcode, String(quantity)],
        });
      }
    } else {
      const csvText = typeof body.csvText === "string" ? (body.csvText as string) : "";
      if (!csvText.trim()) {
        return new Response(
          JSON.stringify({ success: true, results: [], summary: { total: 0, success: 0, errors: 0, location: locationLabel } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const parsed = parseEntries(csvText);
      entries = parsed.valid;
      parseErrors = parsed.errors;
      zeroQuantitySourceRows = parsed.zeroQuantitySourceRows;
    }

    // Aggregate by STABLE KEY (first 7 digits = base_id) — SUM quantities for same product
    // Track totalValue as sum of (price_per_barcode × qty_per_barcode) to avoid wrong totals
    const aggregated = new Map<string, { stableKey: string; barcodes: string[]; totalQty: number; totalValue: number; lineCount: number }>();
    for (const entry of entries) {
      const stableKey = entry.barcode.substring(0, 7);
      const priceFromBarcode = parseInt(entry.barcode.slice(-4), 10) || 0;
      const lineValue = priceFromBarcode * entry.quantity;
      const existing = aggregated.get(stableKey);
      if (existing) {
        existing.totalQty += entry.quantity;
        existing.totalValue += lineValue;
        existing.lineCount += 1;
        if (!existing.barcodes.includes(entry.barcode)) existing.barcodes.push(entry.barcode);
      } else {
        aggregated.set(stableKey, {
          stableKey,
          barcodes: [entry.barcode],
          totalQty: entry.quantity,
          totalValue: lineValue,
          lineCount: 1,
        });
      }
    }

    const zeroQtyByStableKey = new Map<string, ZeroQuantitySourceRow[]>();
    for (const row of zeroQuantitySourceRows) {
      const arr = zeroQtyByStableKey.get(row.stableKey) || [];
      arr.push(row);
      zeroQtyByStableKey.set(row.stableKey, arr);
    }

    // Fetch ALL active products from DB to build base_id lookup
    const baseIdProductMap = new Map<string, { id: string; name: string; baseId: string; currentStock: number }[]>();
    let dbOffset = 0;
    const DB_PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("products")
        .select(`id, base_id, name, ${stockField}`)
        .eq("active", true)
        .range(dbOffset, dbOffset + DB_PAGE - 1);
      if (!data || data.length === 0) break;
      for (const p of data) {
        const arr = baseIdProductMap.get(p.base_id) || [];
        arr.push({ id: p.id, name: p.name, baseId: p.base_id, currentStock: (p as any)[stockField] });
        baseIdProductMap.set(p.base_id, arr);
      }
      if (data.length < DB_PAGE) break;
      dbOffset += DB_PAGE;
    }

    console.log(`[INIT-STOCK] Aggregated stable keys: ${aggregated.size}, DB products loaded: ${dbOffset > 0 ? dbOffset : baseIdProductMap.size}`);

    const results: EntryResult[] = [...parseErrors];
    const zeroQuantityDebugRows: ZeroQuantityDebugRow[] = [];
    let successCount = 0;
    let collisionCount = 0;
    let inventoryStockWriteErrors = 0;

    for (const [stableKey, item] of aggregated) {
      const matches = baseIdProductMap.get(stableKey);

      if (!matches || matches.length === 0) {
        const reason = `Nicio potrivire base_id="${stableKey}" în DB`;
        results.push({
          barcode: item.barcodes[0],
          baseId: stableKey,
          productName: "",
          quantity: item.totalQty,
          status: "error",
          reason,
        });

        if (item.totalQty === 0) {
          const sourceRows = zeroQtyByStableKey.get(stableKey) || [];
          zeroQuantityDebugRows.push({
            stableKey,
            assignedQuantity: item.totalQty,
            matchedProductId: null,
            matchedProductName: null,
            matchStatus: "unmatched",
            collisionProductIds: [],
            reason,
            sourceRows,
          });
          console.log(`[INIT-STOCK-ZERO-BEFORE-SAVE] stable_key=${stableKey}, status=unmatched, source_rows=${JSON.stringify(sourceRows)}`);
        }
        continue;
      }

      if (matches.length > 1) {
        collisionCount++;
        const reason = `COLIZIUNE: ${matches.length} produse cu base_id="${stableKey}" — import blocat`;
        results.push({
          barcode: item.barcodes[0],
          baseId: stableKey,
          productName: matches.map((m) => m.name).join(" | "),
          quantity: item.totalQty,
          status: "error",
          reason,
        });

        if (item.totalQty === 0) {
          const sourceRows = zeroQtyByStableKey.get(stableKey) || [];
          zeroQuantityDebugRows.push({
            stableKey,
            assignedQuantity: item.totalQty,
            matchedProductId: null,
            matchedProductName: null,
            matchStatus: "collision",
            collisionProductIds: matches.map((m) => m.id),
            reason,
            sourceRows,
          });
          console.log(`[INIT-STOCK-ZERO-BEFORE-SAVE] stable_key=${stableKey}, status=collision, source_rows=${JSON.stringify(sourceRows)}, matches=${matches.map((m) => m.id).join(",")}`);
        }
        continue;
      }

      // Exactly one match — safe to import
      const product = matches[0];

      if (item.totalQty === 0) {
        const sourceRows = zeroQtyByStableKey.get(stableKey) || [];
        zeroQuantityDebugRows.push({
          stableKey,
          assignedQuantity: item.totalQty,
          matchedProductId: product.id,
          matchedProductName: product.name,
          matchStatus: "matched",
          collisionProductIds: [],
          reason: "Cantitate 0 va fi scrisă explicit în DB (replace mode)",
          sourceRows,
        });
        console.log(`[INIT-STOCK-ZERO-BEFORE-SAVE] stable_key=${stableKey}, product_id=${product.id}, product_name="${product.name}", qty=${item.totalQty}, source_rows=${JSON.stringify(sourceRows)}`);
      }

      const { error } = await supabase
        .from("products")
        .update({ [stockField]: item.totalQty })
        .eq("id", product.id);

      if (error) {
        results.push({
          barcode: item.barcodes[0],
          baseId: product.baseId,
          productName: product.name,
          quantity: item.totalQty,
          status: "error",
          reason: `Eroare DB products: ${error.message}`,
        });
        continue;
      }

      // Update inventory_stock as REPLACE, not additive
      if (inventoryLocationId) {
        const { error: stockError } = await supabase.from("inventory_stock").upsert(
          { product_id: product.id, location_id: inventoryLocationId, quantity: item.totalQty },
          { onConflict: "product_id,location_id" },
        );

        if (stockError) {
          inventoryStockWriteErrors++;
          // Best-effort rollback of products legacy column to keep consistency
          await supabase.from("products").update({ [stockField]: product.currentStock }).eq("id", product.id);

          results.push({
            barcode: item.barcodes[0],
            baseId: product.baseId,
            productName: product.name,
            quantity: item.totalQty,
            status: "error",
            reason: `Eroare DB inventory_stock: ${stockError.message}`,
          });
          continue;
        }
      }

      console.log(`[INIT-STOCK] SET base_id=${stableKey} "${product.name}" ${stockField}: ${product.currentStock} → ${item.totalQty} (merged_rows: ${item.lineCount}, write_mode=replace)`);

      results.push({
        barcode: item.barcodes[0],
        baseId: product.baseId,
        productName: product.name,
        quantity: item.totalQty,
        status: "ok",
      });
      successCount++;
    }

    const unmatchedRows = results.filter((r) => r.status === "error" && r.reason?.includes("Nicio potrivire"));

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: aggregated.size + parseErrors.length,
          success: successCount,
          errors: results.filter((r) => r.status === "error").length,
          exactMatches: successCount,
          unmatchedRows: unmatchedRows.length,
          collisions: collisionCount,
          zeroQuantityRowsDetected: zeroQuantitySourceRows.length,
          zeroQuantityRowsAssigned: zeroQuantityDebugRows.length,
          inventoryStockWriteErrors,
          writeMode: "replace_existing_quantity",
          writesTo: [stockField, "inventory_stock.quantity"],
          location: locationLabel,
        },
        debug: {
          zeroQuantityRows: zeroQuantityDebugRows,
          note: "Raw quantity values captured before DB write for all rows that result in assigned quantity 0",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[INIT-STOCK] Fatal error:", err);
    return new Response(JSON.stringify({ success: false, error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

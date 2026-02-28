import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileDown, CheckCircle, AlertTriangle, Package, Warehouse, Store } from "lucide-react";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";

interface ParsedLine {
  lineNumber: number;
  description: string;
  quantity: number;
  code: string;
  baseId: string;
  error?: string;
}

interface ImportResult {
  location: string;
  locationLabel: string;
  totalLines: number;
  validLines: number;
  invalidLines: ParsedLine[];
  productsCreated: number;
  productsUpdated: number;
  totalQuantity: number;
}

const LOCATION_MAP: Record<string, { field: "stock_general" | "stock_depozit"; label: string }> = {
  depozit: { field: "stock_depozit", label: "Depozit Central" },
  magazin: { field: "stock_general", label: "Magazin Ferdinand" },
};

function parseTextFile(content: string): { description: string; quantity: number; code: string; lineNumber: number }[] {
  const lines = content.split(/\r?\n/);
  const results: { description: string; quantity: number; code: string; lineNumber: number }[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // Skip empty lines and lines that are only whitespace/tabs
    const trimmed = line.replace(/\t/g, "").trim();
    if (!trimmed) continue;

    // Skip header line
    if (/^Descriere\s/i.test(trimmed) || /^Descriere\t/i.test(line)) continue;

    // Split by tab (primary delimiter for these files)
    let parts: string[];
    if (line.includes("\t")) {
      parts = line.split("\t").map(s => s.trim()).filter(s => s.length > 0);
    } else if (line.includes("|")) {
      parts = line.split("|").map(s => s.trim()).filter(s => s.length > 0);
    } else {
      parts = line.split(/\s{2,}/).map(s => s.trim()).filter(s => s.length > 0);
    }

    let description = "";
    let quantity = 0;
    let code = "";

    if (parts.length >= 3) {
      // Find the barcode (17 digits)
      const codeIdx = parts.findIndex(p => /^\d{17}$/.test(p));
      if (codeIdx !== -1) {
        code = parts[codeIdx];
        const remaining = parts.filter((_, i) => i !== codeIdx);
        const qtyIdx = remaining.findIndex(p => /^\d+$/.test(p));
        if (qtyIdx !== -1) {
          quantity = parseInt(remaining[qtyIdx], 10);
          description = remaining.filter((_, i) => i !== qtyIdx).join(" ").trim();
        } else {
          description = remaining[0] || "";
          quantity = parseInt(remaining[1], 10) || 0;
        }
      } else {
        // Fallback: Descriere | Cant | Cod
        description = parts[0];
        quantity = parseInt(parts[1], 10) || 0;
        code = parts[2];
      }
    } else if (parts.length === 2) {
      description = parts[0];
      code = parts[1];
    } else {
      description = line.trim();
    }

    results.push({ description, quantity, code, lineNumber: idx + 1 });
  }
  return results;
}

export default function ImportInventoryTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRefDepozit = useRef<HTMLInputElement>(null);
  const fileRefMagazin = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const processFile = useCallback(async (
    content: string,
    locationKey: "depozit" | "magazin"
  ): Promise<ImportResult> => {
    const { field, label } = LOCATION_MAP[locationKey];
    const rawLines = parseTextFile(content);
    const validLines: ParsedLine[] = [];
    const invalidLines: ParsedLine[] = [];

    // Validate
    for (const line of rawLines) {
      if (!line.code) {
        invalidLines.push({ ...line, baseId: "", error: "Cod lipsă" });
        continue;
      }
      if (!/^\d+$/.test(line.code)) {
        invalidLines.push({ ...line, baseId: "", error: "Cod conține caractere non-numerice" });
        continue;
      }
      if (line.code.length !== 17) {
        invalidLines.push({ ...line, baseId: "", error: `Lungime ${line.code.length} (trebuie 17)` });
        continue;
      }
      const parsed = parseBarcode(line.code);
      if (!parsed.isValid) {
        invalidLines.push({ ...line, baseId: "", error: parsed.error || "Cod invalid" });
        continue;
      }
      validLines.push({ ...line, baseId: parsed.baseId });
    }

    // Aggregate by baseId — sum quantities
    const aggregated = new Map<string, { baseId: string; description: string; totalQty: number; price: number }>();
    for (const line of validLines) {
      const parsed = parseBarcode(line.code);
      const existing = aggregated.get(line.baseId);
      if (existing) {
        existing.totalQty += line.quantity;
      } else {
        aggregated.set(line.baseId, {
          baseId: line.baseId,
          description: line.description,
          totalQty: line.quantity,
          price: parsed.labelPrice,
        });
      }
    }

    // Fetch existing products
    const baseIds = Array.from(aggregated.keys());
    let existingProducts: any[] = [];
    if (baseIds.length > 0) {
      // Batch fetch in chunks of 100
      for (let i = 0; i < baseIds.length; i += 100) {
        const chunk = baseIds.slice(i, i + 100);
        const { data } = await supabase.from("products").select("id, base_id, stock_general, stock_depozit").in("base_id", chunk);
        if (data) existingProducts.push(...data);
      }
    }

    const existingMap = new Map(existingProducts.map(p => [p.base_id, p]));
    let productsCreated = 0;
    let productsUpdated = 0;

    // Process each aggregated product
    for (const [baseId, agg] of aggregated) {
      const existing = existingMap.get(baseId);
      if (existing) {
        // Update stock for this location
        const { error } = await supabase
          .from("products")
          .update({ [field]: agg.totalQty, active: true } as any)
          .eq("id", existing.id);
        if (!error) productsUpdated++;
      } else {
        // Create product
        const insertData: any = {
          base_id: baseId,
          name: agg.description || `Produs ${baseId}`,
          selling_price: agg.price,
          [field]: agg.totalQty,
          active: true,
        };
        // Set the other stock field to 0
        if (field === "stock_general") insertData.stock_depozit = 0;
        else insertData.stock_general = 0;

        const { error } = await supabase.from("products").insert(insertData);
        if (!error) productsCreated++;
      }
    }

    return {
      location: locationKey,
      locationLabel: label,
      totalLines: rawLines.length,
      validLines: validLines.length,
      invalidLines,
      productsCreated,
      productsUpdated,
      totalQuantity: Array.from(aggregated.values()).reduce((s, a) => s + a.totalQty, 0),
    };
  }, []);

  const handleFileUpload = useCallback(async (file: File, locationKey: "depozit" | "magazin") => {
    setIsImporting(true);
    try {
      const content = await file.text();
      const result = await processFile(content, locationKey);
      setResults(prev => [...prev.filter(r => r.location !== locationKey), result]);
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
      queryClient.invalidateQueries({ queryKey: ["products-inventory"] });
      toast({
        title: `✅ Import ${result.locationLabel} finalizat`,
        description: `${result.productsCreated} create, ${result.productsUpdated} actualizate, ${result.invalidLines.length} erori`,
      });
    } catch (err: any) {
      toast({ title: "Eroare la import", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  }, [processFile, queryClient, toast]);

  const handleDepozitFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, "depozit");
    if (fileRefDepozit.current) fileRefDepozit.current.value = "";
  }, [handleFileUpload]);

  const handleMagazinFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, "magazin");
    if (fileRefMagazin.current) fileRefMagazin.current.value = "";
  }, [handleFileUpload]);

  const downloadErrors = (result: ImportResult) => {
    if (result.invalidLines.length === 0) return;
    const headers = ["Linie", "Descriere", "Cantitate", "Cod", "Eroare"];
    const rows = result.invalidLines.map(l => [l.lineNumber, l.description, l.quantity, l.code, l.error]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `erori-import-${result.location}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Inventar din Fișiere Text
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Importă stocul inițial din două fișiere text separate pe locație. Format așteptat per linie: <code className="text-xs bg-muted px-1 rounded">Descriere | Cantitate | Cod (17 cifre)</code>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Depozit */}
            <Card className="border-dashed">
              <CardContent className="p-4 text-center space-y-3">
                <Warehouse className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium text-sm">Depozit Central</p>
                <p className="text-xs text-muted-foreground">00Produse-IN-Depozit.txt</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isImporting}
                  onClick={() => fileRefDepozit.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {isImporting ? "Se importă..." : "Selectează fișier"}
                </Button>
                <input
                  ref={fileRefDepozit}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleDepozitFile}
                />
              </CardContent>
            </Card>

            {/* Magazin */}
            <Card className="border-dashed">
              <CardContent className="p-4 text-center space-y-3">
                <Store className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium text-sm">Magazin Ferdinand</p>
                <p className="text-xs text-muted-foreground">02Produse-IN-Ferdinand.txt</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isImporting}
                  onClick={() => fileRefMagazin.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {isImporting ? "Se importă..." : "Selectează fișier"}
                </Button>
                <input
                  ref={fileRefMagazin}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleMagazinFile}
                />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.map(result => (
        <Card key={result.location}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Rezultat Import — {result.locationLabel}
              </span>
              {result.invalidLines.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => downloadErrors(result)}>
                  <FileDown className="h-3 w-3 mr-1" />Descarcă Erori ({result.invalidLines.length})
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Linii</p>
                <p className="text-lg font-bold font-mono">{result.totalLines}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valide</p>
                <p className="text-lg font-bold font-mono text-green-500">{result.validLines}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Bucăți</p>
                <p className="text-lg font-bold font-mono text-primary">{result.totalQuantity.toLocaleString("ro-RO")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Produse Create</p>
                <p className="text-lg font-bold font-mono">{result.productsCreated}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stoc Actualizat</p>
                <p className="text-lg font-bold font-mono">{result.productsUpdated}</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${result.invalidLines.length > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Erori</p>
                <p className={`text-lg font-bold font-mono ${result.invalidLines.length > 0 ? "text-destructive" : ""}`}>{result.invalidLines.length}</p>
              </div>
            </div>

            {/* Show first few errors inline */}
            {result.invalidLines.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  Linii cu erori (primele {Math.min(10, result.invalidLines.length)})
                </p>
                <div className="overflow-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Linie</TableHead>
                        <TableHead>Descriere</TableHead>
                        <TableHead className="w-20">Cant.</TableHead>
                        <TableHead>Cod</TableHead>
                        <TableHead>Eroare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.invalidLines.slice(0, 10).map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{line.lineNumber}</TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">{line.description}</TableCell>
                          <TableCell className="font-mono text-sm">{line.quantity}</TableCell>
                          <TableCell className="font-mono text-xs">{line.code || "—"}</TableCell>
                          <TableCell className="text-xs text-destructive">{line.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

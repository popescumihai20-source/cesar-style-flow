import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileDown, CheckCircle, AlertTriangle, Warehouse, Store } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportResult {
  location: string;
  locationLabel: string;
  totalLines: number;
  validLines: number;
  invalidLines: { line: number; description: string; barcode: string; reason: string }[];
  productsCreated: number;
  productsUpdated: number;
  totalQuantity: number;
  uniqueProducts: number;
}

/**
 * Force ALL numeric cells in a sheet to text type to prevent float64 precision loss.
 */
function forceSheetCellsToText(sheet: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      if (cell && cell.t === "n") {
        cell.t = "s";
        cell.v = cell.w || String(cell.v);
      }
    }
  }
}

async function fileToCSV(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Force all numeric cells to text BEFORE parsing
    forceSheetCellsToText(sheet);

    // Use named columns with robust key detection
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "", blankrows: false });
    if (rows.length === 0) return "";

    const sampleKeys = Object.keys(rows[0]);
    console.log(`[XLSX-IMPORT] Detected ${rows.length} rows. Column keys: ${JSON.stringify(sampleKeys)}`);

    const codKey = sampleKeys.find(k => /^cod$/i.test(k.trim())) || sampleKeys.find(k => /cod/i.test(k.trim()));
    const cantKey = sampleKeys.find(k => /^cant\.?$/i.test(k.trim())) || sampleKeys.find(k => /cant/i.test(k.trim()));
    const descKey = sampleKeys.find(k => /^(descriere|denumire|produs|desc)/i.test(k.trim())) || sampleKeys[0];

    console.log(`[XLSX-IMPORT] Mapped columns: Cod="${codKey}", Cant="${cantKey}", Desc="${descKey}"`);

    const lines: string[] = [];
    for (const row of rows) {
      const cod = codKey ? String(row[codKey] ?? "").trim() : "";
      const cant = cantKey ? String(row[cantKey] ?? "").trim() : "0";
      const desc = descKey ? String(row[descKey] ?? "").trim() : "";
      if (!cod) continue;
      lines.push(`${desc}\t${cant}\t${cod}`);
    }
    return lines.join("\n");
  }
  // For CSV/TXT, read as text
  const rawText = await file.text();
  return rawText.split(/\r?\n/).map(line => line.replace(/,+$/, "")).join("\n");
}

export default function ImportInventoryTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRefDepozit = useRef<HTMLInputElement>(null);
  const fileRefMagazin = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = useCallback(async (file: File, locationKey: "depozit" | "magazin") => {
    setIsImporting(true);
    try {
      const csvText = await fileToCSV(file);

      const { data, error } = await supabase.functions.invoke("bulk-import-inventory", {
        body: { csvText, location: locationKey },
      });

      if (error) throw new Error(error.message || "Eroare la import");
      if (!data?.success) throw new Error(data?.error || "Import eșuat");

      const summary = data.summary;
      const result: ImportResult = {
        location: locationKey,
        locationLabel: summary.location,
        totalLines: summary.totalLines,
        validLines: summary.validLines,
        invalidLines: data.errors || [],
        productsCreated: summary.created,
        productsUpdated: summary.updated,
        totalQuantity: summary.totalQuantity,
        uniqueProducts: summary.uniqueProducts,
      };

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
  }, [queryClient, toast]);

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
    const headers = ["Linie", "Descriere", "Cod", "Eroare"];
    const rows = result.invalidLines.map(l => [l.line, l.description, l.barcode, l.reason]);
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
            Import Inventar din Fișiere CSV/Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Importă stocul din fișiere <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> sau <strong>.txt</strong>. 
            Format: 3 coloane — <code className="text-xs bg-muted px-1 rounded">Descriere | Cantitate | Cod (17 cifre)</code>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-dashed">
              <CardContent className="p-4 text-center space-y-3">
                <Warehouse className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium text-sm">Depozit Central</p>
                <Button variant="outline" size="sm" disabled={isImporting} onClick={() => fileRefDepozit.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" />
                  {isImporting ? "Se importă..." : "Selectează fișier"}
                </Button>
                <input ref={fileRefDepozit} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleDepozitFile} />
              </CardContent>
            </Card>
            <Card className="border-dashed">
              <CardContent className="p-4 text-center space-y-3">
                <Store className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium text-sm">Magazin Ferdinand</p>
                <Button variant="outline" size="sm" disabled={isImporting} onClick={() => fileRefMagazin.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" />
                  {isImporting ? "Se importă..." : "Selectează fișier"}
                </Button>
                <input ref={fileRefMagazin} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleMagazinFile} />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

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
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Produse Unice</p>
                <p className="text-lg font-bold font-mono">{result.uniqueProducts}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Create / Actualiz.</p>
                <p className="text-lg font-bold font-mono">{result.productsCreated} / {result.productsUpdated}</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${result.invalidLines.length > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Erori</p>
                <p className={`text-lg font-bold font-mono ${result.invalidLines.length > 0 ? "text-destructive" : ""}`}>{result.invalidLines.length}</p>
              </div>
            </div>

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
                        <TableHead>Cod</TableHead>
                        <TableHead>Eroare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.invalidLines.slice(0, 10).map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{line.line}</TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">{line.description}</TableCell>
                          <TableCell className="font-mono text-xs">{line.barcode || "—"}</TableCell>
                          <TableCell className="text-xs text-destructive">{line.reason}</TableCell>
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

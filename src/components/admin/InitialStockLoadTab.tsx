import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, PackageCheck, AlertTriangle, Warehouse, Store, Search, FileDown } from "lucide-react";
import * as XLSX from "xlsx";

interface EntryResult {
  barcode: string;
  baseId: string;
  productName: string;
  quantity: number;
  status: "ok" | "error";
  reason?: string;
}

interface Summary {
  total: number;
  success: number;
  errors: number;
  location: string;
  exactMatches?: number;
  unmatchedRows?: number;
  collisions?: number;
  zeroQuantityRowsDetected?: number;
  zeroQuantityRowsAssigned?: number;
  inventoryStockWriteErrors?: number;
  writeMode?: string;
  writesTo?: string[];
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

async function fileToCSV(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // rawNumbers: true ensures numeric values are output as raw numbers, not formatted text
    // This prevents quantities like 1000 from being output as "0" or "" due to cell formatting
    return XLSX.utils.sheet_to_csv(sheet, { FS: "\t", rawNumbers: true });
  }
  const rawText = await file.text();
  return rawText.split(/\r?\n/).map(line => line.replace(/,+$/, "")).join("\n");
}

export default function InitialStockLoadTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Manual entry state
  const [manualBarcode, setManualBarcode] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualLocation, setManualLocation] = useState<"depozit" | "magazin">("depozit");

  // Results
  const [results, setResults] = useState<EntryResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bulkLocation, setBulkLocation] = useState<"depozit" | "magazin">("depozit");
  const [zeroQtyDebugRows, setZeroQtyDebugRows] = useState<ZeroQuantityDebugRow[]>([]);

  const zeroQtyFlattenedRows = zeroQtyDebugRows.flatMap((group) =>
    group.sourceRows.map((sourceRow) => ({
      stableKey: group.stableKey,
      matchStatus: group.matchStatus,
      matchedProductId: group.matchedProductId,
      matchedProductName: group.matchedProductName,
      assignedQuantity: group.assignedQuantity,
      reason: group.reason,
      sourceLineNumber: sourceRow.sourceLineNumber,
      sourceProductName: sourceRow.sourceProductName,
      barcode: sourceRow.barcode,
      rawQuantity: sourceRow.rawQuantity,
      parsedQuantity: sourceRow.parsedQuantity,
      delimiter: sourceRow.delimiter,
    })),
  );

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["products-admin"] });
    queryClient.invalidateQueries({ queryKey: ["products-pos"] });
    queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
    queryClient.invalidateQueries({ queryKey: ["products-inventory"] });
  };

  const handleManualSubmit = useCallback(async () => {
    if (!manualBarcode.trim() || !manualQty.trim()) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("initial-stock-load", {
        body: { mode: "single", barcode: manualBarcode.trim(), quantity: Number(manualQty), location: manualLocation },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Eroare");

      setResults(data.results || []);
      setSummary(data.summary);
      setZeroQtyDebugRows((data.debug?.zeroQuantityRows || []) as ZeroQuantityDebugRow[]);
      invalidateQueries();

      const ok = (data.results || []).filter((r: EntryResult) => r.status === "ok");
      if (ok.length > 0) {
        toast({ title: `✅ Stoc setat: ${ok[0].productName}`, description: `${ok[0].quantity} buc → ${data.summary.location}` });
        setManualBarcode("");
        setManualQty("");
      } else {
        toast({ title: "Eroare", description: data.results?.[0]?.reason || "Produs negăsit", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [manualBarcode, manualQty, manualLocation, queryClient, toast]);

  const handleBulkFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const csvText = await fileToCSV(file);
      const { data, error } = await supabase.functions.invoke("initial-stock-load", {
        body: { mode: "bulk", csvText, location: bulkLocation },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Eroare");

      setResults(data.results || []);
      setSummary(data.summary);
      setZeroQtyDebugRows((data.debug?.zeroQuantityRows || []) as ZeroQuantityDebugRow[]);
      invalidateQueries();
      toast({
        title: `✅ Încărcare stoc inițial finalizată`,
        description: `${data.summary.success} produse actualizate, ${data.summary.errors} erori — ${data.summary.location}`,
      });
    } catch (err: any) {
      toast({ title: "Eroare la import", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [bulkLocation, queryClient, toast]);

  const downloadErrors = () => {
    const errorRows = results.filter(r => r.status === "error");
    if (errorRows.length === 0) return;
    const headers = ["Barcode", "BaseID", "Produs", "Cantitate", "Eroare"];
    const rows = errorRows.map(r => [r.barcode, r.baseId, r.productName, r.quantity, r.reason || ""]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erori-incarcare-stoc.csv";
    a.click();
  };

  const downloadZeroQtyDebug = () => {
    if (zeroQtyFlattenedRows.length === 0) return;
    const headers = [
      "StableKey",
      "MatchStatus",
      "MatchedProductId",
      "MatchedProductName",
      "AssignedQuantity",
      "SourceLine",
      "SourceProductName",
      "SourceBarcode",
      "RawQuantityFromExcel",
      "ParsedQuantity",
      "Delimiter",
      "Reason",
    ];
    const rows = zeroQtyFlattenedRows.map((r) => [
      r.stableKey,
      r.matchStatus,
      r.matchedProductId || "",
      r.matchedProductName || "",
      r.assignedQuantity,
      r.sourceLineNumber,
      r.sourceProductName,
      r.barcode,
      r.rawQuantity,
      r.parsedQuantity,
      r.delimiter,
      r.reason,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debug-zero-quantity-rows.csv";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Manual entry */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Încărcare Manuală — Produs Existent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Introduci codul de bare al unui produs <strong>deja existent</strong> și cantitatea exactă. Stocul va fi <strong>SETAT</strong> la valoarea introdusă (nu adăugat).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Cod de bare (17 cifre)</Label>
              <Input
                value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value)}
                placeholder="99990110101110000"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Cantitate</Label>
              <Input
                type="number"
                min={0}
                value={manualQty}
                onChange={e => setManualQty(e.target.value)}
                placeholder="666"
              />
            </div>
            <div>
              <Label className="text-xs">Locație</Label>
              <div className="flex gap-2">
                <Button
                  variant={manualLocation === "depozit" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => setManualLocation("depozit")}
                >
                  <Warehouse className="h-3 w-3" />Depozit
                </Button>
                <Button
                  variant={manualLocation === "magazin" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => setManualLocation("magazin")}
                >
                  <Store className="h-3 w-3" />Magazin
                </Button>
              </div>
            </div>
            <Button onClick={handleManualSubmit} disabled={isLoading || !manualBarcode.trim() || !manualQty.trim()}>
              <PackageCheck className="h-4 w-4 mr-1" />
              {isLoading ? "Se procesează..." : "Setează Stoc"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk import */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Încărcare în Masă din Fișier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Format fișier: <code className="text-xs bg-muted px-1 rounded">Descriere | Cantitate | Cod (17 cifre)</code> sau <code className="text-xs bg-muted px-1 rounded">Cod | Cantitate</code>.
            Doar produse <strong>existente</strong> — nu se creează produse noi.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <Button
                variant={bulkLocation === "depozit" ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => setBulkLocation("depozit")}
              >
                <Warehouse className="h-3 w-3" />Depozit
              </Button>
              <Button
                variant={bulkLocation === "magazin" ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => setBulkLocation("magazin")}
              >
                <Store className="h-3 w-3" />Magazin
              </Button>
            </div>
            <Button variant="outline" size="sm" disabled={isLoading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3 mr-1" />
              {isLoading ? "Se procesează..." : "Selectează fișier"}
            </Button>
            <input ref={fileRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleBulkFile} />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-green-500" />
                Rezultat — {summary.location}
              </span>
              <div className="flex items-center gap-2">
                {zeroQtyFlattenedRows.length > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadZeroQtyDebug}>
                    <FileDown className="h-3 w-3 mr-1" />Debug qty=0 ({zeroQtyFlattenedRows.length})
                  </Button>
                )}
                {results.filter(r => r.status === "error").length > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <FileDown className="h-3 w-3 mr-1" />Erori ({results.filter(r => r.status === "error").length})
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-lg font-bold font-mono">{summary.total}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Succes</p>
                <p className="text-lg font-bold font-mono text-green-500">{summary.success}</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${summary.errors > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Erori</p>
                <p className={`text-lg font-bold font-mono ${summary.errors > 0 ? "text-destructive" : ""}`}>{summary.errors}</p>
              </div>
            </div>

            {(summary.zeroQuantityRowsDetected ?? 0) > 0 && (
              <div className="rounded-md border p-3 mb-4">
                <p className="text-xs text-muted-foreground">Debug qty=0</p>
                <p className="font-mono text-sm">
                  Detectate: {summary.zeroQuantityRowsDetected ?? 0} | Alocate: {summary.zeroQuantityRowsAssigned ?? 0} | inventory_stock errors: {summary.inventoryStockWriteErrors ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Scriere stoc: {summary.writeMode || "—"} → {(summary.writesTo || []).join(", ")}
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div className="overflow-auto max-h-80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Base ID</TableHead>
                      <TableHead>Produs</TableHead>
                      <TableHead className="text-right">Cantitate</TableHead>
                      <TableHead>Detalii</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {r.status === "ok" ? (
                            <Badge className="bg-green-500/20 text-green-600 text-xs">OK</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Eroare</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.baseId || "—"}</TableCell>
                        <TableCell className="text-sm">{r.productName || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {r.status === "error" ? (
                            <span className="text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />{r.reason}
                            </span>
                          ) : "Stoc setat"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {zeroQtyFlattenedRows.length > 0 && (
              <div className="mt-4 overflow-auto max-h-80 rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stable Key</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Produs sursă</TableHead>
                      <TableHead className="text-right">Raw qty (Excel)</TableHead>
                      <TableHead className="text-right">Parsed qty</TableHead>
                      <TableHead>Status match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zeroQtyFlattenedRows.map((r, idx) => (
                      <TableRow key={`${r.stableKey}-${r.sourceLineNumber}-${idx}`}>
                        <TableCell className="font-mono text-xs">{r.stableKey}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sourceLineNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{r.barcode}</TableCell>
                        <TableCell className="text-xs">{r.sourceProductName || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{r.rawQuantity}</TableCell>
                        <TableCell className="text-right font-mono">{r.parsedQuantity}</TableCell>
                        <TableCell className="text-xs">{r.matchStatus}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Tag, FileDown, CheckCircle2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

interface OverrideRow {
  barcode: string;
  stableKey: string;
  newPrice: number;
  productId: string | null;
  productName: string | null;
  oldPrice: number | null;
  barcodePrice: number | null;
  status: "pending" | "updated" | "not_found" | "collision" | "error";
  reason?: string;
  isPriceOverridden: boolean;
}

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

function extractPriceFromBarcode(barcode: string): number | null {
  if (!/^\d{17}$/.test(barcode)) return null;
  const p = parseInt(barcode.slice(-4), 10);
  return isNaN(p) ? null : p;
}

export default function PriceOverrideImportTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplied, setIsApplied] = useState(false);

  const parseExcel = useCallback(async (file: File): Promise<Array<{ barcode: string; price: number }>> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellText: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    forceSheetCellsToText(sheet);
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "", blankrows: false });
    if (data.length === 0) return [];

    const keys = Object.keys(data[0]);
    const codKey = keys.find(k => /^cod$/i.test(k.trim())) || keys.find(k => /cod|barcode/i.test(k.trim()));
    const priceKey = keys.find(k => /^pret$/i.test(k.trim())) || keys.find(k => /pret|price|pv/i.test(k.trim()));

    if (!codKey || !priceKey) {
      throw new Error(`Coloane negăsite. Am nevoie de 'Cod' și 'Pret'. Am găsit: ${JSON.stringify(keys)}`);
    }

    const result: Array<{ barcode: string; price: number }> = [];
    for (const row of data) {
      const barcode = String(row[codKey] ?? "").trim();
      const priceStr = String(row[priceKey] ?? "").trim().replace(/[^\d.,]/g, "").replace(",", ".");
      const price = parseFloat(priceStr);
      if (!barcode || isNaN(price) || price <= 0) continue;
      result.push({ barcode, price: Math.round(price) });
    }
    return result;
  }, []);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setIsApplied(false);

    try {
      const parsed = await parseExcel(file);
      if (parsed.length === 0) {
        toast({ title: "Fișier gol", description: "Nu s-au găsit rânduri valide.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      // Group by stable_key, take the price from the first barcode for that key
      // (all barcodes in same stable_key group should have the same override price)
      const byStableKey = new Map<string, { barcode: string; price: number }>();
      for (const p of parsed) {
        const sk = p.barcode.length >= 7 ? p.barcode.substring(0, 7) : p.barcode;
        if (!byStableKey.has(sk)) {
          byStableKey.set(sk, p);
        }
      }

      // Fetch all products
      const allProducts: any[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase.from("products").select("id, base_id, name, selling_price, full_barcode").eq("active", true).range(offset, offset + 999);
        if (!data || data.length === 0) break;
        allProducts.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }

      const productsByBaseId = new Map<string, any[]>();
      for (const p of allProducts) {
        const arr = productsByBaseId.get(p.base_id) || [];
        arr.push(p);
        productsByBaseId.set(p.base_id, arr);
      }

      const overrideRows: OverrideRow[] = [];
      for (const [sk, entry] of byStableKey) {
        const matches = productsByBaseId.get(sk);
        const barcodePrice = extractPriceFromBarcode(entry.barcode);

        if (!matches || matches.length === 0) {
          overrideRows.push({
            barcode: entry.barcode, stableKey: sk, newPrice: entry.price,
            productId: null, productName: null, oldPrice: null, barcodePrice,
            status: "not_found", reason: "Produs negăsit",
            isPriceOverridden: false,
          });
        } else if (matches.length > 1) {
          overrideRows.push({
            barcode: entry.barcode, stableKey: sk, newPrice: entry.price,
            productId: null, productName: matches.map((m: any) => m.name).join(" | "),
            oldPrice: null, barcodePrice,
            status: "collision", reason: `${matches.length} produse cu același base_id`,
            isPriceOverridden: false,
          });
        } else {
          const prod = matches[0];
          const oldPrice = Number(prod.selling_price || 0);
          overrideRows.push({
            barcode: entry.barcode, stableKey: sk, newPrice: entry.price,
            productId: prod.id, productName: prod.name,
            oldPrice, barcodePrice,
            status: "pending",
            isPriceOverridden: entry.price !== barcodePrice,
          });
        }
      }

      setRows(overrideRows);
    } catch (err: any) {
      toast({ title: "Eroare la parsare", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [parseExcel, toast]);

  const applyOverrides = useCallback(async () => {
    const pendingRows = rows.filter(r => r.status === "pending" && r.productId);
    if (pendingRows.length === 0) return;
    setIsLoading(true);

    let successCount = 0;
    let errorCount = 0;
    const updatedRows = [...rows];

    for (const row of pendingRows) {
      const { error } = await supabase
        .from("products")
        .update({ selling_price: row.newPrice })
        .eq("id", row.productId!);

      const idx = updatedRows.findIndex(r => r.productId === row.productId);
      if (error) {
        errorCount++;
        updatedRows[idx] = { ...row, status: "error", reason: error.message };
      } else {
        successCount++;
        updatedRows[idx] = { ...row, status: "updated" };
      }
    }

    setRows(updatedRows);
    setIsApplied(true);
    setIsLoading(false);
    queryClient.invalidateQueries({ queryKey: ["products-admin"] });
    toast({
      title: `✅ Prețuri actualizate: ${successCount}`,
      description: errorCount > 0 ? `${errorCount} erori` : "Toate prețurile au fost aplicate. Re-importă stocul pentru recalculare valori.",
    });
  }, [rows, queryClient, toast]);

  const downloadReport = () => {
    const headers = ["Barcode", "StableKey", "BarcodePrice", "OldSellingPrice", "NewPrice", "IsPriceOverridden", "Status", "ProductName", "Reason"];
    const csvRows = rows.map(r => [
      r.barcode, r.stableKey, r.barcodePrice ?? "", r.oldPrice ?? "",
      r.newPrice, r.isPriceOverridden, r.status, r.productName ?? "", r.reason ?? "",
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "price-override-report.csv"; a.click();
  };

  const pendingCount = rows.filter(r => r.status === "pending").length;
  const updatedCount = rows.filter(r => r.status === "updated").length;
  const errorCount = rows.filter(r => r.status === "error" || r.status === "not_found" || r.status === "collision").length;
  const overriddenCount = rows.filter(r => r.isPriceOverridden).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Import Prețuri Corecte (Override)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Importă un Excel cu coloanele <code className="text-xs bg-muted px-1 rounded">Cod</code> (barcode 17 cifre) și <code className="text-xs bg-muted px-1 rounded">Pret</code> (preț corect).
          Prețul va fi salvat ca <strong>selling_price</strong> pe produs. La recalcularea stocului, acest preț va fi utilizat în loc de cel din barcode.
        </p>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={isLoading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" />
            {isLoading ? "Se procesează..." : "Selectează fișier Excel"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

          {rows.length > 0 && (
            <>
              {pendingCount > 0 && !isApplied && (
                <Button size="sm" onClick={applyOverrides} disabled={isLoading}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Aplică {pendingCount} prețuri
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={downloadReport}>
                <FileDown className="h-3 w-3 mr-1" />Raport CSV
              </Button>
            </>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-lg font-bold font-mono">{rows.length}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-green-500/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isApplied ? "Aplicate" : "De aplicat"}
                </p>
                <p className="text-lg font-bold font-mono text-green-500">
                  {isApplied ? updatedCount : pendingCount}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-500/10">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preț diferit</p>
                <p className="text-lg font-bold font-mono text-amber-600">{overriddenCount}</p>
              </div>
              <div className={`text-center p-2 rounded-lg ${errorCount > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Erori</p>
                <p className={`text-lg font-bold font-mono ${errorCount > 0 ? "text-destructive" : ""}`}>{errorCount}</p>
              </div>
            </div>

            <div className="overflow-auto max-h-96 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Stable Key</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right">Preț Barcode</TableHead>
                    <TableHead className="text-right">Preț Vechi</TableHead>
                    <TableHead className="text-right">Preț Nou</TableHead>
                    <TableHead>Override?</TableHead>
                    <TableHead>Detalii</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {r.status === "updated" && <Badge className="bg-green-500/20 text-green-600 text-xs">Aplicat</Badge>}
                        {r.status === "pending" && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                        {r.status === "not_found" && <Badge variant="destructive" className="text-xs">Negăsit</Badge>}
                        {r.status === "collision" && <Badge variant="destructive" className="text-xs">Coliziune</Badge>}
                        {r.status === "error" && <Badge variant="destructive" className="text-xs">Eroare</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.stableKey}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{r.productName || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.barcodePrice ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.oldPrice ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{r.newPrice}</TableCell>
                      <TableCell>
                        {r.isPriceOverridden ? (
                          <Badge className="bg-amber-500/20 text-amber-600 text-xs">Da</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nu</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {r.reason && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />{r.reason}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

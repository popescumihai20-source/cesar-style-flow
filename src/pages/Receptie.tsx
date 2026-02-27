import { useState, useCallback } from "react";
import { Truck, Plus, Trash2, CheckCircle } from "lucide-react";
import { ExcelImport, type ExcelRow } from "@/components/receptie/ExcelImport";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { generateBarcode } from "@/lib/barcode-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ReceiptRow {
  id: string;
  articol: string;
  model: string;
  producator: string;
  dataReceptie: string;
  sellingPrice: number;
  costPrice: number;
}

function buildBaseId(articol: string, model: string, producator: string): string {
  const a = articol.padStart(2, "0").substring(0, 2);
  const m = model.padStart(2, "0").substring(0, 2);
  const p = producator.padStart(2, "0").substring(0, 2);
  return a + m + p + "0"; // 7 digits: articol(2)+model/culoare(2)+producator(2)+flag(1)
}

function parseDateFromField(dateStr: string): Date | null {
  // Accept DD/MM/YYYY or DDMMYYYY or DDMMYY
  const cleaned = dateStr.replace(/[\/\-\.]/g, "");
  if (cleaned.length === 8) {
    const d = parseInt(cleaned.substring(0, 2));
    const m = parseInt(cleaned.substring(2, 4)) - 1;
    const y = parseInt(cleaned.substring(4, 8));
    return new Date(y, m, d);
  }
  if (cleaned.length === 6) {
    const d = parseInt(cleaned.substring(0, 2));
    const m = parseInt(cleaned.substring(2, 4)) - 1;
    const y = 2000 + parseInt(cleaned.substring(4, 6));
    return new Date(y, m, d);
  }
  return null;
}

export default function Receptie() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addRow = useCallback(() => {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      articol: "", model: "", producator: "",
      dataReceptie: "", sellingPrice: 0, costPrice: 0,
    }]);
  }, []);

  const handleExcelImport = useCallback((excelRows: ExcelRow[]) => {
    const newRows: ReceiptRow[] = excelRows.map(er => ({
      id: crypto.randomUUID(),
      articol: er.articol,
      model: er.model,
      producator: er.producator,
      dataReceptie: er.data,
      sellingPrice: er.pretVanzare,
      costPrice: er.pretAchizitie,
    }));
    setRows(prev => [...prev, ...newRows]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<ReceiptRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.articol && r.producator);
    if (validRows.length === 0) {
      toast({ title: "Completează cel puțin articol și producător", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      // Create receipt
      const { data: receipt, error: receiptError } = await supabase
        .from("stock_receipts")
        .insert({ notes: notes || null })
        .select()
        .single();
      if (receiptError) throw receiptError;

      for (const row of validRows) {
        const baseId = buildBaseId(row.articol, row.model, row.producator);
        const entryDate = parseDateFromField(row.dataReceptie) || new Date();
        const barcode = generateBarcode(baseId, null, entryDate, Math.round(row.sellingPrice));

        // Check if product exists by base_id
        const { data: existing } = await supabase
          .from("products")
          .select("id, stock_general")
          .eq("base_id", baseId)
          .maybeSingle();

        let productId: string;

        if (existing) {
          // Update stock
          await supabase.from("products").update({
            stock_general: existing.stock_general + 1,
            cost_price: row.costPrice,
            selling_price: row.sellingPrice,
            last_received_at: new Date().toISOString(),
            active: true,
          }).eq("id", existing.id);
          productId = existing.id;
        } else {
          // Create new product
          const { data: newProduct, error: prodErr } = await supabase
            .from("products")
            .insert({
              base_id: baseId,
              name: `${row.articol}-${row.model}-${row.producator}`,
              cost_price: row.costPrice,
              selling_price: row.sellingPrice,
              stock_general: 1,
              active: true,
              last_received_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (prodErr) throw prodErr;
          productId = newProduct.id;
        }

        // Create receipt item
        await supabase.from("stock_receipt_items").insert({
          receipt_id: receipt.id,
          product_id: productId,
          quantity: 1,
          cost_price: row.costPrice,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      toast({ title: "✅ Recepție salvată", description: `${validRows.length} articole recepționate` });
      setRows([]);
      setNotes("");
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Recepție Marfă</h1>
            <p className="text-xs text-muted-foreground">Adaugă produse în stoc — codul de bare se generează automat</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExcelImport onImport={handleExcelImport} />
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" />Adaugă Rând</Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || rows.length === 0}>
            <CheckCircle className="h-4 w-4 mr-1" />{isSubmitting ? "Se salvează..." : "Salvează Recepția"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Articol (2 cifre)</TableHead>
                <TableHead>Model / Culoare (2 cifre)</TableHead>
                <TableHead>Producător (2 cifre)</TableHead>
                <TableHead>Data (ZZ/LL/AAAA)</TableHead>
                <TableHead className="text-right w-28">Preț Vânzare</TableHead>
                <TableHead className="text-right w-28">Preț Achiziție</TableHead>
                <TableHead className="w-20">Cod Bare</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const canGenerate = row.articol.length >= 2 && row.model.length >= 2 && row.producator.length >= 2;
                const generatedBarcode = canGenerate
                  ? generateBarcode(
                      buildBaseId(row.articol, row.model, row.producator),
                      null,
                      parseDateFromField(row.dataReceptie) || new Date(),
                      Math.round(row.sellingPrice)
                    )
                  : "—";

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Input value={row.articol} onChange={e => updateRow(row.id, { articol: e.target.value })} className="h-8 text-xs w-20 font-mono" placeholder="01" maxLength={2} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.model} onChange={e => updateRow(row.id, { model: e.target.value })} className="h-8 text-xs w-20 font-mono" placeholder="01" maxLength={2} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.producator} onChange={e => updateRow(row.id, { producator: e.target.value })} className="h-8 text-xs w-20 font-mono" placeholder="01" maxLength={2} />
                    </TableCell>
                    <TableCell>
                      <Input value={row.dataReceptie} onChange={e => updateRow(row.id, { dataReceptie: e.target.value })} className="h-8 w-28 text-xs" placeholder="27/02/2026" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={row.sellingPrice} onChange={e => updateRow(row.id, { sellingPrice: parseFloat(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={row.costPrice} onChange={e => updateRow(row.id, { costPrice: parseFloat(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">{generatedBarcode}</span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(row.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Importă un fișier Excel sau apasă "Adaugă Rând" pentru a începe recepția
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardContent className="p-3">
          <Label>Note recepție (opțional)</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observații, furnizor, nr. factură..." className="mt-1" />
        </CardContent>
      </Card>
    </div>
  );
}

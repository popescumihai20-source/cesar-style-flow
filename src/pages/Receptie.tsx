import { useState, useCallback } from "react";
import { Truck, Plus, Trash2, CheckCircle } from "lucide-react";
import { ExcelImport, type ExcelRow } from "@/components/receptie/ExcelImport";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { generateBarcode } from "@/lib/barcode-parser";
import { BarcodePreview } from "@/components/receptie/BarcodePreview";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { useColorDictionary } from "@/hooks/use-color-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ReceiptRow {
  id: string;
  articolCode: string;
  modelCode: string;
  producatorCode: string;
  permanent: boolean;
  dataReceptie: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
}

function buildBaseId(articol: string, model: string, producator: string, permanent: boolean): string {
  const a = articol.padStart(2, "0").substring(0, 2);
  const m = model.padStart(2, "0").substring(0, 2);
  const p = producator.padStart(2, "0").substring(0, 2);
  return a + m + p + (permanent ? "1" : "0"); // 7 digits
}

function parseDateFromField(dateStr: string): Date | null {
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

  const { activeEntries: articolEntries } = useArticolDictionary();
  const { activeProducatori } = useProducatorDictionary();
  const { activeColors } = useColorDictionary();

  const addRow = useCallback(() => {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      articolCode: "", modelCode: "", producatorCode: "",
      permanent: true, dataReceptie: "", sellingPrice: 0, costPrice: 0, quantity: 1,
    }]);
  }, []);

  const handleExcelImport = useCallback((excelRows: ExcelRow[]) => {
    const newRows: ReceiptRow[] = excelRows.map(er => {
      // Try to match articol by code or name
      const artMatch = articolEntries.find(a => a.code === er.articol || a.name.toLowerCase() === er.articol.toLowerCase());
      const prodMatch = activeProducatori.find(p => p.code === er.producator || p.name.toLowerCase() === er.producator.toLowerCase());
      const colorMatch = activeColors.find(c => c.code === er.model || c.name.toLowerCase() === er.model.toLowerCase());

      return {
        id: crypto.randomUUID(),
        articolCode: artMatch?.code || er.articol,
        modelCode: colorMatch?.code || er.model,
        producatorCode: prodMatch?.code || er.producator,
        permanent: true,
        dataReceptie: er.data,
        sellingPrice: er.pretVanzare,
        costPrice: er.pretAchizitie,
        quantity: 1,
      };
    });
    setRows(prev => [...prev, ...newRows]);
  }, [articolEntries, activeProducatori, activeColors]);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<ReceiptRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.articolCode && r.producatorCode && r.modelCode);
    if (validRows.length === 0) {
      toast({ title: "Selectează articol, model și producător pentru cel puțin un rând", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: receipt, error: receiptError } = await supabase
        .from("stock_receipts")
        .insert({ notes: notes || null })
        .select()
        .single();
      if (receiptError) throw receiptError;

      for (const row of validRows) {
        const baseId = buildBaseId(row.articolCode, row.modelCode, row.producatorCode, row.permanent);
        const entryDate = parseDateFromField(row.dataReceptie) || new Date();

        const { data: existing } = await supabase
          .from("products")
          .select("id, stock_general")
          .eq("base_id", baseId)
          .maybeSingle();

        let productId: string;

        if (existing) {
          await supabase.from("products").update({
            stock_general: existing.stock_general + row.quantity,
            cost_price: row.costPrice,
            selling_price: row.sellingPrice,
            last_received_at: new Date().toISOString(),
            active: true,
          }).eq("id", existing.id);
          productId = existing.id;
        } else {
          const artName = articolEntries.find(a => a.code === row.articolCode)?.name || row.articolCode;
          const colorName = activeColors.find(c => c.code === row.modelCode)?.name || row.modelCode;
          const prodName = activeProducatori.find(p => p.code === row.producatorCode)?.name || row.producatorCode;

          const { data: newProduct, error: prodErr } = await supabase
            .from("products")
            .insert({
              base_id: baseId,
              name: `${artName} ${colorName} ${prodName}`,
              cost_price: row.costPrice,
              selling_price: row.sellingPrice,
              stock_general: row.quantity,
              active: true,
              last_received_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (prodErr) throw prodErr;
          productId = newProduct.id;
        }

        await supabase.from("stock_receipt_items").insert({
          receipt_id: receipt.id,
          product_id: productId,
          quantity: row.quantity,
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
            <p className="text-xs text-muted-foreground">Selectează din dicționare — codul de bare (17 cifre) se generează automat</p>
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
                <TableHead className="w-40">Articol</TableHead>
                <TableHead className="w-40">Model / Culoare</TableHead>
                <TableHead className="w-40">Producător</TableHead>
                <TableHead className="w-28">Data</TableHead>
                <TableHead className="text-right w-20">Cant.</TableHead>
                <TableHead className="text-right w-28">Preț Vânzare</TableHead>
                <TableHead className="text-right w-28">Preț Achiziție</TableHead>
                <TableHead className="w-36">Cod Bare</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const canGenerate = /^\d{2}$/.test(row.articolCode) && /^\d{2}$/.test(row.modelCode) && /^\d{2}$/.test(row.producatorCode);
                const generatedBarcode = canGenerate
                  ? generateBarcode(
                      row.articolCode,
                      row.modelCode,
                      row.producatorCode,
                      row.permanent,
                      parseDateFromField(row.dataReceptie) || new Date(),
                      Math.round(row.sellingPrice)
                    )
                  : "";

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Select value={row.articolCode} onValueChange={v => updateRow(row.id, { articolCode: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Articol..." />
                        </SelectTrigger>
                        <SelectContent>
                          {articolEntries.map(a => (
                            <SelectItem key={a.id} value={a.code}>{a.code} — {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={row.modelCode} onValueChange={v => updateRow(row.id, { modelCode: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Culoare..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeColors.map(c => (
                            <SelectItem key={c.id} value={c.code}>{c.code} — {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={row.producatorCode} onValueChange={v => updateRow(row.id, { producatorCode: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Producător..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeProducatori.map(p => (
                            <SelectItem key={p.id} value={p.code}>{p.code} — {p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input value={row.dataReceptie} onChange={e => updateRow(row.id, { dataReceptie: e.target.value })} className="h-8 w-28 text-xs" placeholder="27/02/2026" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={row.quantity} onChange={e => updateRow(row.id, { quantity: parseInt(e.target.value) || 1 })} min={1} className="h-8 w-16 text-right text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={row.sellingPrice} onChange={e => updateRow(row.id, { sellingPrice: parseFloat(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={row.costPrice} onChange={e => updateRow(row.id, { costPrice: parseFloat(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                    </TableCell>
                    <TableCell>
                      <BarcodePreview value={generatedBarcode} />
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
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
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

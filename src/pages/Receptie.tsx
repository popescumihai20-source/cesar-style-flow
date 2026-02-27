import { useState, useCallback } from "react";
import { Truck, Plus, Trash2, Search, Save, CheckCircle, Camera } from "lucide-react";
import { BarcodeScanner } from "@/components/scanner/BarcodeScanner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseBarcode } from "@/lib/barcode-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ReceiptRow {
  id: string;
  productId: string | null;
  productName: string;
  baseId: string;
  variantCode: string;
  quantity: number;
  costPrice: number;
}

export default function Receptie() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [notes, setNotes] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRowId, setSearchRowId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannerRowId, setScannerRowId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["products-pos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const addRow = useCallback(() => {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      productId: null, productName: "", baseId: "",
      variantCode: "", quantity: 1, costPrice: 0,
    }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<ReceiptRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleBarcodeScan = useCallback((rowId: string, barcode: string) => {
    const parsed = parseBarcode(barcode.trim());
    if (!parsed.isValid) {
      toast({ title: "Cod invalid", description: parsed.error, variant: "destructive" });
      return;
    }
    const product = products.find(p => p.base_id === parsed.baseId);
    if (product) {
      updateRow(rowId, {
        productId: product.id,
        productName: product.name,
        baseId: product.base_id,
        variantCode: parsed.variantCode || "",
        costPrice: product.cost_price,
      });
    } else {
      updateRow(rowId, { baseId: parsed.baseId, variantCode: parsed.variantCode || "" });
      toast({ title: "Produs negăsit", description: `Base ID: ${parsed.baseId} — selectează manual`, variant: "destructive" });
    }
  }, [products, updateRow, toast]);

  const openSearchForRow = (rowId: string) => {
    setSearchRowId(rowId);
    setSearchQuery("");
    setShowSearch(true);
  };

  const selectProductForRow = (product: any) => {
    if (searchRowId) {
      updateRow(searchRowId, {
        productId: product.id,
        productName: product.name,
        baseId: product.base_id,
        costPrice: product.cost_price,
      });
    }
    setShowSearch(false);
  };

  const filteredProducts = searchQuery.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.base_id.includes(searchQuery))
    : [];

  const handleSubmit = async () => {
    const validRows = rows.filter(r => r.productId && r.quantity > 0);
    if (validRows.length === 0) {
      toast({ title: "Adaugă cel puțin un produs valid", variant: "destructive" });
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

      // Create receipt items
      const items = validRows.map(r => ({
        receipt_id: receipt.id,
        product_id: r.productId!,
        variant_code: r.variantCode || null,
        quantity: r.quantity,
        cost_price: r.costPrice,
      }));
      const { error: itemsError } = await supabase.from("stock_receipt_items").insert(items);
      if (itemsError) throw itemsError;

      // Update stock for each product
      for (const row of validRows) {
        const product = products.find(p => p.id === row.productId);
        if (product) {
          await supabase.from("products").update({
            stock_general: product.stock_general + row.quantity,
            last_received_at: new Date().toISOString(),
            active: true,
          }).eq("id", product.id);

          // Update variant stock if applicable
          if (row.variantCode) {
            const { data: variant } = await supabase
              .from("product_variants")
              .select("*")
              .eq("product_id", product.id)
              .eq("variant_code", row.variantCode)
              .single();
            if (variant) {
              await supabase.from("product_variants")
                .update({ stock_variant: variant.stock_variant + row.quantity })
                .eq("id", variant.id);
            }
          }
        }
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
            <p className="text-xs text-muted-foreground">Adaugă produse în stoc</p>
          </div>
        </div>
        <div className="flex gap-2">
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
                <TableHead className="w-[200px]">Cod de bare / Produs</TableHead>
                <TableHead>Produs</TableHead>
                <TableHead>Variantă</TableHead>
                <TableHead className="text-right w-24">Cantitate</TableHead>
                <TableHead className="text-right w-32">Preț Achiziție</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex gap-1">
                      <Input
                        placeholder="Scanează cod..."
                        className="h-8 text-xs font-mono"
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            handleBarcodeScan(row.id, (e.target as HTMLInputElement).value);
                          }
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openSearchForRow(row.id)}>
                        <Search className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setScannerRowId(row.id)}>
                        <Camera className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.productName || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Input value={row.variantCode} onChange={e => updateRow(row.id, { variantCode: e.target.value })} className="h-8 w-20 text-xs" placeholder="Cod" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={row.quantity} onChange={e => updateRow(row.id, { quantity: parseInt(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={row.costPrice} onChange={e => updateRow(row.id, { costPrice: parseFloat(e.target.value) || 0 })} className="h-8 text-right text-sm" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(row.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Apasă "Adaugă Rând" pentru a începe recepția
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

      {/* Search dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Selectează produs</DialogTitle></DialogHeader>
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Caută produs..." autoFocus />
          <div className="max-h-80 overflow-auto space-y-1">
            {filteredProducts.map(p => (
              <button key={p.id} className="w-full flex justify-between p-3 rounded-lg hover:bg-muted text-left" onClick={() => selectProductForRow(p)}>
                <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.base_id}</p></div>
                <div className="text-right text-sm"><p className="font-mono">{p.cost_price.toFixed(2)} RON</p><p className="text-xs text-muted-foreground">Stoc: {p.stock_general}</p></div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {/* Camera scanner */}
      <BarcodeScanner
        open={!!scannerRowId}
        onClose={() => setScannerRowId(null)}
        onScan={(barcode) => {
          if (scannerRowId) {
            handleBarcodeScan(scannerRowId, barcode);
          }
        }}
      />
    </div>
  );
}

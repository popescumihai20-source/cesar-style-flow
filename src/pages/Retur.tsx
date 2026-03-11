import { useState, useRef, useEffect, useCallback } from "react";
import { Search, RotateCcw, Package, CheckCircle, AlertTriangle, Barcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";
import { usePOS } from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SaleWithItems {
  id: string;
  internal_id: string;
  total: number;
  status: string;
  payment_method: string;
  created_at: string;
  cashier_employee_id: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    variant_code: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    is_gift: boolean;
  }[];
}

export default function Retur() {
  const { mode, cashierName, cashierEmployeeId, activateCashier } = usePOS();
  const { toast } = useToast();

  const [scanInput, setScanInput] = useState("");
  const [saleIdInput, setSaleIdInput] = useState("");
  const [foundSale, setFoundSale] = useState<SaleWithItems | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastReturnTotal, setLastReturnTotal] = useState(0);

  const scanRef = useRef<HTMLInputElement>(null);
  const cardScanRef = useRef<HTMLInputElement>(null);

  // Focus scan input
  useEffect(() => {
    if (mode === "casier" && scanRef.current) {
      scanRef.current.focus();
    }
  }, [mode]);

  // Handle cashier card scan
  const handleCardScan = useCallback(async (code: string) => {
    if (!code.trim()) return;
    // Look up employee by card code
    const { data: employees } = await supabase
      .from("employees")
      .select("*")
      .eq("employee_card_code", code.trim())
      .eq("active", true)
      .limit(1);

    if (employees && employees.length > 0) {
      activateCashier(employees[0].id, employees[0].name);
    }
  }, [activateCashier]);

  // Search sale by internal_id
  const handleSearchSale = async () => {
    const searchTerm = saleIdInput.trim();
    if (!searchTerm) return;

    const { data: sales, error } = await supabase
      .from("sales")
      .select("*")
      .eq("internal_id", searchTerm)
      .limit(1);

    if (error || !sales || sales.length === 0) {
      toast({ title: "Vânzare negăsită", description: `Nu am găsit vânzarea ${searchTerm}`, variant: "destructive" });
      return;
    }

    const sale = sales[0];

    if (sale.status === "returned") {
      toast({ title: "Deja returnată", description: "Această vânzare a fost deja returnată.", variant: "destructive" });
      return;
    }
    if (sale.status === "anulat") {
      toast({ title: "Anulată", description: "Această vânzare a fost anulată.", variant: "destructive" });
      return;
    }

    // Fetch sale items with product names
    const { data: items } = await supabase
      .from("sale_items")
      .select("*, products(name)")
      .eq("sale_id", sale.id);

    const saleWithItems: SaleWithItems = {
      ...sale,
      items: (items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "Produs necunoscut",
        variant_code: item.variant_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        is_gift: item.is_gift,
      })),
    };

    setFoundSale(saleWithItems);
    // Select all items by default
    const defaultSelected: Record<string, number> = {};
    saleWithItems.items.forEach((item) => {
      defaultSelected[item.id] = item.quantity;
    });
    setSelectedItems(defaultSelected);
  };

  // Handle barcode scan to find sale by product
  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode.trim()) return;

    // Find product by barcode
    const { data: products } = await supabase
      .from("products")
      .select("id, name, base_id")
      .eq("active", true)
      .eq("full_barcode", barcode.trim())
      .limit(1);

    if (!products || products.length === 0) {
      // Try base_id match
      const parsed = parseBarcode(barcode.trim());
      if (parsed) {
        const { data: baseProducts } = await supabase
          .from("products")
          .select("id, name, base_id")
          .eq("active", true)
          .eq("base_id", parsed.baseId)
          .limit(1);

        if (!baseProducts || baseProducts.length === 0) {
          toast({ title: "Produs negăsit", description: "Codul de bare nu corespunde niciunui produs.", variant: "destructive" });
          return;
        }
        await findRecentSaleForProduct(baseProducts[0].id, baseProducts[0].name);
        return;
      }
      toast({ title: "Cod invalid", description: "Codul scanat nu este valid.", variant: "destructive" });
      return;
    }

    await findRecentSaleForProduct(products[0].id, products[0].name);
  };

  const findRecentSaleForProduct = async (productId: string, productName: string) => {
    // Find recent sale_items for this product
    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("sale_id")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!saleItems || saleItems.length === 0) {
      toast({ title: "Nicio vânzare", description: `Produsul "${productName}" nu a fost vândut recent.`, variant: "destructive" });
      return;
    }

    // Find a non-returned sale
    const saleIds = [...new Set(saleItems.map((i) => i.sale_id))];
    const { data: sales } = await supabase
      .from("sales")
      .select("*")
      .in("id", saleIds)
      .not("status", "in", '("returned","anulat")')
      .order("created_at", { ascending: false })
      .limit(1);

    if (!sales || sales.length === 0) {
      toast({ title: "Nicio vânzare activă", description: "Toate vânzările pentru acest produs au fost returnate sau anulate.", variant: "destructive" });
      return;
    }

    // Load full sale
    setSaleIdInput(sales[0].internal_id);
    const sale = sales[0];
    const { data: items } = await supabase
      .from("sale_items")
      .select("*, products(name)")
      .eq("sale_id", sale.id);

    const saleWithItems: SaleWithItems = {
      ...sale,
      items: (items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "Produs necunoscut",
        variant_code: item.variant_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        is_gift: item.is_gift,
      })),
    };

    setFoundSale(saleWithItems);
    const defaultSelected: Record<string, number> = {};
    saleWithItems.items.forEach((item) => {
      if (item.product_id === productId) {
        defaultSelected[item.id] = item.quantity;
      }
    });
    setSelectedItems(defaultSelected);
  };

  const toggleItemSelection = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      if (prev[itemId]) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: maxQty };
    });
  };

  const updateItemQuantity = (itemId: string, qty: number, maxQty: number) => {
    if (qty <= 0) {
      setSelectedItems((prev) => {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setSelectedItems((prev) => ({
        ...prev,
        [itemId]: Math.min(qty, maxQty),
      }));
    }
  };

  const returnTotal = foundSale
    ? foundSale.items
        .filter((item) => selectedItems[item.id])
        .reduce((sum, item) => {
          const qty = selectedItems[item.id] || 0;
          return sum + item.unit_price * qty;
        }, 0)
    : 0;

  const handleProcessReturn = async () => {
    if (!foundSale || !cashierEmployeeId) return;
    setProcessing(true);

    try {
      // 1. Create return record
      const { data: returnRecord, error: returnError } = await supabase
        .from("returns")
        .insert({
          sale_id: foundSale.id,
          employee_id: cashierEmployeeId,
          reason: returnReason || null,
        })
        .select()
        .single();

      if (returnError) throw returnError;

      // 2. Create return items
      const returnItems = foundSale.items
        .filter((item) => selectedItems[item.id])
        .map((item) => ({
          return_id: returnRecord.id,
          sale_item_id: item.id,
          product_id: item.product_id,
          variant_code: item.variant_code,
          quantity: selectedItems[item.id],
          unit_price: item.unit_price,
          line_total: item.unit_price * selectedItems[item.id],
        }));

      const { error: itemsError } = await supabase
        .from("return_items")
        .insert(returnItems);

      if (itemsError) throw itemsError;

      // 3. Restore stock for each returned product
      for (const item of returnItems) {
        await supabase
          .from("products")
          .update({
            stock_general: (foundSale.items.find((i) => i.product_id === item.product_id)
              ? undefined
              : undefined),
          })
          .eq("id", item.product_id);

        // Increment stock using RPC or direct update
        const { data: currentProduct } = await supabase
          .from("products")
          .select("stock_general")
          .eq("id", item.product_id)
          .single();

        if (currentProduct) {
          await supabase
            .from("products")
            .update({ stock_general: currentProduct.stock_general + item.quantity })
            .eq("id", item.product_id);
        }

        // Also update inventory_stock for the magazin location
        const { data: stockRow } = await supabase
          .from("inventory_stock")
          .select("id, quantity")
          .eq("product_id", item.product_id)
          .eq("location_id", "3d748742-c069-4d7f-b441-1d670fffbcef")
          .maybeSingle();

        if (stockRow) {
          await supabase
            .from("inventory_stock")
            .update({ quantity: stockRow.quantity + item.quantity })
            .eq("id", stockRow.id);
        }
      }

      // 4. Check if all items are returned → mark sale as returned
      const allItemsReturned = foundSale.items.every(
        (item) => selectedItems[item.id] === item.quantity
      );

      if (allItemsReturned) {
        await supabase
          .from("sales")
          .update({ status: "returned" })
          .eq("id", foundSale.id);
      }

      setLastReturnTotal(returnTotal);
      setShowConfirm(false);
      setShowSuccess(true);

      // Reset
      setFoundSale(null);
      setSelectedItems({});
      setReturnReason("");
      setSaleIdInput("");

      toast({ title: "Retur procesat", description: `Returul a fost înregistrat cu succes.` });
    } catch (err: any) {
      console.error("[RETUR] Error:", err);
      toast({ title: "Eroare la retur", description: err.message || "A apărut o eroare.", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // PUBLIC MODE - Card scan to activate cashier
  if (mode === "public") {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <RotateCcw className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Modul Retur</CardTitle>
            <p className="text-sm text-muted-foreground">Scanează cardul de angajat pentru a începe</p>
          </CardHeader>
          <CardContent>
            <Input
              ref={cardScanRef}
              placeholder="Scanează card angajat..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCardScan(scanInput);
                  setScanInput("");
                }
              }}
              autoFocus
              className="text-center text-lg"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // CASHIER MODE
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RotateCcw className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Retur</h1>
            <p className="text-sm text-muted-foreground">Casier: {cashierName}</p>
          </div>
        </div>
      </div>

      {/* Search area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search by sale ID */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4" />
              Caută după ID vânzare
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: CES-000001"
                value={saleIdInput}
                onChange={(e) => setSaleIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearchSale();
                }}
              />
              <Button onClick={handleSearchSale} size="sm">
                Caută
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search by barcode scan */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Barcode className="h-4 w-4" />
              Scanează cod de bare produs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              ref={scanRef}
              placeholder="Scanează codul de bare..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleBarcodeScan((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Found sale details */}
      {foundSale && (
        <Card className="flex-1 overflow-auto">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Vânzare: {foundSale.internal_id}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {new Date(foundSale.created_at).toLocaleDateString("ro-RO")}
                </Badge>
                <Badge>{foundSale.payment_method}</Badge>
                <Badge variant="secondary">{foundSale.total} RON</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">✓</TableHead>
                  <TableHead>Produs</TableHead>
                  <TableHead className="text-right">Preț</TableHead>
                  <TableHead className="text-right">Cant. vândută</TableHead>
                  <TableHead className="text-right">Cant. retur</TableHead>
                  <TableHead className="text-right">Total retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {foundSale.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={selectedItems[item.id] ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={!!selectedItems[item.id]}
                        onChange={() => toggleItemSelection(item.id, item.quantity)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{item.product_name}</span>
                      {item.variant_code && (
                        <Badge variant="outline" className="ml-2 text-xs">{item.variant_code}</Badge>
                      )}
                      {item.is_gift && (
                        <Badge variant="secondary" className="ml-2 text-xs">Cadou</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{item.unit_price} RON</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {selectedItems[item.id] !== undefined ? (
                        <Input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={selectedItems[item.id]}
                          onChange={(e) =>
                            updateItemQuantity(item.id, parseInt(e.target.value) || 0, item.quantity)
                          }
                          className="w-16 text-right h-8 inline-block"
                        />
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {selectedItems[item.id]
                        ? `${(item.unit_price * selectedItems[item.id]).toFixed(0)} RON`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Reason */}
            <div className="mt-4">
              <label className="text-sm font-medium text-muted-foreground">Motiv retur (opțional)</label>
              <Textarea
                placeholder="Descrie motivul returului..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div>
                <span className="text-sm text-muted-foreground">Total retur: </span>
                <span className="text-xl font-bold text-destructive">{returnTotal.toFixed(0)} RON</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFoundSale(null);
                    setSelectedItems({});
                    setReturnReason("");
                    setSaleIdInput("");
                  }}
                >
                  Anulează
                </Button>
                <Button
                  variant="destructive"
                  disabled={Object.keys(selectedItems).length === 0}
                  onClick={() => setShowConfirm(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Procesează Retur
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!foundSale && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Caută o vânzare sau scanează un produs</p>
            <p className="text-sm">pentru a procesa un retur</p>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmare Retur
            </DialogTitle>
            <DialogDescription>
              Confirmi procesarea returului pentru vânzarea {foundSale?.internal_id}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Produse returnate: <strong>{Object.keys(selectedItems).length}</strong>
            </p>
            <p className="text-sm">
              Total de restituit: <strong className="text-destructive">{returnTotal.toFixed(0)} RON</strong>
            </p>
            {returnReason && (
              <p className="text-sm">
                Motiv: <em>{returnReason}</em>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Renunță
            </Button>
            <Button variant="destructive" onClick={handleProcessReturn} disabled={processing}>
              {processing ? "Se procesează..." : "Confirmă Retur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Retur Procesat
            </DialogTitle>
            <DialogDescription>
              Returul a fost înregistrat cu succes.
            </DialogDescription>
          </DialogHeader>
          <p className="text-center text-2xl font-bold">{lastReturnTotal.toFixed(0)} RON</p>
          <p className="text-center text-sm text-muted-foreground">de restituit clientului</p>
          <DialogFooter>
            <Button onClick={() => setShowSuccess(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

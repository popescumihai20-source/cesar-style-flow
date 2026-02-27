import { useState, useRef, useEffect, useCallback } from "react";
import { Search, ShoppingCart, X, Gift, Minus, Plus, Trash2, CreditCard, Banknote, ArrowLeftRight, AlertTriangle, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { parseBarcode } from "@/lib/barcode-parser";
import { usePOS } from "@/hooks/use-pos";
import { Product } from "@/types/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function POS() {
  const {
    mode, cart, cashierName, cashierEmployeeId,
    paymentMethod, setPaymentMethod,
    cashAmount, setCashAmount, cardAmount, setCardAmount,
    cartTotal, cartDiscountTotal, cartItemCount,
    activateCashier, addToCart, removeFromCart,
    updateDiscount, toggleGift, updateQuantity,
    resetToPublic, recordActivity,
  } = usePOS();

  const [scanInput, setScanInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch products for search
  const { data: products = [] } = useQuery({
    queryKey: ["products-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Filter products for search
  const filteredProducts = searchQuery.length >= 2
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.base_id.includes(searchQuery)
      )
    : [];

  // Auto-focus scan input only on initial mount
  useEffect(() => {
    if (scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, []);

  // Handle scan input (card or product barcode)
  const handleScan = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    recordActivity();

    // If PUBLIC mode, try to find employee card
    if (mode === "public") {
      const { data: employee } = await supabase
        .from("employees")
        .select("*")
        .eq("employee_card_code", trimmed)
        .eq("active", true)
        .maybeSingle();

      if (employee) {
        activateCashier(employee.id, employee.name);
        toast({ title: `Sesiune casier: ${employee.name}`, description: "Gata de vânzare!" });
      } else {
        // Try as product barcode for public view
        const parsed = parseBarcode(trimmed);
        if (parsed.isValid) {
          const product = products.find(p => p.base_id === parsed.baseId);
          if (product) {
            setSearchQuery(product.name);
            setShowSearch(true);
          }
        }
      }
      setScanInput("");
      return;
    }

    // CASIER mode — add product to cart
    const parsed = parseBarcode(trimmed);
    if (parsed.isValid) {
      const product = products.find(p => p.base_id === parsed.baseId);
      if (product) {
        addToCart(product, parsed.variantCode, parsed.variantCode);
        // Check stock warning
        const currentStock = product.stock_general;
        const inCart = cart.filter(c => c.product.id === product.id).reduce((s, c) => s + c.quantity, 0);
        if (currentStock - inCart <= 0) {
          toast({
            title: "⚠️ Stoc epuizat",
            description: `${product.name} — stoc: ${currentStock}`,
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Produs negăsit", description: `Base ID: ${parsed.baseId}`, variant: "destructive" });
      }
    } else {
      // Maybe it's an employee card scan during cashier mode (ignore)
      toast({ title: "Cod invalid", description: parsed.error, variant: "destructive" });
    }
    setScanInput("");
  }, [mode, products, cart, activateCashier, addToCart, recordActivity, toast]);

  const handleScanKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleScan(scanInput);
    }
  };

  // Add product from search
  const handleAddFromSearch = (product: Product) => {
    if (mode !== "casier") {
      setShowSearch(false);
      return;
    }
    addToCart(product, null, null);
    setShowSearch(false);
    setSearchQuery("");
  };

  // Finalize sale
  const handleFinalize = async () => {
    if (!cashierEmployeeId || cart.length === 0) return;
    setIsSubmitting(true);
    try {
      // Generate internal ID
      const { data: idData } = await supabase.rpc("generate_sale_internal_id");
      const internalId = idData || `CES-${Date.now()}`;

      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          internal_id: internalId,
          cashier_employee_id: cashierEmployeeId,
          status: "pending_fiscal" as const,
          total: cartTotal,
          discount_total: cartDiscountTotal,
          payment_method: paymentMethod,
          cash_amount: paymentMethod === "numerar" ? cartTotal : paymentMethod === "mixt" ? cashAmount : null,
          card_amount: paymentMethod === "card" ? cartTotal : paymentMethod === "mixt" ? cardAmount : null,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const items = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.product.id,
        variant_code: item.variantCode,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_percent: item.discountPercent,
        is_gift: item.isGift,
        line_total: item.lineTotal,
      }));

      const { error: itemsError } = await supabase.from("sale_items").insert(items);
      if (itemsError) throw itemsError;

      // Decrement stock (optimistic)
      for (const item of cart) {
        await supabase
          .from("products")
          .update({ stock_general: item.product.stock_general - item.quantity })
          .eq("id", item.product.id);
      }

      toast({
        title: `✅ Vânzare finalizată: ${internalId}`,
        description: `Total: ${cartTotal.toFixed(2)} RON`,
      });

      resetToPublic();
    } catch (err: any) {
      toast({ title: "Eroare la finalizare", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setShowFinalize(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4" onClick={recordActivity}>
      {/* Left: Products / Scanner */}
      <div className="flex flex-1 flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Punct de Vânzare</h1>
              <p className="text-xs text-muted-foreground">
                {mode === "public"
                  ? "Mod PUBLIC — scanează cardul de angajat"
                  : `Casier: ${cashierName}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "casier" && (
              <Badge variant="outline" className="border-primary text-primary">
                CASIER ACTIV
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowSearch(true); setSearchQuery(""); }}
            >
              <Search className="h-4 w-4 mr-1" />
              Căutare
            </Button>
          </div>
        </div>

        {/* Scan input — always visible */}
        <div className="relative">
          <Input
            ref={scanInputRef}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScanKeyDown}
            placeholder={mode === "public" ? "Scanează cardul de angajat..." : "Scanează produs..."}
            className="h-14 text-lg font-mono bg-primary text-primary-foreground border-2 border-primary/30 focus:border-accent placeholder:text-primary-foreground/50"
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {mode === "public" ? "CARD ANGAJAT" : "COD PRODUS"}
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto space-y-2">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>{mode === "public" ? "Scanează cardul pentru a începe vânzarea" : "Scanează produse pentru a le adăuga în coș"}</p>
            </div>
          ) : (
            cart.map((item) => (
              <Card key={item.id} className={`border ${item.product.stock_general <= 0 ? "border-destructive/50" : "border-border"}`}>
                <CardContent className="flex items-center gap-4 p-3">
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{item.product.name}</p>
                      {item.variantLabel && (
                        <Badge variant="secondary" className="text-xs">{item.variantLabel}</Badge>
                      )}
                      {item.isGift && (
                        <Badge className="bg-primary/20 text-primary text-xs">
                          <Gift className="h-3 w-3 mr-1" />
                          CADOU
                        </Badge>
                      )}
                      {item.product.stock_general <= 0 && (
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{item.unitPrice.toFixed(2)} RON</span>
                      {item.discountPercent > 0 && (
                        <Badge variant="destructive" className="text-xs">-{item.discountPercent}%</Badge>
                      )}
                    </div>
                    {/* Discount slider */}
                    {!item.isGift && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground w-16">Reducere:</span>
                        <Slider
                          value={[item.discountPercent]}
                          onValueChange={([v]) => updateDiscount(item.id, v)}
                          max={20}
                          step={1}
                          className="flex-1 max-w-[200px]"
                        />
                        <span className="text-xs font-mono w-8">{item.discountPercent}%</span>
                      </div>
                    )}
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-mono text-sm">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Line total */}
                  <div className="text-right w-24">
                    <p className="font-bold">{item.lineTotal.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">RON</p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleGift(item.id)}>
                      <Gift className={`h-3 w-3 ${item.isGift ? "text-primary" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right: Cart summary & actions */}
      <div className="w-80 flex flex-col gap-4">
        {/* Summary card */}
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Articole</span>
              <span className="font-mono">{cartItemCount}</span>
            </div>
            {cartDiscountTotal > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Reduceri</span>
                <span className="font-mono">-{cartDiscountTotal.toFixed(2)} RON</span>
              </div>
            )}
            <div className="border-t border-border pt-3 flex justify-between">
              <span className="text-lg font-bold">TOTAL</span>
              <span className="text-2xl font-bold text-gold-gradient font-mono">{cartTotal.toFixed(2)}</span>
            </div>
            <p className="text-xs text-right text-muted-foreground">RON</p>
          </CardContent>
        </Card>

        {/* Payment method */}
        {mode === "casier" && cart.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Metodă de plată</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={paymentMethod === "numerar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod("numerar")}
                  className="flex flex-col gap-1 h-auto py-2"
                >
                  <Banknote className="h-4 w-4" />
                  <span className="text-xs">Numerar</span>
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod("card")}
                  className="flex flex-col gap-1 h-auto py-2"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-xs">Card</span>
                </Button>
                <Button
                  variant={paymentMethod === "mixt" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentMethod("mixt")}
                  className="flex flex-col gap-1 h-auto py-2"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="text-xs">Mixt</span>
                </Button>
              </div>
              {paymentMethod === "mixt" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={cashAmount || ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setCashAmount(v);
                        setCardAmount(Math.max(0, cartTotal - v));
                      }}
                      placeholder="Numerar"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      value={cardAmount || ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setCardAmount(v);
                        setCashAmount(Math.max(0, cartTotal - v));
                      }}
                      placeholder="Card"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="mt-auto space-y-2">
          {mode === "casier" && cart.length > 0 && (
            <>
              <Button
                className="w-full h-14 text-lg font-bold"
                onClick={() => setShowFinalize(true)}
                disabled={isSubmitting}
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Finalizare în Sistem
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={resetToPublic}
              >
                <X className="h-4 w-4 mr-2" />
                Anulare Vânzare
              </Button>
            </>
          )}
          {mode === "casier" && cart.length === 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={resetToPublic}
            >
              Închide sesiunea
            </Button>
          )}
        </div>
      </div>

      {/* Search dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Căutare produs</DialogTitle>
          </DialogHeader>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Caută după nume sau cod..."
            autoFocus
          />
          <div className="max-h-80 overflow-auto space-y-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left"
                onClick={() => handleAddFromSearch(product)}
              >
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.base_id} • {product.category || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{product.selling_price.toFixed(2)} RON</p>
                  <p className={`text-xs ${product.stock_general <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    Stoc: {product.stock_general}
                  </p>
                </div>
              </button>
            ))}
            {searchQuery.length >= 2 && filteredProducts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Niciun produs găsit</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Finalize dialog */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmare finalizare vânzare</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Articole:</span>
              <span className="font-mono">{cartItemCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-bold text-lg">{cartTotal.toFixed(2)} RON</span>
            </div>
            <div className="flex justify-between">
              <span>Plată:</span>
              <span className="capitalize">{paymentMethod}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Casier:</span>
              <span>{cashierName}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Anulează</Button>
            <Button onClick={handleFinalize} disabled={isSubmitting}>
              {isSubmitting ? "Se procesează..." : "Confirmă și Finalizează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

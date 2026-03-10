import { useState, useRef, useEffect, useCallback } from "react";
import { Search, ShoppingCart, X, Gift, Minus, Plus, Trash2, CreditCard, Banknote, ArrowLeftRight, AlertTriangle, CheckCircle, Receipt, Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CashierDashboard from "@/components/pos/CashierDashboard";
import POSNumpad from "@/components/pos/POSNumpad";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { usePOS } from "@/hooks/use-pos";
import { useInventoryLock } from "@/hooks/use-inventory-lock";
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
  const queryClient = useQueryClient();
  const {
    mode, cart, cashierName, cashierEmployeeId,
    paymentMethod, setPaymentMethod,
    cashAmount, setCashAmount, cardAmount, setCardAmount,
    cartTotal, cartDiscountTotal, cartItemCount,
    activateCashier, addToCart, removeFromCart,
    updateDiscount, toggleGift, updateQuantity,
    clearCart, resetToPublic, recordActivity,
  } = usePOS();

  const [scanInput, setScanInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<{
    internalId: string;
    total: number;
    paymentMethod: string;
    cashAmount: number;
    cardAmount: number;
    change: number;
    itemCount: number;
    cashierName: string;
    commissions: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanProcessingRef = useRef(false);
  const { toast } = useToast();
  const { getArticolLabel } = useArticolDictionary();
  const { isLocked: isMagazinLocked } = useInventoryLock("magazin");
  // PIN login state
  const [pendingEmployee, setPendingEmployee] = useState<any>(null);
  const [showPinLogin, setShowPinLogin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

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

  // Fetch store location
  const { data: storeLocation, isLoading: isStoreLocationLoading } = useQuery({
    queryKey: ["store-location"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_locations" as any)
        .select("*")
        .eq("type", "store")
        .eq("active", true)
        .limit(1)
        .single();
      if (error) throw error;
      return data as any;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch inventory_stock for the store location
  const { data: storeStock = [], isLoading: isStoreStockLoading } = useQuery({
    queryKey: ["store-stock", storeLocation?.id],
    queryFn: async () => {
      if (!storeLocation?.id) return [];
      const { data, error } = await supabase
        .from("inventory_stock" as any)
        .select("product_id, quantity")
        .eq("location_id", storeLocation.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!storeLocation?.id,
    staleTime: 30 * 1000,
  });

  // Helper to get cached store stock for a product
  const getStoreStock = useCallback((productId: string) => {
    const entry = storeStock.find((s: any) => s.product_id === productId);
    return entry?.quantity ?? 0;
  }, [storeStock]);

  // Always check live stock for a product (avoids large-list cache/limit issues)
  const fetchFreshStoreStock = useCallback(async (productId: string) => {
    if (!storeLocation?.id) return 0;

    const { data, error } = await supabase
      .from("inventory_stock" as any)
      .select("quantity")
      .eq("location_id", storeLocation.id)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      console.error("[POS] Stock lookup error:", error);
      return getStoreStock(productId);
    }

    return (data as any)?.quantity ?? 0;
  }, [storeLocation?.id, getStoreStock]);

  const fetchProductByScanCode = useCallback(async (scannedCode: string) => {
    // First try exact full_barcode match
    const { data: exactMatch, error: err1 } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .eq("full_barcode", scannedCode)
      .limit(1)
      .maybeSingle();

    if (exactMatch) return exactMatch as Product;

    // Fallback: match by base_id (first 7 digits)
    const baseId = scannedCode.substring(0, 7);
    const { data: baseMatch, error: err2 } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .eq("base_id", baseId)
      .limit(1)
      .maybeSingle();

    if (err1 && err2) {
      console.error("[POS] Product lookup error:", err1, err2);
    }

    return (baseMatch as Product | null) ?? null;
  }, []);

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
      // Validate as 7-digit employee card
      if (/^\d{7}$/.test(trimmed)) {
        const { data: employee } = await supabase
          .from("employees")
          .select("*")
          .eq("employee_card_code", trimmed)
          .eq("active", true)
          .maybeSingle();

        if (employee) {
          // Show PIN login dialog instead of directly activating
          setPendingEmployee(employee);
          setShowPinLogin(true);
          setPinInput("");
          setPinError("");
          setScanInput("");
          return;
        }
      }

      // Try as product barcode for public view
      if (isValidBarcode(trimmed)) {
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
    if (isStoreLocationLoading || isStoreStockLoading) {
      toast({
        title: "Se încarcă stocul",
        description: "Încearcă din nou în 1-2 secunde.",
        variant: "destructive"
      });
      setScanInput("");
      return;
    }

    if (!storeLocation?.id) {
      toast({
        title: "Lipsă locație magazin",
        description: "Nu există o locație de tip magazin activă.",
        variant: "destructive"
      });
      setScanInput("");
      return;
    }

    if (!isValidBarcode(trimmed)) {
      toast({ title: "Cod invalid", description: `Codul trebuie să aibă exact 17 cifre numerice`, variant: "destructive" });
      setScanInput("");
      return;
    }

    const parsed = parseBarcode(trimmed);
    if (parsed.isValid) {
      const baseId = trimmed.substring(0, 7);
      let product = products.find(p => p.full_barcode === trimmed) || products.find(p => p.base_id === baseId);
      if (!product) {
        product = await fetchProductByScanCode(trimmed);
      }

      if (product) {
        const storeQty = await fetchFreshStoreStock(product.id);
        const inCart = cart.filter(c => c.product.id === product.id).reduce((s, c) => s + c.quantity, 0);

        if (storeQty <= 0) {
          toast({
            title: "⛔ Stoc 0 în magazin",
            description: `${product.name} — nu poate fi adăugat`,
            variant: "destructive",
          });
          setScanInput("");
          return;
        }

        if (inCart + 1 > storeQty) {
          toast({
            title: "⚠️ Stoc insuficient",
            description: `${product.name} — disponibil: ${storeQty}, în coș: ${inCart}`,
            variant: "destructive",
          });
          setScanInput("");
          return;
        }

        addToCart(product, null, null);
      } else {
        toast({ title: "Produs negăsit", description: `Cod 17 cifre: ${trimmed}`, variant: "destructive" });
      }
    }

    setScanInput("");
  }, [mode, products, cart, addToCart, recordActivity, toast, fetchFreshStoreStock, fetchProductByScanCode, isStoreLocationLoading, isStoreStockLoading, storeLocation?.id]);

  useEffect(() => {
    if (mode !== "casier") return;
    const candidate = scanInput.trim();
    if (!/^\d{17}$/.test(candidate)) return;
    if (scanProcessingRef.current) return;

    scanProcessingRef.current = true;
    void handleScan(candidate).finally(() => {
      scanProcessingRef.current = false;
    });
  }, [mode, scanInput, handleScan]);

  const handleScanKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (scanProcessingRef.current) return;

    scanProcessingRef.current = true;
    void handleScan(scanInput).finally(() => {
      scanProcessingRef.current = false;
    });
  };

  // Handle PIN login submission
  const handlePinLogin = () => {
    if (!pendingEmployee) return;
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError("PIN-ul trebuie să aibă exact 4 cifre");
      setPinInput("");
      return;
    }
    if (pinInput === pendingEmployee.pin_login) {
      activateCashier(pendingEmployee.id, pendingEmployee.name);
      toast({ title: `Sesiune casier: ${pendingEmployee.name}`, description: "Gata de vânzare!" });
      setShowPinLogin(false);
      setPendingEmployee(null);
      setPinInput("");
      setPinError("");
    } else {
      setPinError("PIN incorect");
      setPinInput("");
    }
  };

  // Add product from search
  const handleAddFromSearch = async (product: Product) => {
    if (mode !== "casier") {
      setShowSearch(false);
      return;
    }

    if (!storeLocation?.id) {
      toast({ title: "Lipsă locație magazin", description: "Nu există o locație de tip magazin activă.", variant: "destructive" });
      return;
    }

    const storeQty = await fetchFreshStoreStock(product.id);
    if (storeQty <= 0) {
      toast({ title: "⛔ Stoc 0 în magazin", description: `${product.name} — nu poate fi adăugat`, variant: "destructive" });
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
      // FINAL STOCK CHECK — re-fetch current store stock to prevent overselling
      if (storeLocation?.id) {
        for (const item of cart) {
          const { data: freshStock } = await supabase
            .from("inventory_stock" as any)
            .select("quantity")
            .eq("product_id", item.product.id)
            .eq("location_id", storeLocation.id)
            .maybeSingle();
          const available = (freshStock as any)?.quantity ?? 0;
          if (item.quantity > available) {
            toast({
              title: "⛔ Stoc insuficient",
              description: `${item.product.name} — disponibil: ${available}, în coș: ${item.quantity}`,
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
        }
      }

      // Generate internal ID
      const { data: idData } = await supabase.rpc("generate_sale_internal_id");
      const internalId = idData || `CES-${Date.now()}`;

      const finalCashAmount = paymentMethod === "numerar" ? cartTotal : paymentMethod === "mixt" ? cashAmount : null;
      const finalCardAmount = paymentMethod === "card" ? cartTotal : paymentMethod === "mixt" ? cardAmount : null;

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
          cash_amount: finalCashAmount,
          card_amount: finalCardAmount,
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

      // Decrement stock — update both products and inventory_stock
      // Get employee info for audit log
      const { data: empData } = await supabase.from("employees").select("name, employee_card_code").eq("id", cashierEmployeeId).single();
      const locationName = storeLocation?.name || "Magazin Ferdinand";

      for (const item of cart) {
        // Update products.stock_general
        const { data: currentProduct } = await supabase
          .from("products")
          .select("stock_general")
          .eq("id", item.product.id)
          .single();

        if (currentProduct) {
          await supabase
            .from("products")
            .update({ stock_general: Math.max(0, currentProduct.stock_general - item.quantity) })
            .eq("id", item.product.id);
        }

        // Update inventory_stock for store location
        if (storeLocation?.id) {
          const { data: stockEntry } = await supabase
            .from("inventory_stock" as any)
            .select("quantity")
            .eq("product_id", item.product.id)
            .eq("location_id", storeLocation.id)
            .maybeSingle();

          if (stockEntry) {
            await supabase
              .from("inventory_stock" as any)
              .update({ quantity: Math.max(0, (stockEntry as any).quantity - item.quantity), updated_at: new Date().toISOString() })
              .eq("product_id", item.product.id)
              .eq("location_id", storeLocation.id);
          }
        }

        // Write sale audit log
        await supabase.from("sale_audit_log" as any).insert({
          sale_id: sale.id,
          location_name: locationName,
          employee_name: empData?.name || cashierName,
          employee_card_code: empData?.employee_card_code || null,
          product_base_id: item.product.base_id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
        });

        if (item.variantCode) {
          const { data: variant } = await supabase
            .from("product_variants")
            .select("id, stock_variant")
            .eq("product_id", item.product.id)
            .eq("variant_code", item.variantCode)
            .maybeSingle();

          if (variant) {
            await supabase
              .from("product_variants")
              .update({ stock_variant: variant.stock_variant - item.quantity })
              .eq("id", variant.id);
          }
        }
      }

      // Auto bulina commissions
      let totalCommission = 0;
      for (const item of cart) {
        if (item.isGift) continue;
        
        const { data: bulina } = await supabase
          .from("product_bulina")
          .select("bulina_id, bulina_commissions(commission_value, active)")
          .eq("product_id", item.product.id)
          .maybeSingle();

        if (bulina && (bulina as any).bulina_commissions?.active) {
          const commissionValue = (bulina as any).bulina_commissions.commission_value * item.quantity;
          totalCommission += commissionValue;

          await supabase.from("commission_logs").insert({
            sale_id: sale.id,
            employee_id: cashierEmployeeId!,
            bulina_id: bulina.bulina_id,
            amount: commissionValue,
          });
        }
      }

      const change = paymentMethod === "numerar" && amountReceived > 0
        ? Math.max(0, amountReceived - cartTotal)
        : 0;

      setLastSale({
        internalId,
        total: cartTotal,
        paymentMethod,
        cashAmount: finalCashAmount || 0,
        cardAmount: finalCardAmount || 0,
        change,
        itemCount: cartItemCount,
        cashierName,
        commissions: totalCommission,
      });

      setShowFinalize(false);
      setShowReceipt(true);

      // Invalidate store stock cache
      queryClient.invalidateQueries({ queryKey: ["store-stock"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });

      toast({
        title: `✅ Vânzare finalizată: ${internalId}`,
        description: `Total: ${cartTotal.toFixed(2)} RON${totalCommission > 0 ? ` | Comision: ${totalCommission.toFixed(2)} RON` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Eroare la finalizare", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseReceipt = () => {
    setShowReceipt(false);
    setLastSale(null);
    setAmountReceived(0);
    resetToPublic();
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

        {/* Scan input */}
        <div className="relative">
          <Input
            ref={scanInputRef}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScanKeyDown}
            placeholder={mode === "public" ? "Scanează cardul de angajat..." : "Scanează produs..."}
            className="h-16 text-2xl font-mono bg-primary text-primary-foreground border-2 border-primary/30 focus:border-accent placeholder:text-primary-foreground/50"
            autoFocus
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {mode === "public" ? "CARD ANGAJAT" : "COD PRODUS"}
          </div>
        </div>

        {/* Inventory lock warning */}
        {isMagazinLocked && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Inventariere în curs — Magazin</p>
              <p className="text-xs text-muted-foreground">Vânzările sunt blocate până la finalizarea inventarierii.</p>
            </div>
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-auto space-y-2">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              {mode === "casier" && cashierEmployeeId ? (
                <div className="w-full max-w-lg">
                  <CashierDashboard employeeId={cashierEmployeeId} cashierName={cashierName} />
                </div>
              ) : (
                <p className="text-muted-foreground">Scanează cardul pentru a începe vânzarea</p>
              )}
            </div>
          ) : (
            cart.map((item) => (
              <Card key={item.id} className={`border ${item.product.stock_general <= 0 ? "border-destructive/50" : "border-border"}`}>
                <CardContent className="flex items-center gap-4 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{item.product.name}</p>
                      {item.variantCode && (
                        <Badge variant="secondary" className="text-xs">{getArticolLabel(item.variantCode)}</Badge>
                      )}
                      {item.isGift && (
                        <Badge className="bg-primary/20 text-primary text-xs">
                          <Gift className="h-3 w-3 mr-1" />CADOU
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
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-mono text-sm">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-right w-24">
                    <p className="font-bold">{item.lineTotal.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">RON</p>
                  </div>
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
      <div className="w-96 flex flex-col gap-4 overflow-auto">
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
                <Button variant={paymentMethod === "numerar" ? "default" : "outline"} size="sm" onClick={() => setPaymentMethod("numerar")} className="flex flex-col gap-1 h-auto py-2">
                  <Banknote className="h-4 w-4" /><span className="text-xs">Numerar</span>
                </Button>
                <Button variant={paymentMethod === "card" ? "default" : "outline"} size="sm" onClick={() => setPaymentMethod("card")} className="flex flex-col gap-1 h-auto py-2">
                  <CreditCard className="h-4 w-4" /><span className="text-xs">Card</span>
                </Button>
                <Button variant={paymentMethod === "mixt" ? "default" : "outline"} size="sm" onClick={() => setPaymentMethod("mixt")} className="flex flex-col gap-1 h-auto py-2">
                  <ArrowLeftRight className="h-4 w-4" /><span className="text-xs">Mixt</span>
                </Button>
              </div>
              {paymentMethod === "mixt" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <Input type="number" value={cashAmount || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setCashAmount(v); setCardAmount(Math.max(0, cartTotal - v)); }} placeholder="Numerar" className="h-8 text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <Input type="number" value={cardAmount || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setCardAmount(v); setCashAmount(Math.max(0, cartTotal - v)); }} placeholder="Card" className="h-8 text-sm" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Numpad */}
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-2 text-center">Numpad</p>
            <POSNumpad
              onDigit={(d) => {
                recordActivity();
                setScanInput(prev => prev + d);
                scanInputRef.current?.focus();
              }}
              onBackspace={() => {
                recordActivity();
                setScanInput(prev => prev.slice(0, -1));
                scanInputRef.current?.focus();
              }}
              onClear={() => {
                recordActivity();
                setScanInput("");
                scanInputRef.current?.focus();
              }}
              onEnter={() => {
                recordActivity();
                if (scanProcessingRef.current) return;
                scanProcessingRef.current = true;
                void handleScan(scanInput).finally(() => {
                  scanProcessingRef.current = false;
                });
              }}
            />
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="mt-auto space-y-2">
          {mode === "casier" && cart.length > 0 && (
            <>
              <Button className="w-full h-14 text-lg font-bold" onClick={() => setShowFinalize(true)} disabled={isSubmitting || isMagazinLocked}>
                {isMagazinLocked ? <><ShieldAlert className="h-5 w-5 mr-2" />Blocat — Inventariere</> : <><CheckCircle className="h-5 w-5 mr-2" />Finalizare în Sistem</>}
              </Button>
              <Button variant="destructive" className="w-full" onClick={() => { clearCart(); recordActivity(); }}>
                <X className="h-4 w-4 mr-2" />Anulare Vânzare
              </Button>
            </>
          )}
          {mode === "casier" && cart.length === 0 && (
            <Button variant="outline" className="w-full" onClick={resetToPublic}>Închide sesiunea</Button>
          )}
        </div>
      </div>

      {/* PIN Login Dialog */}
      <Dialog open={showPinLogin} onOpenChange={(open) => { if (!open) { setShowPinLogin(false); setPendingEmployee(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />Autentificare Casier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="font-medium">{pendingEmployee?.name}</p>
              <p className="text-xs text-muted-foreground">Introdu PIN-ul de autentificare</p>
            </div>
            <Input
              type="password"
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
              onKeyDown={e => e.key === "Enter" && handlePinLogin()}
              placeholder="PIN (4 cifre)..."
              className={`h-14 text-lg text-center tracking-widest ${pinError ? "border-destructive" : ""}`}
              autoFocus
              maxLength={4}
            />
            {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPinLogin(false); setPendingEmployee(null); }}>Anulează</Button>
            <Button onClick={handlePinLogin} disabled={pinInput.length !== 4}>Autentifică</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Căutare produs</DialogTitle></DialogHeader>
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Caută după nume sau cod..." autoFocus />
          <div className="max-h-80 overflow-auto space-y-1">
            {filteredProducts.map((product) => {
              const storeQty = getStoreStock(product.id);
              return (
              <button key={product.id} className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left ${storeQty <= 0 ? "opacity-50" : ""}`} onClick={() => handleAddFromSearch(product)} disabled={mode === "casier" && storeQty <= 0}>
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.base_id} • {product.category || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{product.selling_price.toFixed(2)} RON</p>
                  <p className={`text-xs ${storeQty <= 0 ? "text-destructive" : "text-muted-foreground"}`}>Stoc magazin: {storeQty}</p>
                </div>
              </button>
              );
            })}
            {searchQuery.length >= 2 && filteredProducts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Niciun produs găsit</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Finalize dialog */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmare finalizare vânzare</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between"><span>Articole:</span><span className="font-mono">{cartItemCount}</span></div>
            <div className="flex justify-between"><span>Total de plată:</span><span className="font-bold text-lg">{cartTotal.toFixed(2)} RON</span></div>
            <div className="flex justify-between"><span>Plată:</span><span className="capitalize">{paymentMethod}</span></div>
            {(paymentMethod === "numerar" || paymentMethod === "mixt") && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Suma primită:</span>
                  <Input type="number" value={amountReceived || ""} onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)} placeholder={cartTotal.toFixed(2)} className="h-9 w-32 font-mono text-right" autoFocus />
                </div>
                {amountReceived > 0 && amountReceived >= (paymentMethod === "mixt" ? cashAmount : cartTotal) && (
                  <div className="flex justify-between bg-accent/50 rounded-lg p-3">
                    <span className="font-medium">Rest de dat:</span>
                    <span className="text-xl font-bold text-primary font-mono">
                      {(amountReceived - (paymentMethod === "mixt" ? cashAmount : cartTotal)).toFixed(2)} RON
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground"><span>Casier:</span><span>{cashierName}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Anulează</Button>
            <Button onClick={handleFinalize} disabled={isSubmitting}>{isSubmitting ? "Se procesează..." : "Confirmă și Finalizează"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt confirmation dialog */}
      <Dialog open={showReceipt} onOpenChange={(open) => { if (!open) handleCloseReceipt(); }}>
        <DialogContent className="max-w-sm">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Vânzare Finalizată!</h2>
              <p className="text-sm text-muted-foreground font-mono">{lastSale?.internalId}</p>
            </div>
            <div className="border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Articole</span><span className="font-mono">{lastSale?.itemCount}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="font-bold">TOTAL</span><span className="text-lg font-bold font-mono">{lastSale?.total.toFixed(2)} RON</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Plată</span><span className="capitalize">{lastSale?.paymentMethod}</span></div>
              {lastSale?.paymentMethod === "mixt" && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Numerar</span><span className="font-mono">{lastSale.cashAmount.toFixed(2)} RON</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Card</span><span className="font-mono">{lastSale.cardAmount.toFixed(2)} RON</span></div>
                </>
              )}
              {lastSale && lastSale.change > 0 && (
                <div className="flex justify-between bg-accent rounded-lg p-2 mt-2"><span className="font-bold">REST</span><span className="text-xl font-bold text-primary font-mono">{lastSale.change.toFixed(2)} RON</span></div>
              )}
              {lastSale && lastSale.commissions > 0 && (
                <div className="flex justify-between text-muted-foreground border-t border-border pt-2"><span>Comision buline</span><span className="font-mono text-green-500">+{lastSale.commissions.toFixed(2)} RON</span></div>
              )}
              <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-2"><span>Casier</span><span>{lastSale?.cashierName}</span></div>
            </div>
            <Button className="w-full h-12 text-base" onClick={handleCloseReceipt}>
              <Receipt className="h-4 w-4 mr-2" />OK — Vânzare Nouă
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

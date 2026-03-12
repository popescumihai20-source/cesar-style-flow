import { useState, useCallback, useRef, useEffect } from "react";
import { CartItem, POSMode, PaymentMethod } from "@/types/pos";
import { Product } from "@/types/pos";

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 min

export function usePOS() {
  const [mode, setMode] = useState<POSMode>("public");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashierEmployeeId, setCashierEmployeeId] = useState<string | null>(null);
  const [cashierName, setCashierName] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("numerar");
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearCart = useCallback(() => {
    setCart([]);
    setPaymentMethod("numerar");
    setCashAmount(0);
    setCardAmount(0);
  }, []);

  const resetToPublic = useCallback(() => {
    setMode("public");
    clearCart();
    setCashierEmployeeId(null);
    setCashierName("");
  }, [clearCart]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Auto-lock after 10 min inactivity
  useEffect(() => {
    if (mode !== "casier") return;
    timerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) {
        resetToPublic();
      }
    }, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, resetToPublic]);

  const activateCashier = useCallback((employeeId: string, name: string) => {
    setMode("casier");
    setCashierEmployeeId(employeeId);
    setCashierName(name);
    lastActivityRef.current = Date.now();
  }, []);

  const addToCart = useCallback((product: Product, variantCode: string | null, variantLabel: string | null, priceOverride?: number) => {
    recordActivity();
    const unitPrice = Number(priceOverride ?? product.selling_price) || 0;
    console.log("[CART-ADD] Adding product:", product.name, "| unitPrice:", unitPrice, "| priceOverride:", priceOverride, "| DB price:", product.selling_price);
    setCart(prev => {
      // Only merge if same product AND same unitPrice — different barcode prices = separate rows
      const existing = prev.find(
        item => item.product.id === product.id && item.variantCode === variantCode && item.unitPrice === unitPrice
      );
      if (existing) {
        const newQty = existing.quantity + 1;
        const newLineTotal = newQty * existing.unitPrice * (1 - existing.discountPercent / 100);
        console.log("[CART-MERGE] Merged:", product.name, "| qty:", newQty, "| unitPrice:", existing.unitPrice, "| disc:", existing.discountPercent, "% | lineTotal:", newLineTotal);
        return prev.map(item =>
          item.id === existing.id
            ? {
                ...item,
                quantity: newQty,
                lineTotal: newLineTotal,
              }
            : item
        );
      }
      const newItem: CartItem = {
        id: crypto.randomUUID(),
        product,
        variantCode,
        variantLabel,
        quantity: 1,
        unitPrice,
        discountPercent: 0,
        isGift: false,
        lineTotal: unitPrice,
      };
      console.log("[CART-NEW] New item:", product.name, "| unitPrice:", unitPrice, "| lineTotal:", unitPrice);
      return [...prev, newItem];
    });
  }, [recordActivity]);

  const removeFromCart = useCallback((itemId: string) => {
    recordActivity();
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, [recordActivity]);

  const updateDiscount = useCallback((itemId: string, discountPercent: number) => {
    recordActivity();
    setCart(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const disc = Math.min(Math.max(discountPercent, 0), item.isGift ? 100 : 20);
        const newLineTotal = item.quantity * item.unitPrice * (1 - disc / 100);
        console.log("[CART-DISCOUNT]", item.product.name, "| disc:", disc, "% | lineTotal:", newLineTotal);
        return {
          ...item,
          discountPercent: disc,
          lineTotal: newLineTotal,
        };
      })
    );
  }, [recordActivity]);

  const toggleGift = useCallback((itemId: string) => {
    recordActivity();
    setCart(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const newGift = !item.isGift;
        const disc = newGift ? 100 : 0;
        return {
          ...item,
          isGift: newGift,
          discountPercent: disc,
          lineTotal: item.quantity * item.unitPrice * (1 - disc / 100),
        };
      })
    );
  }, [recordActivity]);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    recordActivity();
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== itemId));
      return;
    }
    setCart(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          quantity,
          lineTotal: quantity * item.unitPrice * (1 - item.discountPercent / 100),
        };
      })
    );
  }, [recordActivity]);

  const cartTotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const cartDiscountTotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (item.discountPercent / 100),
    0
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Debug: log full cart breakdown on every change
  useEffect(() => {
    if (cart.length === 0) return;
    console.log("[CART-TOTALS] === Cart Breakdown ===");
    cart.forEach((item, i) => {
      console.log(`[CART-TOTALS] Row ${i + 1}: "${item.product.name}" | unitPrice=${item.unitPrice} | qty=${item.quantity} | disc=${item.discountPercent}% | lineTotal=${item.lineTotal}`);
    });
    console.log(`[CART-TOTALS] cartTotal=${cartTotal} | cartDiscountTotal=${cartDiscountTotal} | cartItemCount=${cartItemCount}`);
    console.log(`[CART-TOTALS] Verify sum: ${cart.map(i => i.lineTotal).join(' + ')} = ${cart.reduce((s, i) => s + i.lineTotal, 0)}`);
  }, [cart, cartTotal, cartDiscountTotal, cartItemCount]);

  return {
    mode,
    cart,
    cashierEmployeeId,
    cashierName,
    paymentMethod,
    setPaymentMethod,
    cashAmount,
    setCashAmount,
    cardAmount,
    setCardAmount,
    cartTotal,
    cartDiscountTotal,
    cartItemCount,
    activateCashier,
    addToCart,
    removeFromCart,
    updateDiscount,
    toggleGift,
    updateQuantity,
    clearCart,
    resetToPublic,
    recordActivity,
  };
}

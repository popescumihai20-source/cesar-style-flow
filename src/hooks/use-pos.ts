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

  const resetToPublic = useCallback(() => {
    setMode("public");
    setCart([]);
    setCashierEmployeeId(null);
    setCashierName("");
    setPaymentMethod("numerar");
    setCashAmount(0);
    setCardAmount(0);
  }, []);

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

  const addToCart = useCallback((product: Product, variantCode: string | null, variantLabel: string | null) => {
    recordActivity();
    setCart(prev => {
      const existing = prev.find(
        item => item.product.id === product.id && item.variantCode === variantCode
      );
      if (existing) {
        return prev.map(item =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                lineTotal: (item.quantity + 1) * item.unitPrice * (1 - item.discountPercent / 100),
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
        unitPrice: product.selling_price,
        discountPercent: 0,
        isGift: false,
        lineTotal: product.selling_price,
      };
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
        return {
          ...item,
          discountPercent: disc,
          lineTotal: item.quantity * item.unitPrice * (1 - disc / 100),
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
    resetToPublic,
    recordActivity,
  };
}

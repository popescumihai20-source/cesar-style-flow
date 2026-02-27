import { useState, useRef } from "react";
import { PackageMinus, Search, CheckCircle, AlertTriangle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Step = "card" | "pin_login" | "product" | "pin_stock" | "confirm";

const LOCK_DURATION_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const stockPinLockout = new Map<string, { attempts: number; lockedUntil: number }>();

function getStockLockout(empId: string) {
  const entry = stockPinLockout.get(empId);
  if (!entry) return { locked: false, attempts: 0 };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return { locked: true, attempts: entry.attempts, remainMin: Math.ceil((entry.lockedUntil - Date.now()) / 60000) };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    stockPinLockout.delete(empId);
    return { locked: false, attempts: 0 };
  }
  return { locked: false, attempts: entry.attempts };
}

function recordStockFail(empId: string) {
  const entry = stockPinLockout.get(empId) || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
  stockPinLockout.set(empId, entry);
}

function clearStockLockout(empId: string) {
  stockPinLockout.delete(empId);
}

export default function ScoatereStoc() {
  const [step, setStep] = useState<Step>("card");
  const [cardInput, setCardInput] = useState("");
  const [pinLoginInput, setPinLoginInput] = useState("");
  const [pinStockInput, setPinStockInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [employee, setEmployee] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [variantCode, setVariantCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const { data: stockPins } = useQuery({
    queryKey: ["system-settings-stock-pins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["stock_pin_admin", "stock_pin_casier"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach(r => { map[r.key] = r.value; });
      return map;
    },
    staleTime: 60 * 1000,
  });

  const filteredProducts = searchQuery.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.base_id.includes(searchQuery))
    : [];

  const reset = () => {
    setStep("card");
    setCardInput("");
    setPinLoginInput("");
    setPinStockInput("");
    setPinError("");
    setEmployee(null);
    setSelectedProduct(null);
    setVariantCode("");
    setQuantity(1);
    setReason("");
    setScanInput("");
  };

  const handleCard = async () => {
    const trimmed = cardInput.trim();
    if (!/^\d{7}$/.test(trimmed)) {
      toast({ title: "Cod card invalid", description: "Trebuie exact 7 cifre numerice", variant: "destructive" });
      setCardInput("");
      return;
    }
    const { data: emp } = await supabase
      .from("employees")
      .select("*")
      .eq("employee_card_code", trimmed)
      .eq("active", true)
      .maybeSingle();
    if (emp) {
      setEmployee(emp);
      setStep("pin_login");
    } else {
      toast({ title: "Date invalide", variant: "destructive" });
    }
    setCardInput("");
  };

  const handlePinLogin = () => {
    if (!/^\d{4}$/.test(pinLoginInput)) {
      toast({ title: "PIN invalid", description: "Trebuie exact 4 cifre", variant: "destructive" });
      setPinLoginInput("");
      return;
    }
    if (employee && pinLoginInput === (employee as any).pin_login) {
      setStep("product");
    } else {
      toast({ title: "Date invalide", variant: "destructive" });
    }
    setPinLoginInput("");
  };

  const handleProductScan = () => {
    const trimmed = scanInput.trim();
    if (!isValidBarcode(trimmed)) {
      toast({ title: "Cod invalid", description: `Codul trebuie să aibă exact 17 cifre numerice`, variant: "destructive" });
      setScanInput("");
      return;
    }
    const parsed = parseBarcode(trimmed);
    if (parsed.isValid) {
      const product = products.find(p => p.base_id === parsed.baseId);
      if (product) {
        setSelectedProduct(product);
        setVariantCode("");
        setStep("pin_stock");
        setPinStockInput("");
        setPinError("");
      } else {
        toast({ title: "Produs negăsit", description: `Base ID: ${parsed.baseId}`, variant: "destructive" });
      }
    }
    setScanInput("");
  };

  const selectFromSearch = (product: any) => {
    setSelectedProduct(product);
    setShowSearch(false);
    setStep("pin_stock");
    setPinStockInput("");
    setPinError("");
  };

  const handlePinStock = () => {
    if (!employee || !stockPins) return;
    setPinError("");

    if (!/^\d{4}$/.test(pinStockInput)) {
      setPinError("PIN invalid — trebuie exact 4 cifre");
      setPinStockInput("");
      return;
    }

    const lock = getStockLockout(employee.id);
    if (lock.locked) {
      setPinError(`Acțiune blocată. Încercați în ${lock.remainMin} minute.`);
      setPinStockInput("");
      return;
    }

    const role = (employee as any).role || "casier";
    const expectedPin = role === "admin" ? stockPins.stock_pin_admin : stockPins.stock_pin_casier;

    if (pinStockInput === expectedPin) {
      clearStockLockout(employee.id);
      setStep("confirm");
    } else {
      recordStockFail(employee.id);
      const lockAfter = getStockLockout(employee.id);
      if (lockAfter.locked) {
        setPinError("Prea multe încercări. Acțiune blocată pentru 10 minute.");
      } else {
        const remaining = MAX_ATTEMPTS - lockAfter.attempts;
        setPinError(`PIN scoatere incorect. ${remaining} încercări rămase.`);
      }
    }
    setPinStockInput("");
  };

  const handleConfirm = async () => {
    if (!employee || !selectedProduct) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("stock_removals").insert({
        employee_id: employee.id,
        product_id: selectedProduct.id,
        variant_code: variantCode || null,
        quantity,
        reason: reason || null,
      });
      if (error) throw error;

      await supabase.from("products")
        .update({ stock_general: selectedProduct.stock_general - quantity })
        .eq("id", selectedProduct.id);

      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      toast({ title: "✅ Scoatere înregistrată", description: `${quantity}x ${selectedProduct.name}` });
      reset();
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = ["Card", "PIN Login", "Produs", "PIN Scoatere", "Confirmare"];
  const allSteps: Step[] = ["card", "pin_login", "product", "pin_stock", "confirm"];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <PackageMinus className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Scoatere Stoc</h1>
          <p className="text-xs text-muted-foreground">Scoatere produse din inventar (nu vânzare)</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {stepLabels.map((label, i) => {
          const isActive = allSteps.indexOf(step) >= i;
          return (
            <Badge key={label} variant={isActive ? "default" : "secondary"} className="text-xs">
              {i + 1}. {label}
            </Badge>
          );
        })}
      </div>

      {/* Step: Card */}
      {step === "card" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Scanează cardul de angajat</CardTitle></CardHeader>
          <CardContent>
            <Input
              value={cardInput}
              onChange={e => setCardInput(e.target.value.replace(/\D/g, "").slice(0, 7))}
              onKeyDown={e => e.key === "Enter" && handleCard()}
              placeholder="Cod card angajat (7 cifre)..."
              className="h-14 text-lg font-mono"
              autoFocus
              maxLength={7}
            />
          </CardContent>
        </Card>
      )}

      {/* Step: PIN Login */}
      {step === "pin_login" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Introdu PIN-ul de autentificare</CardTitle>
            <p className="text-sm text-muted-foreground">Angajat: {employee?.name}</p>
          </CardHeader>
          <CardContent>
            <Input
              type="password"
              value={pinLoginInput}
              onChange={e => setPinLoginInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={e => e.key === "Enter" && handlePinLogin()}
              placeholder="PIN Login (4 cifre)..."
              className="h-14 text-lg text-center tracking-widest"
              autoFocus
              maxLength={4}
            />
          </CardContent>
        </Card>
      )}

      {/* Step: Product */}
      {step === "product" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Scanează sau caută produsul</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleProductScan()}
              placeholder="Scanează cod de bare..."
              className="h-14 text-lg font-mono"
              autoFocus
            />
            <Button variant="outline" className="w-full" onClick={() => { setShowSearch(true); setSearchQuery(""); }}>
              <Search className="h-4 w-4 mr-2" />Căutare manuală
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: PIN Stock (Global) */}
      {step === "pin_stock" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />PIN Scoatere Stoc
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Produs: {selectedProduct?.name} — Introdu PIN-ul de scoatere
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              value={pinStockInput}
              onChange={e => { setPinStockInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
              onKeyDown={e => e.key === "Enter" && handlePinStock()}
              placeholder="PIN scoatere (4 cifre)..."
              className={`h-14 text-lg text-center tracking-widest ${pinError ? "border-destructive" : ""}`}
              autoFocus
              maxLength={4}
            />
            {pinError && <p className="text-sm text-destructive">{pinError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && selectedProduct && (
        <Card>
          <CardHeader><CardTitle className="text-base">Confirmă scoaterea</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">{selectedProduct.name}</p>
              <p className="text-xs text-muted-foreground">Cod: {selectedProduct.base_id}</p>
              <p className="text-xs text-muted-foreground">Stoc curent: {selectedProduct.stock_general}</p>
            </div>
            <div>
              <Label>Cantitate</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} min={1} className="mt-1" />
            </div>
            <div>
              <Label>Motiv (opțional)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="De ex: defect, mostre, pierdere..." className="mt-1" />
            </div>
            {selectedProduct.stock_general - quantity < 0 && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Stocul va deveni negativ!</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Anulează</Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={isSubmitting}>
                <CheckCircle className="h-4 w-4 mr-2" />{isSubmitting ? "Se procesează..." : "Confirmă Scoaterea"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Selectează produs</DialogTitle></DialogHeader>
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Caută..." autoFocus />
          <div className="max-h-80 overflow-auto space-y-1">
            {filteredProducts.map(p => (
              <button key={p.id} className="w-full flex justify-between p-3 rounded-lg hover:bg-muted text-left" onClick={() => selectFromSearch(p)}>
                <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.base_id}</p></div>
                <p className="text-sm text-muted-foreground">Stoc: {p.stock_general}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

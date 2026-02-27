import { useState, useRef } from "react";
import { PackageMinus, Search, CheckCircle, AlertTriangle } from "lucide-react";
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

type Step = "card" | "pin" | "product" | "confirm";

export default function ScoatereStoc() {
  const [step, setStep] = useState<Step>("card");
  const [cardInput, setCardInput] = useState("");
  const [pinInput, setPinInput] = useState("");
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

  const filteredProducts = searchQuery.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.base_id.includes(searchQuery))
    : [];

  const reset = () => {
    setStep("card");
    setCardInput("");
    setPinInput("");
    setEmployee(null);
    setSelectedProduct(null);
    setVariantCode("");
    setQuantity(1);
    setReason("");
    setScanInput("");
  };

  const handleCard = async () => {
    const { data: emp } = await supabase
      .from("employees")
      .select("*")
      .eq("employee_card_code", cardInput.trim())
      .eq("active", true)
      .maybeSingle();
    if (emp) {
      setEmployee(emp);
      setStep("pin");
    } else {
      toast({ title: "Card negăsit", variant: "destructive" });
    }
    setCardInput("");
  };

  const handlePin = () => {
    if (employee && pinInput === employee.removal_pin) {
      setStep("product");
    } else {
      toast({ title: "PIN incorect", variant: "destructive" });
    }
    setPinInput("");
  };

  const handleProductScan = () => {
    const trimmed = scanInput.trim();
    if (!isValidBarcode(trimmed)) {
      toast({ title: "Cod invalid", description: `Codul trebuie să aibă exact 17 cifre numerice (primit: ${trimmed.length})`, variant: "destructive" });
      setScanInput("");
      return;
    }
    const parsed = parseBarcode(trimmed);
    if (parsed.isValid) {
      const product = products.find(p => p.base_id === parsed.baseId);
      if (product) {
        setSelectedProduct(product);
        setVariantCode("");
        setStep("confirm");
      } else {
        toast({ title: "Produs negăsit", description: `Base ID: ${parsed.baseId}`, variant: "destructive" });
      }
    }
    setScanInput("");
  };

  const selectFromSearch = (product: any) => {
    setSelectedProduct(product);
    setShowSearch(false);
    setStep("confirm");
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

      // Decrement stock
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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <PackageMinus className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Scoatere Stoc</h1>
          <p className="text-xs text-muted-foreground">Scoatere produse din inventar (nu vânzare)</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs">
        {["Card", "PIN", "Produs", "Confirmare"].map((label, i) => {
          const steps: Step[] = ["card", "pin", "product", "confirm"];
          const isActive = steps.indexOf(step) >= i;
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
              onChange={e => setCardInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCard()}
              placeholder="Cod card angajat..."
              className="h-14 text-lg font-mono"
              autoFocus
            />
          </CardContent>
        </Card>
      )}

      {/* Step: PIN */}
      {step === "pin" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Introdu PIN-ul personal</CardTitle>
            <p className="text-sm text-muted-foreground">Angajat: {employee?.name}</p>
          </CardHeader>
          <CardContent>
            <Input
              type="password"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePin()}
              placeholder="PIN..."
              className="h-14 text-lg text-center tracking-widest"
              autoFocus
              maxLength={6}
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

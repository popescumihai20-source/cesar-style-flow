import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRightLeft, Plus, Trash2, CheckCircle, XCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface TransferLine {
  id: string;
  product_id: string;
  product_name: string;
  base_id: string;
  quantity: number;
  available_stock: number;
}

export default function Transferuri() {
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");

  const { data: locations = [] } = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_locations" as any)
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: sourceStock = [] } = useQuery({
    queryKey: ["inventory-stock", fromLocationId],
    queryFn: async () => {
      if (!fromLocationId) return [];
      const { data, error } = await supabase
        .from("inventory_stock" as any)
        .select("*, products(name, base_id, full_barcode)")
        .eq("location_id", fromLocationId);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!fromLocationId,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["transfer-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_headers" as any)
        .select("*, from_loc:from_location_id(name), to_loc:to_location_id(name), employees:created_by_employee_id(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (activeTab === "new" && fromLocationId && toLocationId) {
      scanRef.current?.focus();
    }
  }, [activeTab, fromLocationId, toLocationId, lines]);

  const findProductByBarcode = useCallback((barcode: string) => {
    let product = products.find((p: any) => p.full_barcode === barcode);
    if (product) return product;

    if (isValidBarcode(barcode)) {
      const parsed = parseBarcode(barcode);
      if (parsed.isValid) {
        product = products.find((p: any) => p.base_id === parsed.baseId);
        if (product) return product;
      }
    }

    product = products.find((p: any) => p.base_id === barcode);
    return product || null;
  }, [products]);

  const fetchProductByBarcode = useCallback(async (barcode: string) => {
    const parsed = isValidBarcode(barcode) ? parseBarcode(barcode) : null;
    const baseId = parsed?.isValid ? parsed.baseId : barcode;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .or(`base_id.eq.${baseId},full_barcode.eq.${barcode}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Transferuri] Product lookup error:", error);
      return null;
    }

    return data as any;
  }, []);

  const getStockForProduct = useCallback((productId: string) => {
    const stockEntry = sourceStock.find((s: any) => s.product_id === productId);
    return stockEntry?.quantity ?? 0;
  }, [sourceStock]);

  const fetchFreshSourceStock = useCallback(async (productId: string) => {
    if (!fromLocationId) return 0;

    const { data, error } = await supabase
      .from("inventory_stock" as any)
      .select("quantity")
      .eq("location_id", fromLocationId)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      console.error("[Transferuri] Stock lookup error:", error);
      return getStockForProduct(productId);
    }

    return (data as any)?.quantity ?? 0;
  }, [fromLocationId, getStockForProduct]);

  const addProductToLines = useCallback(async (product: any) => {
    const available = await fetchFreshSourceStock(product.id);

    if (available <= 0) {
      toast.error(`${product.name} — stoc 0 în locația sursă`);
      return;
    }

    setLines(prev => {
      const existing = prev.find(l => l.product_id === product.id);
      if (existing) {
        if (existing.quantity + 1 > available) {
          toast.error(`${product.name} — stoc insuficient (disponibil: ${available})`);
          return prev;
        }
        return prev.map(l =>
          l.product_id === product.id
            ? { ...l, quantity: l.quantity + 1, available_stock: available }
            : l
        );
      }
      return [...prev, {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        base_id: product.base_id,
        quantity: 1,
        available_stock: available,
      }];
    });
  }, [fetchFreshSourceStock]);

  const handleScan = async () => {
    const trimmed = scanInput.trim();
    if (!trimmed) return;
    setScanInput("");

    if (!fromLocationId || !toLocationId) {
      toast.error("Selectează locația sursă și destinație înainte de scanare");
      return;
    }

    let product = findProductByBarcode(trimmed);
    if (!product) {
      product = await fetchProductByBarcode(trimmed);
    }

    if (product) {
      await addProductToLines(product);
    } else {
      toast.error(`Produs negăsit pentru codul: ${trimmed}`);
    }

    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const updateLineQuantity = (lineId: string, qty: number) => {
    if (qty <= 0) {
      setLines(prev => prev.filter(l => l.id !== lineId));
    } else {
      setLines(prev => prev.map(l => {
        if (l.id !== lineId) return l;
        if (qty > l.available_stock) {
          toast.error(`${l.product_name} — max ${l.available_stock} disponibil`);
          return l;
        }
        return { ...l, quantity: qty };
      }));
    }
  };

  const removeLine = (lineId: string) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const handleConfirmTransfer = async () => {
    // Validations
    if (!fromLocationId) {
      toast.error("Selectează locația sursă");
      return;
    }
    if (!toLocationId) {
      toast.error("Selectează locația destinație");
      return;
    }
    if (fromLocationId === toLocationId) {
      toast.error("Locația sursă și destinație nu pot fi identice");
      return;
    }
    if (lines.length === 0) {
      toast.error("Adaugă cel puțin un produs");
      return;
    }
    const invalidLines = lines.filter(l => l.quantity <= 0 || l.quantity > l.available_stock);
    if (invalidLines.length > 0) {
      toast.error("Verifică cantitățile — unele sunt invalide sau depășesc stocul");
      return;
    }

    // Double-click guard
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let employeeId: string | null = null;
      if (user) {
        const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle();
        employeeId = emp?.id || null;
      }

      const { data: header, error: hErr } = await supabase
        .from("transfer_headers" as any)
        .insert({
          from_location_id: fromLocationId,
          to_location_id: toLocationId,
          created_by_employee_id: employeeId,
          note: note || null,
          status: "draft",
        })
        .select()
        .single();
      if (hErr) throw hErr;

      const lineInserts = lines.map(l => ({
        transfer_id: (header as any).id,
        product_id: l.product_id,
        quantity: l.quantity,
      }));
      const { error: lErr } = await supabase
        .from("transfer_lines" as any)
        .insert(lineInserts);
      if (lErr) throw lErr;

      // Confirm transfer (atomic - audit log written server-side)
      const { error: cErr } = await supabase.rpc("confirm_transfer", {
        p_transfer_id: (header as any).id,
      });
      if (cErr) throw cErr;

      toast.success(`Transfer confirmat: ${lines.reduce((s, l) => s + l.quantity, 0)} produse mutate`);

      setLines([]);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-history"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["products-transfer"] });
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
    } catch (err: any) {
      toast.error(err.message || "Eroare la confirmare transfer");
    }
    setIsSubmitting(false);
  };

  const filteredSearchProducts = searchQuery.length >= 2
    ? products.filter((p: any) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.base_id.includes(searchQuery) ||
        p.full_barcode?.includes(searchQuery)
      )
    : [];

  const fromName = locations.find((l: any) => l.id === fromLocationId)?.name || "";
  const toName = locations.find((l: any) => l.id === toLocationId)?.name || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Transferuri</h1>
            <p className="text-xs text-muted-foreground">Transfer stoc între locații</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === "new" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("new")}>
            <Plus className="h-4 w-4 mr-1" />Transfer Nou
          </Button>
          <Button variant={activeTab === "history" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("history")}>
            Istoric
          </Button>
        </div>
      </div>

      {activeTab === "new" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Din locație</label>
                  <Select value={fromLocationId} onValueChange={(v) => { setFromLocationId(v); setLines([]); }}>
                    <SelectTrigger><SelectValue placeholder="Selectează sursa..." /></SelectTrigger>
                    <SelectContent>
                      {locations.filter((l: any) => l.id !== toLocationId).map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.type === "warehouse" ? "Depozit" : "Magazin"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">În locație</label>
                  <Select value={toLocationId} onValueChange={setToLocationId}>
                    <SelectTrigger><SelectValue placeholder="Selectează destinația..." /></SelectTrigger>
                    <SelectContent>
                      {locations.filter((l: any) => l.id !== fromLocationId).map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.type === "warehouse" ? "Depozit" : "Magazin"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {fromLocationId && toLocationId && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    ref={scanRef}
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleScan()}
                    placeholder="Scanează cod de bare sau caută..."
                    className="h-12 text-lg font-mono flex-1"
                    autoFocus
                  />
                  <Button variant="outline" className="h-12" onClick={() => { setShowSearch(true); setSearchQuery(""); }}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fromName} → {toName} • Scanează repetat = +1 cantitate
                </p>
              </CardContent>
            </Card>
          )}

          {lines.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Produse de transferat ({lines.reduce((s, l) => s + l.quantity, 0)} buc)
                </CardTitle>
              </CardHeader>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cod</TableHead>
                      <TableHead>Produs</TableHead>
                      <TableHead className="text-right">Stoc Sursă</TableHead>
                      <TableHead className="text-right w-24">Cantitate</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => {
                      const overStock = line.quantity > line.available_stock;
                      return (
                        <TableRow key={line.id} className={overStock ? "bg-destructive/5" : ""}>
                          <TableCell className="font-mono text-xs">{line.base_id}</TableCell>
                          <TableCell>{line.product_name}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{line.available_stock}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={e => updateLineQuantity(line.id, parseInt(e.target.value) || 0)}
                              className={`h-8 w-20 text-right text-sm ml-auto ${overStock ? "border-destructive" : ""}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(line.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {lines.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Note transfer (opțional)..."
                  className="h-16"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setLines([]); setNote(""); }}>
                    <XCircle className="h-4 w-4 mr-1" />Anulează
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleConfirmTransfer}
                    disabled={isSubmitting || lines.some(l => l.quantity > l.available_stock) || lines.some(l => l.quantity <= 0)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {isSubmitting ? "Se procesează..." : "Confirmă Transfer"}
                  </Button>
                </div>
                {lines.some(l => l.quantity > l.available_stock) && (
                  <p className="text-xs text-destructive">⚠ Unele produse depășesc stocul disponibil</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Istoric Transferuri</CardTitle>
          </CardHeader>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Din</TableHead>
                  <TableHead>În</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Creat de</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("ro-RO")}
                    </TableCell>
                    <TableCell>{t.from_loc?.name || "—"}</TableCell>
                    <TableCell>{t.to_loc?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={t.status === "confirmed" ? "default" : t.status === "cancelled" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{t.employees?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.note || "—"}</TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Niciun transfer încă
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Caută produs</DialogTitle></DialogHeader>
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Caută după nume sau cod..."
            autoFocus
          />
          <div className="max-h-80 overflow-auto space-y-1">
            {filteredSearchProducts.map((p: any) => {
              const stock = getStockForProduct(p.id);
              return (
                <button
                  key={p.id}
                  className="w-full flex justify-between p-3 rounded-lg hover:bg-muted text-left"
                  onClick={async () => { await addProductToLines(p); setShowSearch(false); setTimeout(() => scanRef.current?.focus(), 50); }}
                  disabled={false}
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.base_id}</p>
                  </div>
                  <p className={`text-sm ${stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    Stoc: {stock}
                  </p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Package, ArrowRightLeft, Truck, PackageMinus, Plus, Minus } from "lucide-react";

export default function DepozitTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch products with depozit stock
  const { data: products = [] } = useQuery({
    queryKey: ["products-depozit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent transfers
  const { data: transfers = [] } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers" as any)
        .select("*, products(name, base_id)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const depozitProducts = products.filter(
    (p: any) => p.stock_depozit > 0 || searchTerm
      ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.base_id.toLowerCase().includes(searchTerm.toLowerCase())
      : false
  );

  const allDepozitProducts = products.filter((p: any) => p.stock_depozit > 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Produse în Depozit</p>
            <p className="text-2xl font-bold font-mono">{allDepozitProducts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Unități Depozit</p>
            <p className="text-2xl font-bold font-mono">
              {allDepozitProducts.reduce((s: number, p: any) => s + p.stock_depozit, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Transferuri Recent</p>
            <p className="text-2xl font-bold font-mono">{transfers.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stoc" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stoc"><Package className="h-3 w-3 mr-1" />Stoc Depozit</TabsTrigger>
          <TabsTrigger value="receptie"><Truck className="h-3 w-3 mr-1" />Recepție</TabsTrigger>
          <TabsTrigger value="transfer"><ArrowRightLeft className="h-3 w-3 mr-1" />Transfer</TabsTrigger>
          <TabsTrigger value="scoatere"><PackageMinus className="h-3 w-3 mr-1" />Scoatere</TabsTrigger>
        </TabsList>

        {/* Stoc Depozit */}
        <TabsContent value="stoc">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Stoc Depozit</CardTitle>
                <Input
                  placeholder="Caută produs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right">Stoc Depozit</TableHead>
                    <TableHead className="text-right">Stoc Magazin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(searchTerm ? products.filter((p: any) =>
                    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.base_id.toLowerCase().includes(searchTerm.toLowerCase())
                  ) : products.filter((p: any) => p.active)).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.base_id}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${p.stock_depozit > 0 ? "" : "text-muted-foreground"}`}>{p.stock_depozit}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{p.stock_general}</TableCell>
                    </TableRow>
                  ))}
                  {products.filter((p: any) => p.active).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Niciun produs activ
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Recepție Depozit */}
        <TabsContent value="receptie">
          <ReceptieDepozit products={products} queryClient={queryClient} />
        </TabsContent>

        {/* Transfer */}
        <TabsContent value="transfer">
          <TransferDepozit products={products} queryClient={queryClient} />
        </TabsContent>

        {/* Scoatere */}
        <TabsContent value="scoatere">
          <ScoatereDepozit products={products} queryClient={queryClient} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceptieDepozit({ products, queryClient }: { products: any[]; queryClient: any }) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReceptie = async () => {
    if (!selectedProduct || quantity <= 0) return;
    setLoading(true);
    try {
      const product = products.find((p: any) => p.id === selectedProduct);
      if (!product) throw new Error("Produs negăsit");

      // Create receipt record
      const { data: receipt, error: rErr } = await supabase
        .from("stock_receipts_depozit" as any)
        .insert({ notes: notes || null })
        .select()
        .single();
      if (rErr) throw rErr;

      // Create receipt item
      const { error: iErr } = await supabase
        .from("stock_receipt_items_depozit" as any)
        .insert({
          receipt_id: (receipt as any).id,
          product_id: selectedProduct,
          quantity,
          cost_price: product.cost_price,
        });
      if (iErr) throw iErr;

      // Update stock_depozit
      const { error: uErr } = await supabase
        .from("products")
        .update({ stock_depozit: product.stock_depozit + quantity } as any)
        .eq("id", selectedProduct);
      if (uErr) throw uErr;

      toast.success(`Recepție: +${quantity} × ${product.name} în depozit`);
      setSelectedProduct("");
      setQuantity(1);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recepție Marfă în Depozit</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger><SelectValue placeholder="Selectează produs" /></SelectTrigger>
            <SelectContent>
              {products.filter((p: any) => p.active).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.base_id} – {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Cantitate" />
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (opțional)" />
        </div>
        <Button onClick={handleReceptie} disabled={!selectedProduct || quantity <= 0 || loading}>
          <Plus className="h-4 w-4 mr-1" />Adaugă în Depozit
        </Button>
      </CardContent>
    </Card>
  );
}

function TransferDepozit({ products, queryClient }: { products: any[]; queryClient: any }) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState("depozit_to_magazin");
  const [loading, setLoading] = useState(false);

  const handleTransfer = async () => {
    if (!selectedProduct || quantity <= 0) return;
    setLoading(true);
    try {
      const product = products.find((p: any) => p.id === selectedProduct);
      if (!product) throw new Error("Produs negăsit");

      if (direction === "depozit_to_magazin") {
        if (product.stock_depozit < quantity) {
          toast.error("Stoc insuficient în depozit");
          setLoading(false);
          return;
        }
        // Move from depozit to magazin
        const { error } = await supabase
          .from("products")
          .update({
            stock_depozit: product.stock_depozit - quantity,
            stock_general: product.stock_general + quantity,
          } as any)
          .eq("id", selectedProduct);
        if (error) throw error;
      } else {
        if (product.stock_general < quantity) {
          toast.error("Stoc insuficient în magazin");
          setLoading(false);
          return;
        }
        const { error } = await supabase
          .from("products")
          .update({
            stock_depozit: product.stock_depozit + quantity,
            stock_general: product.stock_general - quantity,
          } as any)
          .eq("id", selectedProduct);
        if (error) throw error;
      }

      // Log transfer
      await supabase.from("stock_transfers" as any).insert({
        product_id: selectedProduct,
        quantity,
        direction,
      });

      const label = direction === "depozit_to_magazin" ? "Depozit → Magazin" : "Magazin → Depozit";
      toast.success(`Transfer: ${quantity} × ${product.name} (${label})`);
      setSelectedProduct("");
      setQuantity(1);
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  const depozitProducts = products.filter((p: any) =>
    direction === "depozit_to_magazin" ? p.stock_depozit > 0 : p.stock_general > 0
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Transfer Între Gestiuni</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="depozit_to_magazin">Depozit → Magazin</SelectItem>
              <SelectItem value="magazin_to_depozit">Magazin → Depozit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger><SelectValue placeholder="Selectează produs" /></SelectTrigger>
            <SelectContent>
              {depozitProducts.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.base_id} – {p.name} (stoc: {direction === "depozit_to_magazin" ? p.stock_depozit : p.stock_general})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Cantitate" />
        </div>
        <Button onClick={handleTransfer} disabled={!selectedProduct || quantity <= 0 || loading}>
          <ArrowRightLeft className="h-4 w-4 mr-1" />Transferă
        </Button>
      </CardContent>
    </Card>
  );
}

function ScoatereDepozit({ products, queryClient }: { products: any[]; queryClient: any }) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleScoatere = async () => {
    if (!selectedProduct || quantity <= 0) return;
    setLoading(true);
    try {
      const product = products.find((p: any) => p.id === selectedProduct);
      if (!product) throw new Error("Produs negăsit");
      if (product.stock_depozit < quantity) {
        toast.error("Stoc insuficient în depozit");
        setLoading(false);
        return;
      }

      // Update stock
      const { error } = await supabase
        .from("products")
        .update({ stock_depozit: product.stock_depozit - quantity } as any)
        .eq("id", selectedProduct);
      if (error) throw error;

      // Log removal
      // We need an employee_id - get it from current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).single();
        if (emp) {
          await supabase.from("stock_removals_depozit" as any).insert({
            product_id: selectedProduct,
            quantity,
            reason: reason || null,
            employee_id: emp.id,
          });
        }
      }

      toast.success(`Scoatere depozit: -${quantity} × ${product.name}`);
      setSelectedProduct("");
      setQuantity(1);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  const depozitProducts = products.filter((p: any) => p.stock_depozit > 0);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Scoatere din Depozit</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger><SelectValue placeholder="Selectează produs" /></SelectTrigger>
            <SelectContent>
              {depozitProducts.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.base_id} – {p.name} (stoc: {p.stock_depozit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Cantitate" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motiv (opțional)" />
        </div>
        <Button variant="destructive" onClick={handleScoatere} disabled={!selectedProduct || quantity <= 0 || loading}>
          <Minus className="h-4 w-4 mr-1" />Scoate din Depozit
        </Button>
      </CardContent>
    </Card>
  );
}

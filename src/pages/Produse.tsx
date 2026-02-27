import { useState } from "react";
import { Package, Plus, Search, Filter, Edit, Trash2, Eye, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Product } from "@/types/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ProductVariantsEditor } from "@/components/products/ProductVariantsEditor";

const CATEGORIES = ["Costume", "Sacouri", "Pantaloni", "Camasi", "Tricouri", "Pulovere", "Geci", "Paltoane", "Incaltaminte", "Veste", "Accesorii"];
const SEASONS: Array<{ value: string; label: string }> = [
  { value: "permanent", label: "Permanent" },
  { value: "iarna", label: "Iarnă" },
  { value: "vara", label: "Vară" },
  { value: "tranzitie", label: "Tranziție" },
];

export default function Produse() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showVariants, setShowVariants] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [form, setForm] = useState({
    base_id: "", name: "", category: "", brand: "",
    selling_price: 0, cost_price: 0, stock_general: 0,
    seasonal_tag: "permanent" as string, tags: "",
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.base_id.includes(search)) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (seasonFilter !== "all" && p.seasonal_tag !== seasonFilter) return false;
    if (activeFilter === "active" && !p.active) return false;
    if (activeFilter === "inactive" && p.active) return false;
    return true;
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        base_id: data.base_id,
        name: data.name,
        category: data.category || null,
        brand: data.brand || null,
        selling_price: data.selling_price,
        cost_price: data.cost_price,
        stock_general: data.stock_general,
        seasonal_tag: data.seasonal_tag as any,
        tags: data.tags ? data.tags.split(",").map(t => t.trim()) : [],
      };
      if (editingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      toast({ title: editingProduct ? "Produs actualizat" : "Produs creat" });
      setShowForm(false);
      setEditingProduct(null);
    },
    onError: (err: any) => {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      toast({ title: "Produs șters" });
    },
  });

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ base_id: "", name: "", category: "", brand: "", selling_price: 0, cost_price: 0, stock_general: 0, seasonal_tag: "permanent", tags: "" });
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      base_id: p.base_id, name: p.name, category: p.category || "",
      brand: p.brand || "", selling_price: p.selling_price, cost_price: p.cost_price,
      stock_general: p.stock_general, seasonal_tag: p.seasonal_tag,
      tags: (p.tags || []).join(", "),
    });
    setShowForm(true);
  };

  const exportCSV = () => {
    const headers = ["Base ID", "Nume", "Categorie", "Brand", "Preț Vânzare", "Stoc", "Sezon", "Activ"];
    const rows = filtered.map(p => [p.base_id, p.name, p.category, p.brand, p.selling_price, p.stock_general, p.seasonal_tag, p.active]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "produse.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Produse</h1>
            <p className="text-xs text-muted-foreground">{products.length} produse în catalog</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Produs Nou</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută produs..." className="pl-9 h-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate categoriile</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={seasonFilter} onValueChange={setSeasonFilter}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Sezon" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate sezoanele</SelectItem>
              {SEASONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Product table */}
      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cod</TableHead>
                <TableHead>Nume</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Preț</TableHead>
                <TableHead className="text-right">Stoc</TableHead>
                <TableHead>Sezon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.base_id}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category || "—"}</TableCell>
                  <TableCell>{p.brand || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{p.selling_price.toFixed(2)}</TableCell>
                  <TableCell className={`text-right font-mono ${p.stock_general <= 0 ? "text-destructive" : ""}`}>{p.stock_general}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{p.seasonal_tag}</Badge></TableCell>
                  <TableCell>{p.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowVariants(p.id)}><Eye className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Niciun produs găsit</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editare Produs" : "Produs Nou"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Base ID</Label><Input value={form.base_id} onChange={e => setForm({...form, base_id: e.target.value})} disabled={!!editingProduct} /></div>
              <div><Label>Nume</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categorie</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue placeholder="Selectează" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Brand</Label><Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Preț vânzare (RON)</Label><Input type="number" value={form.selling_price} onChange={e => setForm({...form, selling_price: parseFloat(e.target.value) || 0})} /></div>
              <div><Label>Preț achiziție (RON)</Label><Input type="number" value={form.cost_price} onChange={e => setForm({...form, cost_price: parseFloat(e.target.value) || 0})} /></div>
              <div><Label>Stoc general</Label><Input type="number" value={form.stock_general} onChange={e => setForm({...form, stock_general: parseInt(e.target.value) || 0})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sezon</Label>
                <Select value={form.seasonal_tag} onValueChange={v => setForm({...form, seasonal_tag: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEASONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Taguri (separate prin virgulă)</Label><Input value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variants dialog */}
      {showVariants && (
        <Dialog open={!!showVariants} onOpenChange={() => setShowVariants(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Variante Produs</DialogTitle>
            </DialogHeader>
            <ProductVariantsEditor productId={showVariants} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

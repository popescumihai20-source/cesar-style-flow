import { useMemo, useState, useRef } from "react";
import { Package, Plus, Search, Edit, Trash2, Eye, Store, Warehouse, Upload, X, Image as ImageIcon, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Product } from "@/types/pos";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ProductVariantsEditor } from "@/components/products/ProductVariantsEditor";
import { TooltipProvider } from "@/components/ui/tooltip";

const CATEGORIES = ["Costume", "Sacouri", "Pantaloni", "Camasi", "Tricouri", "Pulovere", "Geci", "Paltoane", "Incaltaminte", "Veste", "Accesorii"];
const SEASONS: Array<{ value: string; label: string }> = [
  { value: "permanent", label: "Permanent" },
  { value: "iarna", label: "Iarnă" },
  { value: "vara", label: "Vară" },
  { value: "tranzitie", label: "Tranziție" },
];

export default function Produse() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showVariants, setShowVariants] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProducatori } = useProducatorDictionary();
  const { activeEntries: articolEntries } = useArticolDictionary();

  const extractPriceFromBarcode = (p: Product): number | null => {
    const barcode = String((p as any).full_barcode || "").trim();
    if (!/^\d{17}$/.test(barcode)) return null;
    const priceStr = barcode.slice(-4);
    const price = Number.parseInt(priceStr, 10);
    return Number.isNaN(price) ? null : price;
  };

  const resolveCategory = (p: Product) => {
    if (p.category) return p.category;
    const artCode = p.base_id?.substring(0, 2);
    const artName = articolEntries.find(a => a.code === artCode)?.name;
    return artName || "Necunoscut";
  };

  const resolveBrand = (p: Product) => {
    if (p.brand) return p.brand;
    const prodCode = p.base_id?.substring(4, 6);
    const prodName = activeProducatori.find(pr => pr.code === prodCode)?.name;
    return prodName || "Necunoscut";
  };

  const [form, setForm] = useState({
    base_id: "", name: "", category: "", brand: "",
    selling_price: 0, cost_price: 0, stock_general: 0,
    seasonal_tag: "permanent" as string, tags: "",
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const allProducts: Product[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("name")
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allProducts.push(...(data as Product[]));

        if (data.length < pageSize) break;
        from += pageSize;
      }

      return allProducts;
    },
  });

  // Fetch stock values from inventory_stock (pre-computed during import)
  const { data: inventoryStockData = [] } = useQuery({
    queryKey: ["inventory-stock-values"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const allRows: any[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("inventory_stock")
          .select("product_id, location_id, quantity, stock_value, inventory_locations(type, name, code)")
          .order("id")
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);

        if (data.length < pageSize) break;
        from += pageSize;
      }

      return allRows;
    },
  });

  const { data: importDebugStockData = [] } = useQuery({
    queryKey: ["inventory-import-stock-fallback"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const allRows: any[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("inventory_import_debug_lines" as any)
          .select("product_id, location_id, location_name, quantity, line_value")
          .not("product_id", "is", null)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.warn("Stoc fallback indisponibil:", error.message);
          return [];
        }
        if (!data || data.length === 0) break;

        allRows.push(...data);

        if (data.length < pageSize) break;
        from += pageSize;
      }

      return allRows;
    },
  });

  // Active locations (drives the per-location tabs)
  const { data: locations = [] } = useQuery({
    queryKey: ["inventory-locations-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_locations" as any)
        .select("id, name, type, code")
        .eq("active", true)
        .order("type", { ascending: true })
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Build a map: location_id -> Map<product_id, { qty, value }>
  const stockByLocation = useMemo(() => {
    const map = new Map<string, Map<string, { qty: number; value: number }>>();
    const activeLocations = locations as any[];
    const resolveLocationId = (row: any) => {
      const rowLocationId = String(row.location_id || "");
      const rowLocationName = String(row.location_name || row.inventory_locations?.name || "").toLowerCase();
      const exact = activeLocations.find((loc) => loc.id === rowLocationId);
      if (exact) return exact.id;

      const byName = activeLocations.find((loc) => String(loc.name || "").toLowerCase() === rowLocationName);
      if (byName) return byName.id;

      if (rowLocationName.includes("depozit")) {
        return activeLocations.find((loc) => loc.type === "warehouse" || String(loc.code || "").toLowerCase().includes("depozit"))?.id || rowLocationId;
      }

      if (rowLocationName.includes("ferdinand")) {
        return activeLocations.find((loc) => String(loc.name || "").toLowerCase().includes("ferdinand"))?.id || rowLocationId;
      }

      if (rowLocationName.includes("tei")) {
        return activeLocations.find((loc) => String(loc.name || "").toLowerCase().includes("tei"))?.id || rowLocationId;
      }

      return rowLocationId;
    };

    const addStock = (locationId: string, productId: string, qty: number, value: number) => {
      if (!locationId || !productId) return;
      if (!map.has(locationId)) map.set(locationId, new Map());
      const inner = map.get(locationId)!;
      const existing = inner.get(productId) || { qty: 0, value: 0 };
      existing.qty += qty;
      existing.value += value;
      inner.set(productId, existing);
    };

    for (const row of inventoryStockData) {
      addStock(
        resolveLocationId(row),
        (row as any).product_id as string,
        Number((row as any).quantity || 0),
        Number((row as any).stock_value || 0),
      );
    }

    if (inventoryStockData.length === 0) {
      for (const row of importDebugStockData) {
        addStock(
          resolveLocationId(row),
          (row as any).product_id as string,
          Number((row as any).quantity || 0),
          Number((row as any).line_value || 0),
        );
      }
    }
    return map;
  }, [importDebugStockData, inventoryStockData, locations]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");

  const uploadImages = async (productId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of imageFiles) {
      const ext = file.name.split(".").pop();
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      setIsUploading(true);
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
        images: existingImages,
      };

      if (editingProduct) {
        // Upload new images
        if (imageFiles.length > 0) {
          const newUrls = await uploadImages(editingProduct.id);
          payload.images = [...existingImages, ...newUrls];
        }
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { data: newProd, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        if (imageFiles.length > 0) {
          const newUrls = await uploadImages(newProd.id);
          await supabase.from("products").update({ images: newUrls }).eq("id", newProd.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      toast({ title: editingProduct ? "Produs actualizat" : "Produs creat" });
      setShowForm(false);
      setEditingProduct(null);
      setImageFiles([]);
      setImagePreviews([]);
      setExistingImages([]);
    },
    onError: (err: any) => {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    },
    onSettled: () => setIsUploading(false),
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
    setImageFiles([]);
    setImagePreviews([]);
    setExistingImages([]);
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
    setExistingImages(p.images || []);
    setImageFiles([]);
    setImagePreviews([]);
    setShowForm(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeExistingImage = (url: string) => {
    setExistingImages(prev => prev.filter(u => u !== url));
  };

  const removeNewImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const exportCSV = () => {
    const headers = ["Base ID", "Nume", "Categorie", "Brand", "Preț Vânzare", "Stoc", "Sezon", "Activ"];
    const rows = products.map(p => [p.base_id, p.name, p.category, p.brand, p.selling_price, p.stock_general, p.seasonal_tag, p.active]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "produse.csv"; a.click();
  };

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const fb = String((p as any).full_barcode || "").toLowerCase();
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.base_id.toLowerCase().includes(q) ||
          fb.includes(q);
        if (!hit) return false;
      }
      if (selectedLocationId !== "all") {
        const qty = stockByLocation.get(selectedLocationId)?.get(p.id)?.qty ?? 0;
        if (qty <= 0) return false;
      }
      return true;
    });
  }, [products, search, selectedLocationId, stockByLocation]);

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Package className="h-9 w-9 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Produse</h1>
            <p className="text-base text-muted-foreground">{products.length} produse în catalog</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
          <Button onClick={openCreate}><Plus className="h-5 w-5 mr-2" />Produs Nou</Button>
        </div>
      </div>

      {/* Big search bar */}
      <div className="relative">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Caută după nume sau cod..."
          className="h-16 pl-14 text-lg rounded-xl shadow-sm"
        />
      </div>

      {/* Location filter buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant={selectedLocationId === "all" ? "default" : "outline"}
          size="lg"
          className="h-14 px-6 text-base"
          onClick={() => setSelectedLocationId("all")}
        >
          <MapPin className="h-5 w-5 mr-2" />
          Toate locațiile
        </Button>
        {locations.map((loc: any) => {
          const Icon = loc.type === "warehouse" ? Warehouse : Store;
          const inner = stockByLocation.get(loc.id);
          let totalQty = 0;
          if (inner) for (const v of inner.values()) totalQty += v.qty;
          const active = selectedLocationId === loc.id;
          return (
            <Button
              key={loc.id}
              variant={active ? "default" : "outline"}
              size="lg"
              className="h-14 px-6 text-base"
              onClick={() => setSelectedLocationId(loc.id)}
            >
              <Icon className="h-5 w-5 mr-2" />
              {loc.name}
              <Badge variant="secondary" className="ml-3 text-sm">{totalQty}</Badge>
            </Button>
          );
        })}
      </div>

      {/* Product cards */}
      {isLoading ? (
        <div className="text-center py-16 text-lg text-muted-foreground">Se încarcă...</div>
      ) : visibleProducts.length === 0 ? (
        <div className="text-center py-16 text-lg text-muted-foreground">Niciun produs găsit</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleProducts.map((p) => {
            const price = extractPriceFromBarcode(p);
            const barcode = (p as any).full_barcode || p.base_id;
            return (
              <Card key={p.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="flex">
                  {/* Image */}
                  <div className="w-32 h-32 flex-shrink-0 bg-muted flex items-center justify-center">
                    {p.images && p.images.length > 0 ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                    )}
                  </div>

                  {/* Info */}
                  <CardContent className="flex-1 p-4 space-y-2 min-w-0">
                    <div>
                      <h3 className="text-lg font-bold leading-tight truncate" title={p.name}>{p.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono truncate" title={barcode}>{barcode}</p>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {price !== null ? `${price} lei` : "—"}
                      </span>
                      <Badge variant="secondary" className="text-sm">{resolveCategory(p)}</Badge>
                    </div>

                    {/* Stock per location */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {locations.map((loc: any) => {
                        const qty = stockByLocation.get(loc.id)?.get(p.id)?.qty ?? 0;
                        const ok = qty > 0;
                        return (
                          <div
                            key={loc.id}
                            className={`flex items-center gap-1.5 text-sm px-2 py-1 rounded-md ${
                              ok ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                            }`}
                            title={`${loc.name}: ${qty} buc`}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
                            <span className="font-medium">{loc.name}</span>
                            <span className="font-bold">{qty}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-1 pt-1">
                      <Button variant="ghost" size="icon" onClick={() => setShowVariants(p.id)} title="Variante"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editează"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)} title="Șterge"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editare Produs" : "Produs Nou"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Base ID</Label><Input value={form.base_id} onChange={e => setForm({...form, base_id: e.target.value})} disabled className="bg-muted" /></div>
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

            {/* Image upload */}
            <div>
              <Label>Imagini produs</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {existingImages.map((url, i) => (
                  <div key={`existing-${i}`} className="relative h-16 w-16 rounded border border-border overflow-hidden group">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => removeExistingImage(url)} className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {imagePreviews.map((preview, i) => (
                  <div key={`new-${i}`} className="relative h-16 w-16 rounded border border-primary/50 overflow-hidden group">
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => removeNewImage(i)} className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()} className="h-16 w-16 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || isUploading}>
              {saveMutation.isPending || isUploading ? "Se salvează..." : "Salvează"}
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
    </TooltipProvider>
  );
}

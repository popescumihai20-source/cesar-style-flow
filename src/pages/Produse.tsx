import { useMemo, useState, useRef } from "react";
import { Package, Plus, Search, Edit, Trash2, Eye, Store, Warehouse, Upload, X, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Product } from "@/types/pos";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ProductVariantsEditor } from "@/components/products/ProductVariantsEditor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CATEGORIES = ["Costume", "Sacouri", "Pantaloni", "Camasi", "Tricouri", "Pulovere", "Geci", "Paltoane", "Incaltaminte", "Veste", "Accesorii"];
const SEASONS: Array<{ value: string; label: string }> = [
  { value: "permanent", label: "Permanent" },
  { value: "iarna", label: "Iarnă" },
  { value: "vara", label: "Vară" },
  { value: "tranzitie", label: "Tranziție" },
];

type StockValueDebugRow = {
  id: string;
  name: string;
  barcode: string;
  extractedPrice: number | null;
  overridePrice: number | null;
  finalPriceUsed: number | null;
  isPriceOverridden: boolean;
  quantity: number;
  lineValue: number;
  status: "included" | "skipped_invalid_barcode";
};

export default function Produse() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
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

  const [expectedTotalInput, setExpectedTotalInput] = useState("4092392");

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
          .select("product_id, location_id, quantity, stock_value, inventory_locations(type)")
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

  const stockValueDebug = useMemo(() => {
    // Build a map: product_id → { depozitValue, magazinValue, depozitQty, magazinQty }
    const stockMap = new Map<string, { depozitValue: number; magazinValue: number; depozitQty: number; magazinQty: number }>();
    for (const row of inventoryStockData) {
      const locType = (row as any).inventory_locations?.type;
      const entry = stockMap.get(row.product_id) || { depozitValue: 0, magazinValue: 0, depozitQty: 0, magazinQty: 0 };
      if (locType === "warehouse") {
        entry.depozitValue += Number(row.stock_value || 0);
        entry.depozitQty += Number(row.quantity || 0);
      } else if (locType === "store") {
        entry.magazinValue += Number(row.stock_value || 0);
        entry.magazinQty += Number(row.quantity || 0);
      }
      stockMap.set(row.product_id, entry);
    }

    let rowsSkipped = 0;
    let depozitTotal = 0;
    let magazinTotal = 0;
    const rows: StockValueDebugRow[] = products.map((p) => {
      const barcode = String((p as any).full_barcode || "").trim();
      const stockEntry = stockMap.get(p.id);
      const depozitValue = stockEntry?.depozitValue ?? 0;
      const magazinValue = stockEntry?.magazinValue ?? 0;
      const lineValue = depozitValue + magazinValue;
      // Use inventory_stock qty if available, otherwise fall back to products legacy columns
      const quantityDepozit = stockEntry?.depozitQty ?? Number((p as any).stock_depozit || 0);
      const quantityMagazin = stockEntry?.magazinQty ?? Number(p.stock_general || 0);
      const quantity = quantityDepozit + quantityMagazin;
      const extractedPrice = extractPriceFromBarcode(p);
      const isValidBarcode = /^\d{17}$/.test(barcode);
      const status = isValidBarcode ? "included" : "skipped_invalid_barcode";

      if (!isValidBarcode) rowsSkipped += 1;
      magazinTotal += magazinValue;
      depozitTotal += depozitValue;

      return {
        id: p.id,
        name: p.name,
        barcode,
        extractedPrice,
        quantity,
        lineValue,
        status,
      };
    });

    const totalComputed = depozitTotal + magazinTotal;
    const expected = Number.parseInt(expectedTotalInput, 10);
    const difference = Number.isNaN(expected) ? null : totalComputed - expected;

    return {
      rows,
      rowsProcessed: rows.length,
      rowsSkipped,
      rowsIncluded: rows.length - rowsSkipped,
      magazinTotal,
      depozitTotal,
      totalComputed,
      expectedTotal: Number.isNaN(expected) ? null : expected,
      difference,
    };
  }, [products, inventoryStockData, expectedTotalInput]);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.base_id.includes(search) && !(p as any).full_barcode?.includes(search)) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (seasonFilter !== "all" && p.seasonal_tag !== seasonFilter) return false;
    if (activeFilter === "active" && !p.active) return false;
    if (activeFilter === "inactive" && p.active) return false;
    // Magazin tab: only show products with stock in magazin
    if (p.stock_general <= 0) return false;
    return true;
  });

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
    const rows = filtered.map(p => [p.base_id, p.name, p.category, p.brand, p.selling_price, p.stock_general, p.seasonal_tag, p.active]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "produse.csv"; a.click();
  };

  const exportStockValueDebug = () => {
    const headers = ["Barcode", "ExtractedPrice", "Quantity", "LineValue", "Status", "ProductName"];
    const rows = stockValueDebug.rows.map((row) => [
      row.barcode,
      row.extractedPrice ?? "",
      row.quantity,
      row.lineValue,
      row.status,
      row.name,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock-value-debug.csv";
    a.click();
  };

  return (
    <TooltipProvider>
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
          <Button variant="outline" size="sm" onClick={exportStockValueDebug}>Debug CSV</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Produs Nou</Button>
        </div>
      </div>

      <Tabs defaultValue="magazin" className="space-y-4">
        <TabsList>
          <TabsTrigger value="magazin" className="gap-1.5">
            <Store className="h-3.5 w-3.5" />Magazin Ferdinand
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono">
              {products.reduce((s, p) => s + (p.stock_general ?? 0), 0)} buc
            </Badge>
            <Badge variant="outline" className="ml-0.5 text-[10px] px-1.5 py-0 font-mono">
              {stockValueDebug.magazinTotal.toLocaleString("ro-RO")} lei
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="depozit" className="gap-1.5">
            <Warehouse className="h-3.5 w-3.5" />Depozit
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono">
              {products.reduce((s, p) => s + (p.stock_depozit ?? 0), 0)} buc
            </Badge>
            <Badge variant="outline" className="ml-0.5 text-[10px] px-1.5 py-0 font-mono">
              {stockValueDebug.depozitTotal.toLocaleString("ro-RO")} lei
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="magazin" className="space-y-4">
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

          <Card>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
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
                  {filtered.map(p => {
                    const isZeroStock = p.stock_general <= 0;
                    return (
                    <TableRow key={p.id} className={isZeroStock ? "opacity-60" : ""}>
                      <TableCell>
                        {p.images && p.images.length > 0 ? (
                          <img src={p.images[0]} alt={p.name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${isZeroStock ? "text-muted-foreground" : ""}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-pointer underline decoration-dotted">{(p as any).full_barcode || p.base_id}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="font-mono text-sm">
                            {(p as any).full_barcode || p.base_id}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className={`font-medium ${isZeroStock ? "text-muted-foreground" : ""}`}>
                        {p.name}
                        {(() => {
                          const prodCode = p.base_id?.substring(4, 6);
                          const prodName = activeProducatori.find(pr => pr.code === prodCode)?.name;
                          return prodName ? <span className="block text-[10px] text-muted-foreground font-normal">{prodName}</span> : null;
                        })()}
                      </TableCell>
                      <TableCell className={isZeroStock ? "text-muted-foreground" : ""}>{resolveCategory(p)}</TableCell>
                      <TableCell className={isZeroStock ? "text-muted-foreground" : ""}>{resolveBrand(p)}</TableCell>
                      <TableCell className={`text-right font-mono ${isZeroStock ? "text-muted-foreground" : ""}`}>{extractPriceFromBarcode(p)?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{p.stock_general}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs">{p.seasonal_tag}</Badge>
                          {isZeroStock && <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border px-1.5 py-0">Stoc 0</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{p.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowVariants(p.id)}><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Niciun produs găsit</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="depozit" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Stoc Depozit</CardTitle>
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută produs..." className="pl-9 h-9" />
                </div>
              </div>
            </CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Nume</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead className="text-right">Stoc Depozit</TableHead>
                    <TableHead className="text-right">Stoc Magazin</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.filter((p: any) => {
                    if ((p.stock_depozit ?? 0) <= 0) return false;
                    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.base_id.includes(search)) return false;
                    return p.active;
                  }).map((p: any) => {
                    const isZeroDepozit = (p.stock_depozit ?? 0) <= 0;
                    return (
                    <TableRow key={p.id} className={isZeroDepozit ? "opacity-60" : ""}>
                      <TableCell className={`font-mono text-xs ${isZeroDepozit ? "text-muted-foreground" : ""}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-pointer underline decoration-dotted">{(p as any).full_barcode || p.base_id}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="font-mono text-sm">
                            {(p as any).full_barcode || p.base_id}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className={`font-medium ${isZeroDepozit ? "text-muted-foreground" : ""}`}>{p.name}</TableCell>
                      <TableCell className={isZeroDepozit ? "text-muted-foreground" : ""}>{resolveCategory(p)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${isZeroDepozit ? "text-muted-foreground" : ""}`}>{p.stock_depozit ?? 0}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{p.stock_general}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {p.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}
                          {isZeroDepozit && <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border px-1.5 py-0">Stoc 0</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Debug calcul valoare stoc</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rows procesate</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.rowsProcessed}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rows incluse</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.rowsIncluded}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rows sărite</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.rowsSkipped}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total calculat</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.totalComputed.toLocaleString("ro-RO")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Excel total așteptat</Label>
              <Input
                value={expectedTotalInput}
                onChange={(e) => setExpectedTotalInput(e.target.value)}
                className="font-mono"
                placeholder="4092392"
              />
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Diferență (calculat - Excel)</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.difference?.toLocaleString("ro-RO") ?? "—"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Excel (input)</p>
              <p className="font-mono text-lg font-semibold">{stockValueDebug.expectedTotal?.toLocaleString("ro-RO") ?? "—"}</p>
            </div>
          </div>

          <div className="overflow-auto max-h-80 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Preț extras</TableHead>
                  <TableHead className="text-right">Cantitate</TableHead>
                  <TableHead className="text-right">Valoare linie</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockValueDebug.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.barcode || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{row.extractedPrice ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{row.lineValue}</TableCell>
                    <TableCell>
                      {row.status === "included" ? (
                        <Badge variant="secondary" className="text-xs">inclus</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">barcode invalid</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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

import { useState } from "react";
import { Settings, BarChart3, Package, Users, Monitor, Circle, FileDown, Receipt, AlertTriangle, Warehouse, UserCheck, BookOpen, Barcode, Lock, Eye, Ban, ClipboardList, Upload, ChevronDown, ArrowRightLeft, PackageCheck } from "lucide-react";
import DepozitTab from "@/components/admin/DepozitTab";
import EmployeesTab from "@/components/admin/EmployeesTab";
import DevicesTab from "@/components/admin/DevicesTab";
import BulineTab from "@/components/admin/BulineTab";
import ReportsTab from "@/components/admin/ReportsTab";
import CustomersTab from "@/components/admin/CustomersTab";
import ArticolDictionaryTab from "@/components/admin/ArticolDictionaryTab";
import ProducatorDictionaryTab from "@/components/admin/ProducatorDictionaryTab";
import BarcodeGeneratorTab from "@/components/admin/BarcodeGeneratorTab";
import StockPinSettingsTab from "@/components/admin/StockPinSettingsTab";
import InventarierTab from "@/components/admin/InventarierTab";
import ImportInventoryTab from "@/components/admin/ImportInventoryTab";
import InitialStockLoadTab from "@/components/admin/InitialStockLoadTab";
import TransferReportsTab from "@/components/admin/TransferReportsTab";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [fiscalInput, setFiscalInput] = useState("");
  const [activeTab, setActiveTab] = useState("sales");

  // KPI data from DB (accurate, no row limits)
  const { data: kpis } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_kpis");
      if (error) throw error;
      return data as {
        total_products: number;
        active_products: number;
        low_stock_count: number;
        zero_stock_count: number;
        sales_today_count: number;
        sales_today_total: number;
        sales_week_count: number;
        sales_week_total: number;
        sales_month_count: number;
        sales_month_total: number;
        pending_fiscal: number;
      };
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["admin-sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("*, employees:cashier_employee_id(name)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase.from("products").select("*").order("name").range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  // Sale items for detail view
  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale-items", selectedSale?.id],
    queryFn: async () => {
      if (!selectedSale) return [];
      const { data, error } = await supabase.from("sale_items").select("*, products(name, base_id)").eq("sale_id", selectedSale.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedSale,
  });

  const fiscalMutation = useMutation({
    mutationFn: async ({ saleId, receipt }: { saleId: string; receipt: string }) => {
      const { error } = await supabase.from("sales").update({
        fiscal_receipt_number: receipt,
        status: "fiscalizat" as const,
      }).eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
      toast({ title: "Bon fiscal înregistrat" });
      setSelectedSale(null);
      setFiscalInput("");
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (saleId: string) => {
      // Fetch sale items to restore stock
      const { data: items, error: itemsErr } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", saleId);
      if (itemsErr) throw itemsErr;

      // Restore stock for each item
      for (const item of (items || [])) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_general")
          .eq("id", item.product_id)
          .single();
        if (product) {
          await supabase
            .from("products")
            .update({ stock_general: product.stock_general + item.quantity })
            .eq("id", item.product_id);
        }
      }

      // Mark sale as cancelled
      const { error } = await supabase
        .from("sales")
        .update({ status: "anulat" as const })
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      toast({ title: "Vânzare anulată", description: "Stocul a fost restaurat" });
      setSelectedSale(null);
    },
    onError: (err: any) => toast({ title: "Eroare la anulare", description: err.message, variant: "destructive" }),
  });

  const lowStockProducts = products.filter(p => p.stock_general > 0 && p.stock_general <= 3 && p.active);



  const exportTable = (name: string, headers: string[], rows: any[][]) => {
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Panou Administrare</h1>
          <p className="text-xs text-muted-foreground">Dashboard, rapoarte și setări</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vânzări Azi</p>
            <p className="text-2xl font-bold font-mono text-gold-gradient">{(kpis?.sales_today_total ?? 0).toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{kpis?.sales_today_count ?? 0} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vânzări Săptămână</p>
            <p className="text-2xl font-bold font-mono">{(kpis?.sales_week_total ?? 0).toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{kpis?.sales_week_count ?? 0} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vânzări Lună</p>
            <p className="text-2xl font-bold font-mono">{(kpis?.sales_month_total ?? 0).toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{kpis?.sales_month_count ?? 0} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Produse</p>
            <p className="text-2xl font-bold font-mono">{kpis?.total_products ?? 0}</p>
            <p className="text-xs text-muted-foreground">{kpis?.active_products ?? 0} active</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {((kpis?.low_stock_count ?? 0) > 0 || (kpis?.pending_fiscal ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2">
          {(kpis?.low_stock_count ?? 0) > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />{kpis?.low_stock_count} produse stoc scăzut (1-3 buc)
            </Badge>
          )}
          {(kpis?.pending_fiscal ?? 0) > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Receipt className="h-3 w-3" />{kpis?.pending_fiscal} vânzări pending fiscal
            </Badge>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="sales">Vânzări</TabsTrigger>
            <TabsTrigger value="reports"><BarChart3 className="h-3 w-3 mr-1" />Rapoarte</TabsTrigger>
            <TabsTrigger value="stock">Stoc</TabsTrigger>
            <TabsTrigger value="employees">Angajați</TabsTrigger>
            <TabsTrigger value="devices">Dispozitive</TabsTrigger>
            <TabsTrigger value="buline"><Circle className="h-3 w-3 mr-1" />Buline</TabsTrigger>
            <TabsTrigger value="customers"><UserCheck className="h-3 w-3 mr-1" />Clienți</TabsTrigger>
            <TabsTrigger value="articole"><BookOpen className="h-3 w-3 mr-1" />Articole</TabsTrigger>
            <TabsTrigger value="producatori">Producători</TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={["depozit","barcode-gen","inventariere","import-inventory","initial-stock","settings"].includes(activeTab) ? "default" : "outline"} size="sm" className="gap-1">
                {activeTab === "depozit" && <><Warehouse className="h-3 w-3" />Depozit</>}
                {activeTab === "barcode-gen" && <><Barcode className="h-3 w-3" />Generator</>}
                {activeTab === "inventariere" && <><ClipboardList className="h-3 w-3" />Inventariere</>}
                {activeTab === "import-inventory" && <><Upload className="h-3 w-3" />Import</>}
                {activeTab === "initial-stock" && <><PackageCheck className="h-3 w-3" />Stoc Inițial</>}
                {activeTab === "settings" && <><Lock className="h-3 w-3" />Setări</>}
                {!["depozit","barcode-gen","inventariere","import-inventory","initial-stock","settings"].includes(activeTab) && "Mai mult"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActiveTab("depozit")} className="gap-2"><Warehouse className="h-3.5 w-3.5" />Depozit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("barcode-gen")} className="gap-2"><Barcode className="h-3.5 w-3.5" />Generator Coduri</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("inventariere")} className="gap-2"><ClipboardList className="h-3.5 w-3.5" />Inventariere</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("import-inventory")} className="gap-2"><Upload className="h-3.5 w-3.5" />Import Inventar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("settings")} className="gap-2"><Lock className="h-3.5 w-3.5" />Setări</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Sales tab */}
        <TabsContent value="sales">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Ultimele vânzări</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportTable("vanzari", ["ID", "Total", "Status", "Plata", "Casier", "Data"], sales.map(s => [s.internal_id, s.total, s.status, s.payment_method, (s as any).employees?.name || "—", s.created_at]))}>
                <FileDown className="h-3 w-3 mr-1" />Export
              </Button>
            </CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Intern</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plată</TableHead>
                    <TableHead>Casier</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.slice(0, 30).map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.internal_id}</TableCell>
                      <TableCell className="text-right font-mono">{s.total.toFixed(2)} RON</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "fiscalizat" ? "default" : s.status === "anulat" ? "destructive" : s.status === "returned" ? "destructive" : "secondary"} className="text-xs">
                          {s.status === "returned" ? "Anulată prin retur" : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{s.payment_method}</TableCell>
                      <TableCell className="text-sm">{(s as any).employees?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("ro-RO")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedSale(s); setFiscalInput(s.fiscal_receipt_number || ""); }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nicio vânzare</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <div className="space-y-4">
            <ReportsTab />
            <div className="border-t border-border pt-4">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />Raport Transferuri
              </h3>
              <TransferReportsTab />
            </div>
          </div>
        </TabsContent>

        {/* Stock tab */}
        <TabsContent value="stock">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Alerte Stoc Scăzut</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportTable("stoc_scazut", ["Cod", "Nume", "Stoc"], lowStockProducts.map(p => [p.base_id, p.name, p.stock_general]))}>
                <FileDown className="h-3 w-3 mr-1" />Export
              </Button>
            </CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead className="text-right">Stoc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.base_id}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell className={`text-right font-mono ${p.stock_general <= 0 ? "text-destructive font-bold" : "text-warning"}`}>{p.stock_general}</TableCell>
                    </TableRow>
                  ))}
                  {lowStockProducts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nicio alertă de stoc</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="devices"><DevicesTab /></TabsContent>
        <TabsContent value="buline"><BulineTab /></TabsContent>
        <TabsContent value="customers"><CustomersTab /></TabsContent>
        <TabsContent value="articole"><ArticolDictionaryTab /></TabsContent>
        <TabsContent value="producatori"><ProducatorDictionaryTab /></TabsContent>
        <TabsContent value="depozit"><DepozitTab /></TabsContent>
        <TabsContent value="barcode-gen"><BarcodeGeneratorTab /></TabsContent>
        <TabsContent value="inventariere"><InventarierTab /></TabsContent>
        <TabsContent value="import-inventory"><ImportInventoryTab /></TabsContent>
        <TabsContent value="settings"><StockPinSettingsTab /></TabsContent>
      </Tabs>

      {/* Sale detail dialog */}
      <Dialog open={!!selectedSale} onOpenChange={(open) => { if (!open) setSelectedSale(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalii Vânzare — {selectedSale?.internal_id}</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold">{selectedSale.total.toFixed(2)} RON</span></div>
                <div><span className="text-muted-foreground">Reduceri:</span> <span className="font-mono">{selectedSale.discount_total.toFixed(2)} RON</span></div>
                <div><span className="text-muted-foreground">Plată:</span> <span className="capitalize">{selectedSale.payment_method}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedSale.status === "fiscalizat" ? "default" : selectedSale.status === "returned" ? "destructive" : "secondary"} className="text-xs ml-1">{selectedSale.status === "returned" ? "Anulată prin retur" : selectedSale.status}</Badge></div>
                <div><span className="text-muted-foreground">Casier:</span> {(selectedSale as any).employees?.name || "—"}</div>
                <div><span className="text-muted-foreground">Data:</span> {new Date(selectedSale.created_at).toLocaleString("ro-RO")}</div>
                {selectedSale.cash_amount != null && <div><span className="text-muted-foreground">Numerar:</span> <span className="font-mono">{selectedSale.cash_amount.toFixed(2)}</span></div>}
                {selectedSale.card_amount != null && <div><span className="text-muted-foreground">Card:</span> <span className="font-mono">{selectedSale.card_amount.toFixed(2)}</span></div>}
              </div>

              {/* Sale items */}
              <div>
                <p className="text-sm font-medium mb-2">Articole</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produs</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Preț</TableHead>
                      <TableHead className="text-right">Reducere</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleItems.map((si: any) => (
                      <TableRow key={si.id}>
                        <TableCell className="text-sm">
                          {si.products?.name || si.product_id}
                          {si.is_gift && <Badge className="ml-1 text-xs bg-primary/20 text-primary">Cadou</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-mono">{si.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{si.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{si.discount_percent > 0 ? `-${si.discount_percent}%` : "—"}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{si.line_total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Fiscal receipt input */}
              {selectedSale.status === "pending_fiscal" && (
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-sm font-medium">Bon Fiscal</p>
                  <div className="flex gap-2">
                    <Input
                      value={fiscalInput}
                      onChange={e => setFiscalInput(e.target.value)}
                      placeholder="Nr. bon fiscal..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => fiscalMutation.mutate({ saleId: selectedSale.id, receipt: fiscalInput })}
                      disabled={!fiscalInput.trim() || fiscalMutation.isPending}
                    >
                      <Receipt className="h-4 w-4 mr-1" />
                      {fiscalMutation.isPending ? "..." : "Fiscalizează"}
                    </Button>
                  </div>
                </div>
              )}
              {selectedSale.fiscal_receipt_number && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm"><span className="text-muted-foreground">Bon fiscal:</span> <span className="font-mono font-medium">{selectedSale.fiscal_receipt_number}</span></p>
                </div>
              )}

              {/* Cancel sale button */}
              {selectedSale.status !== "anulat" && selectedSale.status !== "returned" && (
                <div className="border-t border-border pt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => cancelMutation.mutate(selectedSale.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    {cancelMutation.isPending ? "Se anulează..." : "Anulare Vânzare + Restituie Stoc"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

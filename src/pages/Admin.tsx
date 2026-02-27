import { useState } from "react";
import { Settings, BarChart3, Package, Users, Monitor, Circle, FileDown, Receipt, AlertTriangle, Warehouse } from "lucide-react";
import DepozitTab from "@/components/admin/DepozitTab";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Admin() {
  // Sales stats
  const { data: sales = [] } = useQuery({
    queryKey: ["admin-sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("*").order("device_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: buline = [] } = useQuery({
    queryKey: ["admin-buline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bulina_commissions").select("*").order("color_name");
      if (error) throw error;
      return data;
    },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const salesToday = sales.filter(s => s.created_at >= todayStart);
  const salesWeek = sales.filter(s => s.created_at >= weekStart);
  const salesMonth = sales.filter(s => s.created_at >= monthStart);

  const totalToday = salesToday.reduce((s, sale) => s + sale.total, 0);
  const totalWeek = salesWeek.reduce((s, sale) => s + sale.total, 0);
  const totalMonth = salesMonth.reduce((s, sale) => s + sale.total, 0);

  const lowStockProducts = products.filter(p => p.stock_general <= 3 && p.active);
  const pendingFiscal = sales.filter(s => s.status === "pending_fiscal");

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
            <p className="text-2xl font-bold font-mono text-gold-gradient">{totalToday.toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{salesToday.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vânzări Săptămână</p>
            <p className="text-2xl font-bold font-mono">{totalWeek.toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{salesWeek.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Vânzări Lună</p>
            <p className="text-2xl font-bold font-mono">{totalMonth.toFixed(0)} <span className="text-sm">RON</span></p>
            <p className="text-xs text-muted-foreground">{salesMonth.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Produse</p>
            <p className="text-2xl font-bold font-mono">{products.length}</p>
            <p className="text-xs text-muted-foreground">{products.filter(p => p.active).length} active</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(lowStockProducts.length > 0 || pendingFiscal.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {lowStockProducts.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />{lowStockProducts.length} produse stoc scăzut
            </Badge>
          )}
          {pendingFiscal.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Receipt className="h-3 w-3" />{pendingFiscal.length} vânzări pending fiscal
            </Badge>
          )}
        </div>
      )}

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Vânzări</TabsTrigger>
          <TabsTrigger value="stock">Stoc</TabsTrigger>
          <TabsTrigger value="employees">Angajați</TabsTrigger>
          <TabsTrigger value="devices">Dispozitive</TabsTrigger>
          <TabsTrigger value="buline">Buline</TabsTrigger>
          <TabsTrigger value="depozit"><Warehouse className="h-3 w-3 mr-1" />Depozit</TabsTrigger>
        </TabsList>

        {/* Sales tab */}
        <TabsContent value="sales">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Ultimele vânzări</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportTable("vanzari", ["ID", "Total", "Status", "Plata", "Data"], sales.map(s => [s.internal_id, s.total, s.status, s.payment_method, s.created_at]))}>
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
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.slice(0, 20).map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.internal_id}</TableCell>
                      <TableCell className="text-right font-mono">{s.total.toFixed(2)} RON</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "fiscalizat" ? "default" : "secondary"} className="text-xs">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{s.payment_method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("ro-RO")}</TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nicio vânzare</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
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

        {/* Employees tab */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Angajați</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportTable("angajati", ["Nume", "Card", "Activ"], employees.map(e => [e.name, e.employee_card_code, e.active]))}>
                <FileDown className="h-3 w-3 mr-1" />Export
              </Button>
            </CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nume</TableHead>
                    <TableHead>Cod Card</TableHead>
                    <TableHead>PIN Scoatere</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="font-mono">{e.employee_card_code}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">••••</TableCell>
                      <TableCell>{e.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Devices tab */}
        <TabsContent value="devices">
          <Card>
            <CardHeader><CardTitle className="text-base">Dispozitive Înregistrate</CardTitle></CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nume</TableHead>
                    <TableHead>Cod</TableHead>
                    <TableHead>Roluri Permise</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.device_name}</TableCell>
                      <TableCell className="font-mono">{d.device_code}</TableCell>
                      <TableCell>{(d.allowed_roles || []).map((r: string) => <Badge key={r} variant="secondary" className="text-xs mr-1">{r}</Badge>)}</TableCell>
                      <TableCell>{d.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                    </TableRow>
                  ))}
                  {devices.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Niciun dispozitiv înregistrat</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Buline tab */}
        <TabsContent value="buline">
          <Card>
            <CardHeader><CardTitle className="text-base">Buline Comision</CardTitle></CardHeader>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Culoare</TableHead>
                    <TableHead>Comision</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buline.map(b => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: b.hex_color }} />
                          {b.color_name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{b.commission_value.toFixed(2)} RON</TableCell>
                      <TableCell>{b.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
        {/* Depozit tab */}
        <TabsContent value="depozit">
          <DepozitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

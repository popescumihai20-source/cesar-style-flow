import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const CHART_COLORS = [
  "hsl(46, 85%, 55%)", "hsl(220, 45%, 25%)", "hsl(142, 70%, 45%)",
  "hsl(0, 72%, 51%)", "hsl(38, 92%, 50%)", "hsl(280, 60%, 50%)",
];

export default function ReportsTab() {
  const { data: sales = [] } = useQuery({
    queryKey: ["reports-sales"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ["reports-sale-items"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("sale_items")
        .select("*, products(name, category)")
        .gte("created_at", thirtyDaysAgo.toISOString());
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["reports-commissions"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("commission_logs")
        .select("*, employees(name)")
        .gte("created_at", thirtyDaysAgo.toISOString());
      if (error) throw error;
      return data as any[];
    },
  });

  // Sales by day
  const salesByDay = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      const day = new Date(s.created_at).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" });
      map.set(day, (map.get(day) || 0) + s.total);
    });
    return Array.from(map.entries()).map(([day, total]) => ({ day, total: Math.round(total) }));
  }, [sales]);

  // Top products by revenue
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; qty: number }>();
    saleItems.forEach((si: any) => {
      const name = si.products?.name || "Necunoscut";
      const existing = map.get(name) || { name, revenue: 0, qty: 0 };
      existing.revenue += si.line_total;
      existing.qty += si.quantity;
      map.set(name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [saleItems]);

  // Revenue by category
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    saleItems.forEach((si: any) => {
      const cat = si.products?.category || "Fără categorie";
      map.set(cat, (map.get(cat) || 0) + si.line_total);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [saleItems]);

  // Commissions by employee
  const commByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    commissions.forEach((c: any) => {
      const name = c.employees?.name || "Necunoscut";
      map.set(name, (map.get(name) || 0) + c.amount);
    });
    return Array.from(map.entries()).map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }));
  }, [commissions]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      const method = s.payment_method === "numerar" ? "Numerar" : s.payment_method === "card" ? "Card" : "Mixt";
      map.set(method, (map.get(method) || 0) + s.total);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [sales]);

  return (
    <div className="space-y-4">
      {/* Sales by day chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vânzări pe Zile (ultimele 30 zile)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 22%)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 55%)" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 55%)" />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220, 35%, 12%)", border: "1px solid hsl(220, 30%, 22%)", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(35, 20%, 90%)" }}
                  formatter={(v: any) => [`${v} RON`, "Total"]}
                />
                <Bar dataKey="total" fill="hsl(46, 85%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vânzări pe Categorii</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={byCategory} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220, 35%, 12%)", border: "1px solid hsl(220, 30%, 22%)", borderRadius: 8 }}
                  formatter={(v: any) => [`${v} RON`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Produse (venit)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 22%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 55%)" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} stroke="hsl(220, 10%, 55%)" />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220, 35%, 12%)", border: "1px solid hsl(220, 30%, 22%)", borderRadius: 8 }}
                  formatter={(v: any, name: string) => [name === "revenue" ? `${v} RON` : `${v} buc`, name === "revenue" ? "Venit" : "Cantitate"]}
                />
                <Bar dataKey="revenue" fill="hsl(142, 70%, 45%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Commissions by employee */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comisioane pe Angajat</CardTitle>
          </CardHeader>
          <CardContent>
            {commByEmployee.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={commByEmployee}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 22%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 55%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 55%)" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(220, 35%, 12%)", border: "1px solid hsl(220, 30%, 22%)", borderRadius: 8 }}
                    formatter={(v: any) => [`${v} RON`, "Comision"]}
                  />
                  <Bar dataKey="total" fill="hsl(46, 85%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Niciun comision înregistrat</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Metode de Plată</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={paymentBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value} RON`}>
                {paymentBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(220, 35%, 12%)", border: "1px solid hsl(220, 30%, 22%)", borderRadius: 8 }}
                formatter={(v: any) => [`${v} RON`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

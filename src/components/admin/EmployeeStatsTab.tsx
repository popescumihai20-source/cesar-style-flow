import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function EmployeeStatsTab() {
  const startOfMonth = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  const { data: employees = [] } = useQuery({
    queryKey: ["stats-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["stats-sales-month", startOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cashier_employee_id, total, status")
        .gte("created_at", startOfMonth);
      if (error) throw error;
      return (data || []).filter((s: any) => s.status !== "anulat" && s.status !== "returned");
    },
  });

  const { data: returns = [] } = useQuery({
    queryKey: ["stats-returns-month", startOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("returns")
        .select("employee_id")
        .gte("created_at", startOfMonth);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: removals = [] } = useQuery({
    queryKey: ["stats-removals-month", startOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_removals")
        .select("employee_id")
        .gte("created_at", startOfMonth);
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo(() => {
    return employees.map((emp: any) => {
      const empSales = sales.filter((s: any) => s.cashier_employee_id === emp.id);
      const salesCount = empSales.length;
      const salesTotal = empSales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
      const returnsCount = returns.filter((r: any) => r.employee_id === emp.id).length;
      const removalsCount = removals.filter((r: any) => r.employee_id === emp.id).length;
      return { id: emp.id, name: emp.name, salesCount, salesTotal, returnsCount, removalsCount };
    });
  }, [employees, sales, returns, removals]);

  const totals = useMemo(() => ({
    salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
    salesTotal: rows.reduce((s, r) => s + r.salesTotal, 0),
    returnsCount: rows.reduce((s, r) => s + r.returnsCount, 0),
    removalsCount: rows.reduce((s, r) => s + r.removalsCount, 0),
  }), [rows]);

  const monthLabel = new Date().toLocaleDateString("ro-RO", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base capitalize">Statistici Angajați — {monthLabel}</CardTitle>
      </CardHeader>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nume angajat</TableHead>
              <TableHead className="text-right">Nr. vânzări</TableHead>
              <TableHead className="text-right">Valoare vânzări</TableHead>
              <TableHead className="text-right">Nr. retururi</TableHead>
              <TableHead className="text-right">Nr. scoateri stoc</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right font-mono">{r.salesCount}</TableCell>
                <TableCell className="text-right font-mono">{r.salesTotal.toFixed(2)} RON</TableCell>
                <TableCell className="text-right font-mono">{r.returnsCount}</TableCell>
                <TableCell className="text-right font-mono">{r.removalsCount}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Niciun angajat</TableCell></TableRow>
            )}
            {rows.length > 0 && (
              <TableRow className="font-bold border-t-2 bg-muted/40">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right font-mono">{totals.salesCount}</TableCell>
                <TableCell className="text-right font-mono">{totals.salesTotal.toFixed(2)} RON</TableCell>
                <TableCell className="text-right font-mono">{totals.returnsCount}</TableCell>
                <TableCell className="text-right font-mono">{totals.removalsCount}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
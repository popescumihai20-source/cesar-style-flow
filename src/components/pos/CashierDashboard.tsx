import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, DollarSign, ShoppingCart, Award, Target } from "lucide-react";

interface CashierDashboardProps {
  employeeId: string;
  cashierName: string;
}

export default function CashierDashboard({ employeeId, cashierName }: CashierDashboardProps) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Sales by this cashier (exclude returned/anulat)
  const { data: sales = [] } = useQuery({
    queryKey: ["cashier-sales", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("cashier_employee_id", employeeId)
        .gte("created_at", monthStart)
        .not("status", "in", '("anulat","returned")')
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
  });

  // Commissions for this cashier (exclude returned sales)
  const { data: commissions = [] } = useQuery({
    queryKey: ["cashier-commissions", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_logs")
        .select("*, sales!commission_logs_sale_id_fkey(status)")
        .eq("employee_id", employeeId)
        .gte("created_at", monthStart);
      if (error) throw error;
      // Filter out commissions from returned/cancelled sales
      return (data || []).filter((c: any) => {
        const status = c.sales?.status;
        return status !== 'returned' && status !== 'anulat';
      });
    },
    staleTime: 30 * 1000,
  });

  // Active targets
  const { data: targets = [] } = useQuery({
    queryKey: ["cashier-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("targets")
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const salesToday = sales.filter(s => s.created_at >= todayStart);
  const salesWeek = sales.filter(s => s.created_at >= weekStart);

  const totalToday = salesToday.reduce((s, sale) => s + sale.total, 0);
  const totalWeek = salesWeek.reduce((s, sale) => s + sale.total, 0);
  const totalMonth = sales.reduce((s, sale) => s + sale.total, 0);

  const commissionsToday = commissions.filter(c => c.created_at >= todayStart).reduce((s, c) => s + c.amount, 0);
  const commissionsMonth = commissions.reduce((s, c) => s + c.amount, 0);

  const dailyTarget = targets.find(t => t.type === "daily" || t.period === "daily");
  const monthlyTarget = targets.find(t => t.type === "monthly" || t.period === "monthly");

  return (
    <div className="space-y-4 p-2">
      {/* Welcome */}
      <div className="text-center py-2">
        <p className="text-lg font-bold">Bun venit, {cashierName}! 👋</p>
        <p className="text-xs text-muted-foreground">Scanează produse pentru a începe vânzarea</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Vânzări Azi</span>
            </div>
            <p className="text-xl font-bold font-mono">{totalToday.toFixed(0)} <span className="text-xs font-normal">RON</span></p>
            <p className="text-xs text-muted-foreground">{salesToday.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Vânzări Săptămână</span>
            </div>
            <p className="text-xl font-bold font-mono">{totalWeek.toFixed(0)} <span className="text-xs font-normal">RON</span></p>
            <p className="text-xs text-muted-foreground">{salesWeek.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Vânzări Lună</span>
            </div>
            <p className="text-xl font-bold font-mono">{totalMonth.toFixed(0)} <span className="text-xs font-normal">RON</span></p>
            <p className="text-xs text-muted-foreground">{sales.length} bonuri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Comisioane</span>
            </div>
            <p className="text-xl font-bold font-mono text-primary">{commissionsMonth.toFixed(0)} <span className="text-xs font-normal">RON</span></p>
            <p className="text-xs text-muted-foreground">azi: {commissionsToday.toFixed(0)} RON</p>
          </CardContent>
        </Card>
      </div>

      {/* Targets */}
      {(dailyTarget || monthlyTarget) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Target-uri</span>
          </div>
          {dailyTarget && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Target Zilnic</span>
                  <span className="font-mono">{totalToday.toFixed(0)} / {dailyTarget.target_value} RON</span>
                </div>
                <Progress value={Math.min(100, (totalToday / dailyTarget.target_value) * 100)} className="h-2" />
                {totalToday >= dailyTarget.target_value && (
                  <Badge className="bg-green-500/20 text-green-500 text-xs">✅ Target atins!</Badge>
                )}
              </CardContent>
            </Card>
          )}
          {monthlyTarget && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Target Lunar</span>
                  <span className="font-mono">{totalMonth.toFixed(0)} / {monthlyTarget.target_value} RON</span>
                </div>
                <Progress value={Math.min(100, (totalMonth / monthlyTarget.target_value) * 100)} className="h-2" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent sales */}
      {salesToday.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Ultimele vânzări azi</span>
          {salesToday.slice(0, 5).map(s => (
            <div key={s.id} className="flex justify-between items-center text-sm border-b border-border pb-1">
              <div>
                <span className="font-mono text-xs">{s.internal_id}</span>
                <span className="ml-2 capitalize text-muted-foreground">{s.payment_method}</span>
              </div>
              <span className="font-mono font-medium">{s.total.toFixed(2)} RON</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

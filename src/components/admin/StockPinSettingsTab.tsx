import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Save } from "lucide-react";

export default function StockPinSettingsTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCasier, setShowCasier] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [casierPin, setCasierPin] = useState("");
  const [editing, setEditing] = useState(false);
  const [adminAuthPin, setAdminAuthPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["system-settings-stock-pins", user?.employee_id, unlocked],
    enabled: unlocked && !!user?.employee_id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("stock-pin-manage", {
        body: { action: "get", admin_employee_id: user?.employee_id, admin_pin: adminAuthPin },
      });
      if (error) throw error;
      if (!data?.pins) throw new Error(data?.error || "Neautorizat");
      return data.pins as Record<string, string>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data, error } = await supabase.functions.invoke("stock-pin-manage", {
        body: { action: "set", admin_employee_id: user?.employee_id, admin_pin: adminAuthPin, key, value },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings-stock-pins"] });
      toast.success("PIN actualizat");
      setEditing(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startEdit = () => {
    setAdminPin(settings?.stock_pin_admin || "");
    setCasierPin(settings?.stock_pin_casier || "");
    setEditing(true);
  };

  const saveAll = () => {
    if (adminPin && adminPin !== settings?.stock_pin_admin) {
      saveMutation.mutate({ key: "stock_pin_admin", value: adminPin });
    }
    if (casierPin && casierPin !== settings?.stock_pin_casier) {
      saveMutation.mutate({ key: "stock_pin_casier", value: casierPin });
    }
    if (
      (!adminPin || adminPin === settings?.stock_pin_admin) &&
      (!casierPin || casierPin === settings?.stock_pin_casier)
    ) {
      setEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" />PIN-uri Scoatere Stoc (Global)
        </CardTitle>
        {unlocked && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>Editează</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Aceste PIN-uri sunt globale pe rol. Toți angajații cu același rol folosesc același PIN pentru scoaterea din stoc.
        </p>

        {!unlocked && (
          <div className="space-y-2">
            <Label>Confirmă PIN-ul tău de admin pentru a vedea PIN-urile de scoatere</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={adminAuthPin}
                onChange={e => setAdminAuthPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="font-mono max-w-[120px]"
                maxLength={4}
                placeholder="PIN admin"
              />
              <Button
                size="sm"
                disabled={adminAuthPin.length !== 4}
                onClick={async () => {
                  const { data } = await supabase.functions.invoke("stock-pin-manage", {
                    body: { action: "get", admin_employee_id: user?.employee_id, admin_pin: adminAuthPin },
                  });
                  if (data?.pins) {
                    setUnlocked(true);
                    queryClient.invalidateQueries({ queryKey: ["system-settings-stock-pins"] });
                  } else {
                    toast.error(data?.error || "PIN admin incorect");
                  }
                }}
              >Deblochează</Button>
            </div>
          </div>
        )}

        {unlocked && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Admin PIN */}
          <div className="space-y-2">
            <Label>PIN Scoatere — Admin</Label>
            {editing ? (
              <Input
                value={adminPin}
                onChange={e => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="font-mono"
                maxLength={4}
                placeholder="4 cifre"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg">
                  {showAdmin ? (settings?.stock_pin_admin || "—") : "••••"}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAdmin(!showAdmin)}>
                  {showAdmin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>

          {/* Casier PIN */}
          <div className="space-y-2">
            <Label>PIN Scoatere — Casier</Label>
            {editing ? (
              <Input
                value={casierPin}
                onChange={e => setCasierPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="font-mono"
                maxLength={4}
                placeholder="4 cifre"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg">
                  {showCasier ? (settings?.stock_pin_casier || "—") : "••••"}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCasier(!showCasier)}>
                  {showCasier ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>
        </div>
        )}

        {unlocked && editing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Anulează</Button>
            <Button size="sm" onClick={saveAll} disabled={saveMutation.isPending}>
              <Save className="h-3 w-3 mr-1" />{saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

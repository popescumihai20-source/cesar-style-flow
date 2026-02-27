import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Edit, Trash2, FileDown, Shield } from "lucide-react";

type AppRole = "admin" | "casier" | "depozit";
const ALL_ROLES: AppRole[] = ["admin", "casier", "depozit"];

export default function EmployeesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showRoles, setShowRoles] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", employee_card_code: "", removal_pin: "", active: true });

  const { data: employees = [] } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload: any = {
        name: data.name,
        employee_card_code: data.employee_card_code,
        active: data.active,
      };
      if (data.removal_pin) payload.removal_pin = data.removal_pin;

      if (editingId) {
        const { error } = await supabase.from("employees").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      toast.success(editingId ? "Angajat actualizat" : "Angajat adăugat");
      setShowForm(false);
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      toast.success("Angajat șters");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, role, hasRole }: { userId: string; role: AppRole; hasRole: boolean }) => {
      if (hasRole) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Rol actualizat");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", employee_card_code: "", removal_pin: "", active: true });
    setShowForm(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({ name: e.name, employee_card_code: e.employee_card_code, removal_pin: "", active: e.active });
    setShowForm(true);
  };

  const getRolesForUser = (userId: string | null) => {
    if (!userId) return [];
    return userRoles.filter(r => r.user_id === userId).map(r => r.role);
  };

  const exportCSV = () => {
    const headers = ["Nume", "Card", "Activ"];
    const rows = employees.map(e => [e.name, e.employee_card_code, e.active]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "angajati.csv"; a.click();
  };

  const selectedEmployee = employees.find(e => e.id === showRoles);

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Angajați</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileDown className="h-3 w-3 mr-1" />Export
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3 w-3 mr-1" />Angajat Nou
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead>Cod Card</TableHead>
                <TableHead>PIN Scoatere</TableHead>
                <TableHead>Roluri</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(e => {
                const roles = getRolesForUser(e.user_id);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="font-mono">{e.employee_card_code}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{e.removal_pin ? "••••" : "—"}</TableCell>
                    <TableCell>
                      {roles.length > 0
                        ? roles.map(r => <Badge key={r} variant="secondary" className="text-xs mr-1">{r}</Badge>)
                        : <span className="text-xs text-muted-foreground">Fără rol</span>
                      }
                    </TableCell>
                    <TableCell>
                      {e.active
                        ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactiv</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {e.user_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRoles(e.id)} title="Roluri">
                            <Shield className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(e.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Niciun angajat</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit Employee Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editare Angajat" : "Angajat Nou"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nume</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Cod Card</Label><Input value={form.employee_card_code} onChange={e => setForm({ ...form, employee_card_code: e.target.value })} className="font-mono" /></div>
            <div><Label>PIN Scoatere {editingId && "(lasă gol pt. păstrare)"}</Label><Input type="password" value={form.removal_pin} onChange={e => setForm({ ...form, removal_pin: e.target.value })} className="font-mono" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label>Activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.employee_card_code}>
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Roles Dialog */}
      <Dialog open={!!showRoles} onOpenChange={() => setShowRoles(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Roluri — {selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          {selectedEmployee?.user_id && (
            <div className="space-y-3">
              {ALL_ROLES.map(role => {
                const hasRole = getRolesForUser(selectedEmployee.user_id).includes(role);
                return (
                  <div key={role} className="flex items-center gap-3">
                    <Checkbox
                      checked={hasRole}
                      onCheckedChange={() => toggleRoleMutation.mutate({ userId: selectedEmployee.user_id!, role, hasRole })}
                    />
                    <span className="capitalize font-medium">{role}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!selectedEmployee?.user_id && (
            <p className="text-sm text-muted-foreground">Angajatul nu s-a autentificat încă. Rolurile pot fi gestionate doar după prima autentificare.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

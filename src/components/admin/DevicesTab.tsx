import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";

type AppRole = "admin" | "casier" | "depozit";
const ALL_ROLES: AppRole[] = ["admin", "casier", "depozit"];

export default function DevicesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ device_name: "", device_code: "", allowed_roles: [] as AppRole[], active: true });

  const { data: devices = [] } = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("*").order("device_name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        device_name: data.device_name,
        device_code: data.device_code,
        allowed_roles: data.allowed_roles,
        active: data.active,
      };
      if (editingId) {
        const { error } = await supabase.from("devices").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("devices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-devices"] });
      toast.success(editingId ? "Dispozitiv actualizat" : "Dispozitiv adăugat");
      setShowForm(false);
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-devices"] });
      toast.success("Dispozitiv șters");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ device_name: "", device_code: "", allowed_roles: [], active: true });
    setShowForm(true);
  };

  const openEdit = (d: any) => {
    setEditingId(d.id);
    setForm({ device_name: d.device_name, device_code: d.device_code, allowed_roles: d.allowed_roles || [], active: d.active });
    setShowForm(true);
  };

  const toggleRole = (role: AppRole) => {
    setForm(prev => ({
      ...prev,
      allowed_roles: prev.allowed_roles.includes(role)
        ? prev.allowed_roles.filter(r => r !== role)
        : [...prev.allowed_roles, role],
    }));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Dispozitive Înregistrate</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" />Dispozitiv Nou
          </Button>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead>Cod</TableHead>
                <TableHead>Roluri Permise</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map(d => (
                <TableRow key={d.id}>
                  <TableCell>{d.device_name}</TableCell>
                  <TableCell className="font-mono">{d.device_code}</TableCell>
                  <TableCell>{(d.allowed_roles || []).map((r: string) => <Badge key={r} variant="secondary" className="text-xs mr-1">{r}</Badge>)}</TableCell>
                  <TableCell>{d.active ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge> : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(d.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {devices.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Niciun dispozitiv înregistrat</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit Device Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editare Dispozitiv" : "Dispozitiv Nou"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nume Dispozitiv</Label><Input value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} /></div>
            <div><Label>Cod Dispozitiv</Label><Input value={form.device_code} onChange={e => setForm({ ...form, device_code: e.target.value })} className="font-mono" /></div>
            <div>
              <Label className="mb-2 block">Roluri Permise</Label>
              <div className="flex gap-4">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox checked={form.allowed_roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    <span className="capitalize text-sm">{role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label>Activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.device_name || !form.device_code}>
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

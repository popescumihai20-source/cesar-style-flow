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
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Circle, Link } from "lucide-react";

export default function BulineTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ color_name: "", hex_color: "#e74c3c", commission_value: 0, active: true });
  const [showAssign, setShowAssign] = useState(false);
  const [assignProductId, setAssignProductId] = useState("");
  const [assignBulinaId, setAssignBulinaId] = useState("");

  const { data: buline = [] } = useQuery({
    queryKey: ["admin-buline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bulina_commissions").select("*").order("color_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["product-bulina"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_bulina")
        .select("*, products(name, base_id), bulina_commissions(color_name, hex_color, commission_value)");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (editingId) {
        const { error } = await supabase.from("bulina_commissions").update(data).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bulina_commissions").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-buline"] });
      toast({ title: editingId ? "Bulină actualizată" : "Bulină creată" });
      setShowForm(false);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bulina_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-buline"] });
      toast({ title: "Bulină ștearsă" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("product_bulina").insert({
        product_id: assignProductId,
        bulina_id: assignBulinaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-bulina"] });
      toast({ title: "Bulină atribuită produsului" });
      setShowAssign(false);
      setAssignProductId("");
      setAssignBulinaId("");
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_bulina").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-bulina"] });
      toast({ title: "Atribuire ștearsă" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ color_name: "", hex_color: "#e74c3c", commission_value: 0, active: true });
    setShowForm(true);
  };

  const openEdit = (b: any) => {
    setEditingId(b.id);
    setForm({ color_name: b.color_name, hex_color: b.hex_color, commission_value: b.commission_value, active: b.active });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      {/* Buline list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Buline Comision</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAssign(true)}>
              <Link className="h-3 w-3 mr-1" />Atribuie la Produs
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3 w-3 mr-1" />Bulină Nouă
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Culoare</TableHead>
                <TableHead className="text-right">Comision (RON)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Produse atribuite</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buline.map(b => {
                const assignedCount = assignments.filter((a: any) => a.bulina_id === b.id).length;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: b.hex_color }} />
                        <span className="font-medium">{b.color_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">{b.commission_value.toFixed(2)}</TableCell>
                    <TableCell>
                      {b.active
                        ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactiv</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{assignedCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(b.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {buline.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nicio bulină definită</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Atribuiri */}
      {assignments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Atribuiri Buline → Produse</CardTitle></CardHeader>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produs</TableHead>
                  <TableHead>Bulină</TableHead>
                  <TableHead className="text-right">Comision</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{a.products?.base_id}</span>
                      <span className="ml-2">{a.products?.name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: a.bulina_commissions?.hex_color }} />
                        {a.bulina_commissions?.color_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{a.bulina_commissions?.commission_value?.toFixed(2)} RON</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => unassignMutation.mutate(a.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editare Bulină" : "Bulină Nouă"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nume culoare</Label>
              <Input value={form.color_name} onChange={e => setForm({ ...form, color_name: e.target.value })} placeholder="ex: Roșu" />
            </div>
            <div>
              <Label>Culoare (hex)</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.hex_color} onChange={e => setForm({ ...form, hex_color: e.target.value })} className="h-10 w-14 rounded cursor-pointer" />
                <Input value={form.hex_color} onChange={e => setForm({ ...form, hex_color: e.target.value })} className="font-mono" />
              </div>
            </div>
            <div>
              <Label>Valoare comision (RON)</Label>
              <Input type="number" value={form.commission_value} onChange={e => setForm({ ...form, commission_value: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label>Activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.color_name}>
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atribuie Bulină la Produs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Produs</Label>
              <Select value={assignProductId} onValueChange={setAssignProductId}>
                <SelectTrigger><SelectValue placeholder="Selectează produs" /></SelectTrigger>
                <SelectContent>
                  {products.filter(p => !assignments.some((a: any) => a.product_id === p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.base_id} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bulină</Label>
              <Select value={assignBulinaId} onValueChange={setAssignBulinaId}>
                <SelectTrigger><SelectValue placeholder="Selectează bulină" /></SelectTrigger>
                <SelectContent>
                  {buline.filter(b => b.active).map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: b.hex_color }} />
                        {b.color_name} — {b.commission_value} RON
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Anulează</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!assignProductId || !assignBulinaId || assignMutation.isPending}>
              Atribuie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

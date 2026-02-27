import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Search, Users, Star, CreditCard, FileDown } from "lucide-react";

const LEVELS = [
  { value: "standard", label: "Standard", color: "secondary" },
  { value: "silver", label: "Silver", color: "secondary" },
  { value: "gold", label: "Gold", color: "default" },
  { value: "premium", label: "Premium", color: "destructive" },
];

export default function CustomersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", card_barcode: "", level: "standard", points: 0 });

  const { data: customers = [] } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name?.toLowerCase().includes(q)) || c.phone.includes(q) || (c.card_barcode?.includes(q));
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        name: data.name || null,
        phone: data.phone,
        email: data.email || null,
        card_barcode: data.card_barcode || null,
        level: data.level,
        points: data.points,
      };
      if (editingId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      toast({ title: editingId ? "Client actualizat" : "Client creat" });
      setShowForm(false);
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", phone: "", email: "", card_barcode: "", level: "standard", points: 0 });
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "", phone: c.phone, email: c.email || "",
      card_barcode: c.card_barcode || "", level: c.level, points: c.points,
    });
    setShowForm(true);
  };

  const exportCSV = () => {
    const headers = ["Nume", "Telefon", "Email", "Card", "Nivel", "Puncte"];
    const rows = filtered.map(c => [c.name, c.phone, c.email, c.card_barcode, c.level, c.points]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "clienti.csv"; a.click();
  };

  const totalPoints = customers.reduce((s, c) => s + c.points, 0);
  const premiumCount = customers.filter(c => c.level === "gold" || c.level === "premium").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Clienți</span>
            </div>
            <p className="text-2xl font-bold font-mono">{customers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Clienți Premium</span>
            </div>
            <p className="text-2xl font-bold font-mono">{premiumCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Puncte</span>
            </div>
            <p className="text-2xl font-bold font-mono">{totalPoints}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Clienți</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută client..." className="pl-9 h-9 w-60" />
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="h-3 w-3 mr-1" />Export</Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-3 w-3 mr-1" />Client Nou</Button>
          </div>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead className="text-right">Puncte</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell className="text-sm">{c.email || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{c.card_barcode || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.level === "gold" || c.level === "premium" ? "default" : "secondary"} className="text-xs capitalize">
                      {c.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.points}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Edit className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Niciun client găsit</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editare Client" : "Client Nou"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nume</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Telefon *</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Cod card fidelitate</Label><Input value={form.card_barcode} onChange={e => setForm({ ...form, card_barcode: e.target.value })} className="font-mono" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nivel</Label>
                <Select value={form.level} onValueChange={v => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Puncte</Label><Input type="number" value={form.points} onChange={e => setForm({ ...form, points: parseInt(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.phone}>
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

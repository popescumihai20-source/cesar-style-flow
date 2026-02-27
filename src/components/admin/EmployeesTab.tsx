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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit, Trash2, FileDown, RefreshCw, ShieldAlert, Copy, Check } from "lucide-react";

type EmployeeRole = "admin" | "casier";

const WEAK_PINS = ["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321"];

function generateRandomPin(): string {
  let pin: string;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (WEAK_PINS.includes(pin));
  return pin;
}

function validatePin(pin: string, label: string): string | null {
  if (!/^\d{4}$/.test(pin)) return `${label} trebuie să fie exact 4 cifre`;
  if (WEAK_PINS.includes(pin)) return `${label} este prea slab`;
  return null;
}

interface CreatedCredentials {
  name: string;
  role: string;
  cardCode: string;
  pinLogin: string;
}

export default function EmployeesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "casier" as EmployeeRole,
    pin_login: "",
    active: true,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const getNextCardCode = (role: EmployeeRole): string => {
    const startChar = role === "admin" ? "9" : "1";
    const defaultStart = role === "admin" ? 9000001 : 1000001;
    const relevantCodes = employees
      .map(e => e.employee_card_code)
      .filter(c => c.startsWith(startChar) && /^\d{7}$/.test(c))
      .map(Number);
    const maxCode = relevantCodes.length > 0 ? Math.max(...relevantCodes) : defaultStart - 1;
    return String(maxCode + 1);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const errLogin = validatePin(data.pin_login, "PIN Login");
      if (errLogin) throw new Error(errLogin);

      if (editingId) {
        const { error } = await supabase.from("employees").update({
          name: data.name,
          pin_login: data.pin_login,
          active: data.active,
        }).eq("id", editingId);
        if (error) throw error;
        return { isEdit: true, cardCode: "" };
      } else {
        const cardCode = getNextCardCode(data.role);
        const { error } = await supabase.from("employees").insert({
          name: data.name,
          employee_card_code: cardCode,
          role: data.role,
          pin_login: data.pin_login,
          removal_pin: generateRandomPin(), // kept for DB constraint, but unused
          active: data.active,
        });
        if (error) throw error;
        return { isEdit: false, cardCode };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
      setShowForm(false);

      setCreatedCreds({
        name: form.name,
        role: form.role,
        cardCode: result.isEdit
          ? (employees.find(e => e.id === editingId)?.employee_card_code || "")
          : result.cardCode,
        pinLogin: form.pin_login,
      });
      toast.success(result.isEdit ? "Angajat actualizat" : "Angajat creat cu succes");
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

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", role: "casier", pin_login: generateRandomPin(), active: true });
    setShowForm(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      role: e.role || "casier",
      pin_login: generateRandomPin(),
      active: e.active,
    });
    setShowForm(true);
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const text = `Angajat: ${createdCreds.name}\nRol: ${createdCreds.role}\nCod Card: ${createdCreds.cardCode}\nPIN Login: ${createdCreds.pinLogin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCredentials = () => {
    setCreatedCreds(null);
    setCopied(false);
  };

  const exportCSV = () => {
    const headers = ["Nume", "Rol", "Card", "Activ"];
    const rows = employees.map(e => [e.name, (e as any).role || "casier", e.employee_card_code, e.active]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "angajati.csv"; a.click();
  };

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
                <TableHead>Rol</TableHead>
                <TableHead>Cod Card</TableHead>
                <TableHead>PIN Login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">{(e as any).role || "casier"}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{e.employee_card_code}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">••••</TableCell>
                  <TableCell>
                    {e.active
                      ? <Badge className="bg-success/20 text-success text-xs">Activ</Badge>
                      : <Badge variant="secondary" className="text-xs">Inactiv</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(e.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
            <div><Label>Nume complet</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

            {!editingId ? (
              <div>
                <Label>Rol</Label>
                <Select value={form.role} onValueChange={(v: EmployeeRole) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casier">Casier (1xxxxxx)</SelectItem>
                    <SelectItem value="admin">Admin (9xxxxxx)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Cod card auto-generat: <span className="font-mono font-bold">{getNextCardCode(form.role)}</span>
                </p>
              </div>
            ) : (
              <div>
                <Label>Cod Card</Label>
                <Input value={employees.find(e => e.id === editingId)?.employee_card_code || ""} disabled className="font-mono bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">Rol: <span className="capitalize font-medium">{form.role}</span> — nu se poate schimba</p>
              </div>
            )}

            <div>
              <Label>PIN Login (4 cifre) *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.pin_login}
                  onChange={e => setForm({ ...form, pin_login: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  className="font-mono flex-1"
                  maxLength={4}
                  placeholder="••••"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, pin_login: generateRandomPin() }))}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label>Activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.name || form.pin_login.length !== 4}
            >
              {saveMutation.isPending ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secure Credentials Reveal Modal */}
      <Dialog open={!!createdCreds} onOpenChange={closeCredentials}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Credențiale Generate
            </DialogTitle>
            <DialogDescription>
              Notează aceste date. PIN-ul nu va mai fi afișat după închiderea acestui dialog.
            </DialogDescription>
          </DialogHeader>
          {createdCreds && (
            <div className="space-y-3">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Nume</span>
                  <span className="font-medium">{createdCreds.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Rol</span>
                  <span className="font-medium capitalize">{createdCreds.role}</span>
                </div>
                <div className="border-t border-border my-2" />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cod Card</span>
                  <span className="font-mono font-bold text-lg">{createdCreds.cardCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">PIN Login</span>
                  <span className="font-mono font-bold text-lg">{createdCreds.pinLogin}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                PIN-ul de scoatere stoc este global pe rol și se configurează din Setări.
              </p>
              <Button variant="outline" className="w-full" onClick={copyCredentials}>
                {copied ? <><Check className="h-4 w-4 mr-2" />Copiat!</> : <><Copy className="h-4 w-4 mr-2" />Copiază credențialele</>}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={closeCredentials} className="w-full">Am notat — Închide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

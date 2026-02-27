import { useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function ArticolDictionaryTab() {
  const { articolEntries, isLoading } = useArticolDictionary();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetForm = () => {
    setEditId(null);
    setCode("");
    setName("");
    setActive(true);
    setShowForm(false);
  };

  const openEdit = (entry: typeof articolEntries[0]) => {
    setEditId(entry.id);
    setCode(entry.code);
    setName(entry.name);
    setActive(entry.active);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Completează codul și numele", variant: "destructive" });
      return;
    }
    try {
      if (editId) {
        const { error } = await supabase
          .from("articol_dictionary")
          .update({ code: code.trim(), name: name.trim(), active })
          .eq("id", editId);
        if (error) throw error;
        toast({ title: "✅ Articol actualizat" });
      } else {
        const { error } = await supabase
          .from("articol_dictionary")
          .insert({ code: code.trim(), name: name.trim(), active });
        if (error) throw error;
        toast({ title: "✅ Articol adăugat" });
      }
      queryClient.invalidateQueries({ queryKey: ["articol-dictionary"] });
      resetForm();
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("articol_dictionary").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["articol-dictionary"] });
      toast({ title: "Articol șters" });
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Dicționar Articole (Cod 2 cifre)
        </CardTitle>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adaugă
        </Button>
      </CardHeader>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Cod</TableHead>
              <TableHead>Nume Articol</TableHead>
              <TableHead className="w-24">Activ</TableHead>
              <TableHead className="w-24">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articolEntries.map(entry => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono font-bold text-lg">{entry.code}</TableCell>
                <TableCell className="font-medium">{entry.name}</TableCell>
                <TableCell>
                  <Badge variant={entry.active ? "default" : "secondary"}>
                    {entry.active ? "Activ" : "Inactiv"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {articolEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {isLoading ? "Se încarcă..." : "Niciun articol definit"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? "Editează Articol" : "Articol Nou"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cod (2 cifre)</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ex: 10" maxLength={2} className="font-mono" />
            </div>
            <div>
              <Label>Nume Articol</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Costum" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Anulează</Button>
            <Button onClick={handleSave}>{editId ? "Salvează" : "Adaugă"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

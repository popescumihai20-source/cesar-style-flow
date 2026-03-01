import { useState } from "react";
import { Plus, Pencil, Trash2, Factory, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = parseInt(trimmed, 10);
  if (num < 1 || num > 99) return null;
  return num.toString().padStart(2, "0");
}

interface ImportResult {
  imported: number;
  ignored: { line: string; reason: string }[];
}

export default function ProducatorDictionaryTab() {
  const { producatorEntries, isLoading } = useProducatorDictionary();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetForm = () => {
    setEditId(null);
    setCode("");
    setName("");
    setActive(true);
    setShowForm(false);
  };

  const openEdit = (entry: typeof producatorEntries[0]) => {
    setEditId(entry.id);
    setCode(entry.code);
    setName(entry.name);
    setActive(entry.active);
    setShowForm(true);
  };

  const handleSave = async () => {
    const normalized = normalizeCode(code);
    if (!normalized || !name.trim()) {
      toast({ title: "Cod invalid (01-99) sau nume lipsă", variant: "destructive" });
      return;
    }
    try {
      if (editId) {
        const { error } = await supabase
          .from("producator_dictionary")
          .update({ code: normalized, name: name.trim(), active })
          .eq("id", editId);
        if (error) throw error;
        toast({ title: "✅ Producător actualizat" });
      } else {
        const { error } = await supabase
          .from("producator_dictionary")
          .insert({ code: normalized, name: name.trim(), active });
        if (error) throw error;
        toast({ title: "✅ Producător adăugat" });
      }
      queryClient.invalidateQueries({ queryKey: ["producator-dictionary"] });
      resetForm();
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("producator_dictionary").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["producator-dictionary"] });
      toast({ title: "Producător șters" });
    } catch (err: any) {
      toast({ title: "Eroare", description: err.message, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    const lines = importText.split(/\r?\n/).filter(l => l.trim());
    const ignored: { line: string; reason: string }[] = [];
    let imported = 0;

    for (const line of lines) {
      // Match patterns: "01 - Name", "1 - Name", "01 Name", etc.
      const match = line.match(/^\s*(\d+)\s*[-–—\s]+\s*(.+)$/);
      if (!match) {
        ignored.push({ line, reason: "Format nerecunoscut" });
        continue;
      }
      const rawCode = match[1];
      const rawName = match[2].trim();
      const normalized = normalizeCode(rawCode);
      if (!normalized) {
        ignored.push({ line, reason: `Cod "${rawCode}" invalid (trebuie 01-99)` });
        continue;
      }
      if (!rawName) {
        ignored.push({ line, reason: "Nume lipsă" });
        continue;
      }

      try {
        const { error } = await supabase
          .from("producator_dictionary")
          .upsert({ code: normalized, name: rawName, active: true }, { onConflict: "code" });
        if (error) throw error;
        imported++;
      } catch (err: any) {
        ignored.push({ line, reason: err.message });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["producator-dictionary"] });
    setImportResult({ imported, ignored });
    setIsImporting(false);
    if (imported > 0) {
      toast({ title: `✅ ${imported} producători importați` });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-4 w-4" /> Dicționar Producători (Cod 01–99)
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setImportText(""); setImportResult(null); setShowImport(true); }}>
              <Upload className="h-4 w-4 mr-1" /> Import (paste listă)
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Adaugă
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Cod</TableHead>
                <TableHead>Nume Producător</TableHead>
                <TableHead className="w-24">Activ</TableHead>
                <TableHead className="w-24">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producatorEntries.map(entry => (
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
              {producatorEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {isLoading ? "Se încarcă..." : "Niciun producător definit"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? "Editează Producător" : "Producător Nou"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cod (01–99)</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ex: 01" maxLength={2} className="font-mono" />
            </div>
            <div>
              <Label>Nume Producător</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Hugo Boss" />
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

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Producători (paste listă)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lipește lista cu format: <code className="bg-muted px-1 rounded">cod - nume</code> (un rând = un producător).
              Coduri 01–99 acceptate. Coduri &gt; 99 sau invalide sunt ignorate.
            </p>
            <Textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"01 - Hugo Boss\n02 - Armani\n3 - Zara"}
              rows={10}
              className="font-mono text-sm"
            />
            {importResult && (
              <div className="space-y-2 text-sm">
                <p className="text-primary font-medium">✅ {importResult.imported} importați</p>
                {importResult.ignored.length > 0 && (
                  <div>
                    <p className="text-destructive font-medium">⚠ {importResult.ignored.length} ignorați:</p>
                    <div className="max-h-32 overflow-auto bg-muted rounded p-2 text-xs space-y-1">
                      {importResult.ignored.map((ig, i) => (
                        <div key={i}><span className="font-mono">{ig.line}</span> — {ig.reason}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Închide</Button>
            <Button onClick={handleImport} disabled={isImporting || !importText.trim()}>
              {isImporting ? "Se importă..." : "Importă"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

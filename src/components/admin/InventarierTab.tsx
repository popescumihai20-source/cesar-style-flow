import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Play, Square, ScanLine, FileDown, AlertTriangle, CheckCircle } from "lucide-react";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";

export default function InventarierTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [startLocation, setStartLocation] = useState<string>("");
  const [startNotes, setStartNotes] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [showClose, setShowClose] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Fetch all sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["inventory-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("*, employees:started_by(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch lines for active session
  const { data: lines = [] } = useQuery({
    queryKey: ["inventory-lines", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return [];
      const { data, error } = await supabase
        .from("inventory_lines")
        .select("*, products(name, base_id)")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeSessionId,
    refetchInterval: activeSessionId ? 5000 : false,
  });

  // Fetch products for scanning
  const { data: products = [] } = useQuery({
    queryKey: ["products-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });

  const openSessions = sessions.filter(s => s.status === "open");
  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Start new session
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!startLocation) throw new Error("Selectează locația");
      
      // Check no open session for this location
      const existing = openSessions.find(s => s.location === startLocation);
      if (existing) throw new Error(`Există deja o sesiune deschisă pentru ${startLocation}`);

      // Get current employee
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Neautentificat");
      const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).single();
      if (!emp) throw new Error("Angajat negăsit");

      // Create session
      const { data: session, error } = await supabase
        .from("inventory_sessions")
        .insert({
          location: startLocation,
          started_by: emp.id,
          notes: startNotes || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Snapshot all products with stock > 0 for this location
      const stockField = startLocation === "magazin" ? "stock_general" : "stock_depozit";
      const productsWithStock = products.filter(p => (p as any)[stockField] > 0);

      if (productsWithStock.length > 0) {
        const lineInserts = productsWithStock.map(p => ({
          session_id: (session as any).id,
          product_id: p.id,
          system_quantity: (p as any)[stockField],
          counted_quantity: 0,
        }));

        const { error: lErr } = await supabase.from("inventory_lines").insert(lineInserts);
        if (lErr) throw lErr;
      }

      return (session as any).id;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-lock"] });
      setActiveSessionId(sessionId);
      setShowStart(false);
      setStartLocation("");
      setStartNotes("");
      toast({ title: "Sesiune inventariere pornită", description: "POS-ul și transferurile sunt blocate pentru această locație." });
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  // Handle barcode scan — update counted_quantity
  const handleScan = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !activeSessionId || !activeSession) return;

    let product: any = null;

    // Try barcode parse
    if (isValidBarcode(trimmed)) {
      const parsed = parseBarcode(trimmed);
      if (parsed.isValid) {
        product = products.find(p => p.base_id === parsed.baseId);
      }
    }

    // Try direct base_id match
    if (!product) {
      product = products.find(p => p.base_id === trimmed);
    }

    // Try name search
    if (!product) {
      product = products.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
    }

    if (!product) {
      toast({ title: "Produs negăsit", description: trimmed, variant: "destructive" });
      setScanInput("");
      return;
    }

    // Check if line exists
    const existingLine = lines.find(l => l.product_id === product.id && !l.variant_code);

    if (existingLine) {
      // Increment counted_quantity
      const { error } = await supabase
        .from("inventory_lines")
        .update({ counted_quantity: existingLine.counted_quantity + 1 })
        .eq("id", existingLine.id);
      if (error) {
        toast({ title: "Eroare actualizare", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `+1 ${product.name}`, description: `Numărare: ${existingLine.counted_quantity + 1}` });
      }
    } else {
      // Add new line (product not in snapshot — maybe zero stock)
      const stockField = activeSession.location === "magazin" ? "stock_general" : "stock_depozit";
      const { error } = await supabase.from("inventory_lines").insert({
        session_id: activeSessionId,
        product_id: product.id,
        system_quantity: (product as any)[stockField] || 0,
        counted_quantity: 1,
      });
      if (error) {
        toast({ title: "Eroare adăugare", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Adăugat: ${product.name}`, description: "Numărare: 1" });
      }
    }

    setScanInput("");
    queryClient.invalidateQueries({ queryKey: ["inventory-lines", activeSessionId] });
    scanRef.current?.focus();
  };

  // Update counted_quantity manually
  const updateCounted = async (lineId: string, newCount: number) => {
    const { error } = await supabase
      .from("inventory_lines")
      .update({ counted_quantity: Math.max(0, newCount) })
      .eq("id", lineId);
    if (error) toast({ title: "Eroare", description: error.message, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["inventory-lines", activeSessionId] });
  };

  // Update adjustment reason
  const updateReason = async (lineId: string, reason: string) => {
    const { error } = await supabase
      .from("inventory_lines")
      .update({ adjustment_reason: reason })
      .eq("id", lineId);
    if (error) toast({ title: "Eroare", description: error.message, variant: "destructive" });
  };

  // Close session
  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId || !activeSession) throw new Error("Nicio sesiune activă");

      // Validate all differences have reasons
      const linesWithDiff = lines.filter(l => l.difference !== 0);
      const missingReasons = linesWithDiff.filter(l => !l.adjustment_reason?.trim());
      if (missingReasons.length > 0) {
        throw new Error(`${missingReasons.length} linii cu diferențe nu au motiv de ajustare. Completează toate motivele.`);
      }

      // Get employee
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Neautentificat");
      const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).single();
      if (!emp) throw new Error("Angajat negăsit");

      const stockField = activeSession.location === "magazin" ? "stock_general" : "stock_depozit";

      // Apply adjustments
      for (const line of linesWithDiff) {
        // Get current stock
        const { data: currentProduct } = await supabase
          .from("products")
          .select("stock_general, stock_depozit")
          .eq("id", line.product_id)
          .single();
        
        if (currentProduct) {
          const oldQty = (currentProduct as any)[stockField];
          const newQty = oldQty + line.difference;

          // Update stock
          await supabase
            .from("products")
            .update({ [stockField]: Math.max(0, newQty) } as any)
            .eq("id", line.product_id);

          // Log adjustment
          await supabase.from("inventory_adjustments").insert({
            session_id: activeSessionId,
            product_id: line.product_id,
            variant_code: line.variant_code || null,
            location: activeSession.location,
            old_quantity: oldQty,
            new_quantity: Math.max(0, newQty),
            difference: line.difference,
            reason: line.adjustment_reason,
            adjusted_by: emp.id,
          });
        }
      }

      // Close session
      const { error } = await supabase
        .from("inventory_sessions")
        .update({ status: "closed", end_time: new Date().toISOString() })
        .eq("id", activeSessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-lock"] });
      queryClient.invalidateQueries({ queryKey: ["products-depozit"] });
      queryClient.invalidateQueries({ queryKey: ["products-admin"] });
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      setShowClose(false);
      setActiveSessionId(null);
      toast({ title: "Inventariere finalizată", description: "Stocul a fost ajustat și POS-ul deblocat." });
    },
    onError: (err: any) => toast({ title: "Eroare la închidere", description: err.message, variant: "destructive" }),
  });

  // Export CSV
  const exportCSV = () => {
    if (lines.length === 0) return;
    const headers = ["Cod", "Produs", "Stoc Sistem", "Numărare", "Diferență", "Motiv"];
    const rows = lines.map(l => [
      l.products?.base_id || "", l.products?.name || "", l.system_quantity,
      l.counted_quantity, l.difference, l.adjustment_reason || "",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `inventar-${activeSessionId?.slice(0, 8)}.csv`; a.click();
  };

  const linesWithDiff = lines.filter(l => l.difference !== 0);
  const totalDifferences = linesWithDiff.length;
  const totalCounted = lines.filter(l => l.counted_quantity > 0).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sesiuni Deschise</p>
            <p className="text-2xl font-bold font-mono">{openSessions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Sesiuni</p>
            <p className="text-2xl font-bold font-mono">{sessions.length}</p>
          </CardContent>
        </Card>
        {activeSession && (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Produse Numerate</p>
                <p className="text-2xl font-bold font-mono">{totalCounted} / {lines.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Diferențe</p>
                <p className={`text-2xl font-bold font-mono ${totalDifferences > 0 ? "text-destructive" : "text-green-500"}`}>{totalDifferences}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowStart(true)} disabled={openSessions.length >= 2}>
          <Play className="h-4 w-4 mr-1" />Sesiune Nouă
        </Button>
        {openSessions.map(s => (
          <Button
            key={s.id}
            variant={activeSessionId === s.id ? "default" : "outline"}
            onClick={() => setActiveSessionId(s.id)}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            {s.location === "magazin" ? "Magazin" : "Depozit"} (deschis)
          </Button>
        ))}
      </div>

      {/* Active session work area */}
      {activeSession && activeSession.status === "open" && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-primary/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/20 text-primary">
                    {activeSession.location === "magazin" ? "Magazin Ferdinand" : "Depozit"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">DESCHISĂ</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pornită: {new Date(activeSession.start_time).toLocaleString("ro-RO")} • 
                  De: {(activeSession as any).employees?.name}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV}>
                  <FileDown className="h-3 w-3 mr-1" />Export
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setShowClose(true)}>
                  <Square className="h-3 w-3 mr-1" />Închide Sesiunea
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scan input */}
          <div className="relative">
            <Input
              ref={scanRef}
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleScan(scanInput); }}
              placeholder="Scanează cod de bare sau introdu cod produs..."
              className="h-14 text-lg font-mono border-2 border-primary/30 focus:border-primary"
              autoFocus
            />
            <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>

          {/* Lines table */}
          <Card>
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right">Sistem</TableHead>
                    <TableHead className="text-right">Numerat</TableHead>
                    <TableHead className="text-right">Diferență</TableHead>
                    <TableHead>Motiv Ajustare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => {
                    const hasDiff = line.difference !== 0;
                    return (
                      <TableRow key={line.id} className={hasDiff ? "bg-destructive/5" : ""}>
                        <TableCell className="font-mono text-xs">{line.products?.base_id}</TableCell>
                        <TableCell className="text-sm">{line.products?.name}</TableCell>
                        <TableCell className="text-right font-mono">{line.system_quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={line.counted_quantity}
                            onChange={e => updateCounted(line.id, parseInt(e.target.value) || 0)}
                            className="h-8 w-20 text-right font-mono ml-auto"
                          />
                        </TableCell>
                        <TableCell className={`text-right font-mono font-bold ${hasDiff ? (line.difference > 0 ? "text-green-500" : "text-destructive") : "text-muted-foreground"}`}>
                          {line.difference > 0 ? `+${line.difference}` : line.difference}
                        </TableCell>
                        <TableCell>
                          {hasDiff && (
                            <Input
                              value={line.adjustment_reason || ""}
                              onChange={e => updateReason(line.id, e.target.value)}
                              placeholder="Motiv obligatoriu..."
                              className={`h-8 text-sm ${!line.adjustment_reason?.trim() ? "border-destructive" : ""}`}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {lines.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Scanează produse pentru a începe numărarea</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* Closed session view */}
      {activeSession && activeSession.status === "closed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Sesiune Finalizată — {activeSession.location === "magazin" ? "Magazin" : "Depozit"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Start:</span> {new Date(activeSession.start_time).toLocaleString("ro-RO")}</div>
              <div><span className="text-muted-foreground">End:</span> {activeSession.end_time ? new Date(activeSession.end_time).toLocaleString("ro-RO") : "—"}</div>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileDown className="h-3 w-3 mr-1" />Export Rezultate
            </Button>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right">Sistem</TableHead>
                    <TableHead className="text-right">Numerat</TableHead>
                    <TableHead className="text-right">Diferență</TableHead>
                    <TableHead>Motiv</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => (
                    <TableRow key={line.id} className={line.difference !== 0 ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-xs">{line.products?.base_id}</TableCell>
                      <TableCell className="text-sm">{line.products?.name}</TableCell>
                      <TableCell className="text-right font-mono">{line.system_quantity}</TableCell>
                      <TableCell className="text-right font-mono">{line.counted_quantity}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${line.difference !== 0 ? (line.difference > 0 ? "text-green-500" : "text-destructive") : ""}`}>
                        {line.difference > 0 ? `+${line.difference}` : line.difference}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.adjustment_reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session history */}
      {!activeSession && (
        <Card>
          <CardHeader><CardTitle className="text-base">Istoric Inventarieri</CardTitle></CardHeader>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locație</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pornită de</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge variant="secondary">{s.location === "magazin" ? "Magazin" : "Depozit"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === "open" ? "default" : "outline"} className="text-xs">
                        {s.status === "open" ? "Deschisă" : "Închisă"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{(s as any).employees?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.start_time).toLocaleString("ro-RO")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.end_time ? new Date(s.end_time).toLocaleString("ro-RO") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setActiveSessionId(s.id)}>
                        Detalii
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sessions.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nicio sesiune de inventariere</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Start session dialog */}
      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sesiune Nouă de Inventariere</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <AlertTriangle className="h-4 w-4" />
                Atenție
              </div>
              <p className="mt-1 text-muted-foreground">
                POS-ul și transferurile vor fi blocate pentru locația selectată pe durata inventarierii.
              </p>
            </div>
            <Select value={startLocation} onValueChange={setStartLocation}>
              <SelectTrigger><SelectValue placeholder="Selectează locația" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="magazin" disabled={!!openSessions.find(s => s.location === "magazin")}>
                  Magazin Ferdinand {openSessions.find(s => s.location === "magazin") ? "(sesiune deschisă)" : ""}
                </SelectItem>
                <SelectItem value="depozit" disabled={!!openSessions.find(s => s.location === "depozit")}>
                  Depozit {openSessions.find(s => s.location === "depozit") ? "(sesiune deschisă)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={startNotes} onChange={e => setStartNotes(e.target.value)} placeholder="Note opționale..." rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStart(false)}>Anulează</Button>
            <Button onClick={() => startMutation.mutate()} disabled={!startLocation || startMutation.isPending}>
              {startMutation.isPending ? "Se pornește..." : "Pornește Inventarierea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close session dialog */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizare Inventariere</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se vor aplica {totalDifferences} ajustări de stoc. Această acțiune este ireversibilă.
            </p>
            {linesWithDiff.some(l => !l.adjustment_reason?.trim()) && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Completează motivul de ajustare pentru toate diferențele înainte de a închide.
              </div>
            )}
            <div className="text-sm space-y-1">
              {linesWithDiff.slice(0, 5).map(l => (
                <div key={l.id} className="flex justify-between">
                  <span>{l.products?.name}</span>
                  <span className={`font-mono ${l.difference > 0 ? "text-green-500" : "text-destructive"}`}>
                    {l.difference > 0 ? `+${l.difference}` : l.difference}
                  </span>
                </div>
              ))}
              {linesWithDiff.length > 5 && <p className="text-xs text-muted-foreground">...și încă {linesWithDiff.length - 5} ajustări</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClose(false)}>Anulează</Button>
            <Button variant="destructive" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Se finalizează..." : "Confirmă & Închide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

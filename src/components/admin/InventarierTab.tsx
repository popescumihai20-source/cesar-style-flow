import { useState, useRef, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Play, Square, ScanLine, FileDown, AlertTriangle, CheckCircle, ShieldAlert, Package } from "lucide-react";
import { parseBarcode, isValidBarcode } from "@/lib/barcode-parser";

const LOCATION_LABELS: Record<string, string> = {
  magazin: "Magazin Ferdinand",
  depozit: "Depozit Central",
};

export default function InventarierTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showStart, setShowStart] = useState(false);
  const [startLocation, setStartLocation] = useState<string>("");
  const [startNotes, setStartNotes] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
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
  const { data: lines = [], refetch: refetchLines } = useQuery({
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

  // Keep scan input focused when session is active
  useEffect(() => {
    if (activeSession?.status === "open" && scanRef.current) {
      scanRef.current.focus();
    }
  }, [activeSession, lines]);

  // Re-focus scan input on any click in counting area
  const handleCountingAreaClick = useCallback(() => {
    if (scanRef.current) {
      setTimeout(() => scanRef.current?.focus(), 50);
    }
  }, []);

  // Start new session
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!startLocation) throw new Error("Selectează locația");
      
      const existing = openSessions.find(s => s.location === startLocation);
      if (existing) throw new Error(`Există deja o sesiune deschisă pentru ${LOCATION_LABELS[startLocation]}`);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Neautentificat");
      const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).single();
      if (!emp) throw new Error("Angajat negăsit");

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
      toast({ title: "Sesiune inventariere pornită", description: `Vânzările și transferurile sunt acum blocate pentru ${LOCATION_LABELS[startLocation] || startLocation}.` });
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  // Handle barcode scan
  const handleScan = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !activeSessionId || !activeSession) return;

    let product: any = null;

    if (isValidBarcode(trimmed)) {
      const parsed = parseBarcode(trimmed);
      if (parsed.isValid) {
        product = products.find(p => p.base_id === parsed.baseId);
      }
    }
    if (!product) product = products.find(p => p.base_id === trimmed);
    if (!product) product = products.find(p => p.name.toLowerCase() === trimmed.toLowerCase());

    if (!product) {
      toast({ title: "Produs negăsit", description: trimmed, variant: "destructive" });
      setScanInput("");
      scanRef.current?.focus();
      return;
    }

    const existingLine = lines.find(l => l.product_id === product.id && !l.variant_code);

    if (existingLine) {
      const newCount = existingLine.counted_quantity + 1;
      await supabase
        .from("inventory_lines")
        .update({ counted_quantity: newCount })
        .eq("id", existingLine.id);
      setLastScanned(product.name);
      toast({ title: `+1 ${product.name}`, description: `Numărare: ${newCount} (sistem: ${existingLine.system_quantity})` });
    } else {
      const stockField = activeSession.location === "magazin" ? "stock_general" : "stock_depozit";
      await supabase.from("inventory_lines").insert({
        session_id: activeSessionId,
        product_id: product.id,
        system_quantity: (product as any)[stockField] || 0,
        counted_quantity: 1,
      });
      setLastScanned(product.name);
      toast({ title: `Adăugat: ${product.name}`, description: "Numărare: 1" });
    }

    setScanInput("");
    refetchLines();
    scanRef.current?.focus();
  }, [activeSessionId, activeSession, products, lines, toast, refetchLines]);

  const handleScanKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(scanInput);
    }
  }, [handleScan, scanInput]);

  // Update counted_quantity manually
  const updateCounted = async (lineId: string, newCount: number) => {
    await supabase
      .from("inventory_lines")
      .update({ counted_quantity: Math.max(0, newCount) })
      .eq("id", lineId);
    refetchLines();
    scanRef.current?.focus();
  };

  // Update adjustment reason
  const updateReason = async (lineId: string, reason: string) => {
    await supabase
      .from("inventory_lines")
      .update({ adjustment_reason: reason })
      .eq("id", lineId);
  };

  // Close session
  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId || !activeSession) throw new Error("Nicio sesiune activă");

      const linesWithDiff = lines.filter(l => l.difference !== 0);
      const missingReasons = linesWithDiff.filter(l => !l.adjustment_reason?.trim());
      if (missingReasons.length > 0) {
        throw new Error(`${missingReasons.length} linii cu diferențe nu au motiv de ajustare.`);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Neautentificat");
      const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user.id).single();
      if (!emp) throw new Error("Angajat negăsit");

      const stockField = activeSession.location === "magazin" ? "stock_general" : "stock_depozit";

      for (const line of linesWithDiff) {
        const { data: currentProduct } = await supabase
          .from("products")
          .select("stock_general, stock_depozit")
          .eq("id", line.product_id)
          .single();
        
        if (currentProduct) {
          const oldQty = (currentProduct as any)[stockField];
          const newQty = oldQty + line.difference;

          await supabase
            .from("products")
            .update({ [stockField]: Math.max(0, newQty) } as any)
            .eq("id", line.product_id);

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
      toast({ title: "Inventariere finalizată", description: "Stocul a fost ajustat și locația deblocată." });
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

  // Computed stats
  const linesWithDiff = lines.filter(l => l.difference !== 0);
  const totalDifferences = linesWithDiff.length;
  const totalCounted = lines.filter(l => l.counted_quantity > 0).length;
  const totalNotCounted = lines.filter(l => l.counted_quantity === 0).length;
  const totalSurplus = linesWithDiff.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalDeficit = linesWithDiff.filter(l => l.difference < 0).reduce((s, l) => s + Math.abs(l.difference), 0);

  // Row styling helper
  const getRowClass = (line: any) => {
    if (line.counted_quantity === 0) return "opacity-50"; // grey — not yet counted
    if (line.difference === 0) return "bg-green-500/5"; // green — matches
    return "bg-destructive/5"; // red — difference
  };

  return (
    <div className="space-y-4">
      {/* Active inventory banner */}
      {openSessions.length > 0 && !activeSession && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary font-medium">
            <ShieldAlert className="h-5 w-5" />
            Inventariere activă
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {openSessions.map(s => LOCATION_LABELS[s.location]).join(", ")} — vânzările și transferurile sunt blocate.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sesiuni Deschise</p>
            <p className={`text-2xl font-bold font-mono ${openSessions.length > 0 ? "text-primary" : ""}`}>{openSessions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Sesiuni</p>
            <p className="text-2xl font-bold font-mono">{sessions.length}</p>
          </CardContent>
        </Card>
        {activeSession && activeSession.status === "open" && (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Numerate / Total</p>
                <p className="text-2xl font-bold font-mono">{totalCounted}<span className="text-sm text-muted-foreground"> / {lines.length}</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cu Diferențe</p>
                <p className={`text-2xl font-bold font-mono ${totalDifferences > 0 ? "text-destructive" : "text-green-500"}`}>{totalDifferences}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button onClick={() => { setShowStart(true); setStartLocation(""); setStartNotes(""); }} disabled={openSessions.length >= 2}>
          <Play className="h-4 w-4 mr-1" />Sesiune Nouă
        </Button>
        {openSessions.map(s => (
          <Button
            key={s.id}
            variant={activeSessionId === s.id ? "default" : "outline"}
            onClick={() => setActiveSessionId(s.id)}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            {LOCATION_LABELS[s.location]} (deschis)
          </Button>
        ))}
        {activeSession && (
          <Button variant="ghost" size="sm" onClick={() => setActiveSessionId(null)} className="ml-auto">
            ← Înapoi la istoric
          </Button>
        )}
      </div>

      {/* ===== ACTIVE SESSION — COUNTING SCREEN ===== */}
      {activeSession && activeSession.status === "open" && (
        <div className="space-y-4" onClick={handleCountingAreaClick}>
          {/* Session header + lock banner */}
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Inventariere activă pentru</span>
                    <Badge className="bg-primary/20 text-primary text-sm">
                      {LOCATION_LABELS[activeSession.location]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pornită: {new Date(activeSession.start_time).toLocaleString("ro-RO")} • 
                    De: {(activeSession as any).employees?.name}
                    {activeSession.notes && ` • Note: ${activeSession.notes}`}
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
              </div>
            </CardContent>
          </Card>

          {/* Live difference summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border-muted">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Produse</p>
                <p className="text-lg font-bold font-mono">{lines.length}</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conforme</p>
                <p className="text-lg font-bold font-mono text-green-500">{totalCounted - totalDifferences + totalNotCounted > lines.length ? totalCounted - linesWithDiff.length : lines.length - totalDifferences - totalNotCounted}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diferențe</p>
                <p className="text-lg font-bold font-mono text-destructive">{totalDifferences}</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Surplus</p>
                <p className="text-lg font-bold font-mono text-green-500">+{totalSurplus}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deficit</p>
                <p className="text-lg font-bold font-mono text-destructive">-{totalDeficit}</p>
              </CardContent>
            </Card>
          </div>

          {/* Scan input — always focused */}
          <div className="relative">
            <Input
              ref={scanRef}
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScanKeyDown}
              placeholder="📦 Scanează cod de bare..."
              className="h-14 text-lg font-mono bg-primary text-primary-foreground border-2 border-primary/30 focus:border-accent placeholder:text-primary-foreground/50"
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary-foreground/50" />
            </div>
          </div>

          {/* Last scanned indicator */}
          {lastScanned && (
            <p className="text-xs text-muted-foreground">
              Ultimul scanat: <span className="font-medium text-foreground">{lastScanned}</span>
            </p>
          )}

          {/* Lines table */}
          <Card>
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[100px]">Cod Bare</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right w-[90px]">Sistem</TableHead>
                    <TableHead className="text-right w-[100px]">Numerat</TableHead>
                    <TableHead className="text-right w-[90px]">Diferență</TableHead>
                    <TableHead className="w-[200px]">Motiv Ajustare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => {
                    const hasDiff = line.difference !== 0;
                    const notCounted = line.counted_quantity === 0;
                    const matches = !hasDiff && !notCounted;
                    return (
                      <TableRow key={line.id} className={getRowClass(line)}>
                        <TableCell className="font-mono text-xs">{line.products?.base_id}</TableCell>
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {line.products?.name}
                            {matches && <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />}
                            {hasDiff && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{line.system_quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={line.counted_quantity}
                            onChange={e => updateCounted(line.id, parseInt(e.target.value) || 0)}
                            className={`h-8 w-20 text-right font-mono ml-auto ${matches ? "border-green-500/50" : hasDiff ? "border-destructive/50" : ""}`}
                            onFocus={e => e.target.select()}
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
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Scanează produse pentru a începe numărarea
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* ===== CLOSED SESSION VIEW ===== */}
      {activeSession && activeSession.status === "closed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Sesiune Finalizată — {LOCATION_LABELS[activeSession.location]}
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
                    <TableRow key={line.id} className={line.difference !== 0 ? "bg-destructive/5" : line.counted_quantity > 0 ? "bg-green-500/5" : ""}>
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

      {/* ===== SESSION HISTORY ===== */}
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
                      <Badge variant="secondary">{LOCATION_LABELS[s.location]}</Badge>
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

      {/* ===== START SESSION MODAL ===== */}
      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Sesiune Nouă de Inventariere
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Warning */}
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm">
              <div className="flex items-center gap-2 text-destructive font-medium mb-1">
                <AlertTriangle className="h-4 w-4" />
                Atenție — Blocare locație
              </div>
              <p className="text-muted-foreground">
                Pe durata inventarierii, vânzările și transferurile pentru această locație vor fi blocate.
              </p>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Locație <span className="text-destructive">*</span></Label>
              <Select value={startLocation} onValueChange={setStartLocation}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Selectează locația..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="magazin" disabled={!!openSessions.find(s => s.location === "magazin")}>
                    <div className="flex items-center gap-2">
                      <span>Magazin Ferdinand</span>
                      {!!openSessions.find(s => s.location === "magazin") && (
                        <Badge variant="destructive" className="text-[10px]">sesiune deschisă</Badge>
                      )}
                    </div>
                  </SelectItem>
                  <SelectItem value="depozit" disabled={!!openSessions.find(s => s.location === "depozit")}>
                    <div className="flex items-center gap-2">
                      <span>Depozit Central</span>
                      {!!openSessions.find(s => s.location === "depozit") && (
                        <Badge variant="destructive" className="text-[10px]">sesiune deschisă</Badge>
                      )}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Note <span className="text-muted-foreground text-xs">(opțional)</span></Label>
              <Textarea
                value={startNotes}
                onChange={e => setStartNotes(e.target.value)}
                placeholder="Ex: Inventariere trimestrială Q1 2026..."
                rows={2}
              />
            </div>

            {/* Info about snapshot */}
            {startLocation && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Se va face un snapshot al stocului curent din <strong>{LOCATION_LABELS[startLocation]}</strong> cu {products.filter(p => (p as any)[startLocation === "magazin" ? "stock_general" : "stock_depozit"] > 0).length} produse active.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStart(false)}>Anulează</Button>
            <Button onClick={() => startMutation.mutate()} disabled={!startLocation || startMutation.isPending}>
              {startMutation.isPending ? "Se pornește..." : "Pornește Inventarierea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CLOSE SESSION MODAL ===== */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizare Inventariere</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se vor aplica <strong>{totalDifferences}</strong> ajustări de stoc pentru <strong>{activeSession ? LOCATION_LABELS[activeSession.location] : ""}</strong>. Această acțiune este ireversibilă.
            </p>
            {linesWithDiff.some(l => !l.adjustment_reason?.trim()) && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Completează motivul de ajustare pentru toate diferențele înainte de a închide.
              </div>
            )}
            {totalDifferences > 0 && (
              <div className="text-sm space-y-1 max-h-40 overflow-auto">
                {linesWithDiff.map(l => (
                  <div key={l.id} className="flex justify-between items-center py-0.5">
                    <span className="truncate mr-2">{l.products?.name}</span>
                    <span className={`font-mono shrink-0 ${l.difference > 0 ? "text-green-500" : "text-destructive"}`}>
                      {l.difference > 0 ? `+${l.difference}` : l.difference}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {totalDifferences === 0 && (
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-600">
                <CheckCircle className="h-4 w-4 inline mr-1" />
                Toate cantitățile corespund — nicio ajustare necesară.
              </div>
            )}
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

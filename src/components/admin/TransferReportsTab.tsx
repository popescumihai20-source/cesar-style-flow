import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown } from "lucide-react";

export default function TransferReportsTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);

  // Fetch all audit logs
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["transfer-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch transfer headers for grouping
  const { data: transfers = [] } = useQuery({
    queryKey: ["transfer-headers-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_headers" as any)
        .select("*, from_loc:from_location_id(name), to_loc:to_location_id(name), employees:created_by_employee_id(name, employee_card_code)")
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch locations for filter
  const { data: locations = [] } = useQuery({
    queryKey: ["inventory-locations-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_locations" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Unique employees from audit logs
  const uniqueEmployees = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((l: any) => { if (l.employee_name) set.add(l.employee_name); });
    return Array.from(set).sort();
  }, [auditLogs]);

  // Filter transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t: any) => {
      if (dateFrom) {
        const tDate = new Date(t.confirmed_at || t.created_at).toISOString().slice(0, 10);
        if (tDate < dateFrom) return false;
      }
      if (dateTo) {
        const tDate = new Date(t.confirmed_at || t.created_at).toISOString().slice(0, 10);
        if (tDate > dateTo) return false;
      }
      if (locationFilter !== "all") {
        const locName = locations.find((l: any) => l.id === locationFilter)?.name;
        if (t.from_loc?.name !== locName && t.to_loc?.name !== locName) return false;
      }
      if (employeeFilter !== "all") {
        if (t.employees?.name !== employeeFilter) return false;
      }
      return true;
    });
  }, [transfers, dateFrom, dateTo, locationFilter, employeeFilter, locations]);

  // Detail: lines for selected transfer
  const selectedLogs = useMemo(() => {
    if (!selectedTransferId) return [];
    return auditLogs.filter((l: any) => l.transfer_id === selectedTransferId);
  }, [auditLogs, selectedTransferId]);

  const exportCSV = () => {
    const headers = ["Data", "Din", "În", "Produs", "Cod", "Cantitate", "Angajat", "Card", "Note"];
    const rows = auditLogs
      .filter((l: any) => {
        if (dateFrom && new Date(l.created_at).toISOString().slice(0, 10) < dateFrom) return false;
        if (dateTo && new Date(l.created_at).toISOString().slice(0, 10) > dateTo) return false;
        if (locationFilter !== "all") {
          const locName = locations.find((loc: any) => loc.id === locationFilter)?.name;
          if (l.from_location_name !== locName && l.to_location_name !== locName) return false;
        }
        if (employeeFilter !== "all" && l.employee_name !== employeeFilter) return false;
        return true;
      })
      .map((l: any) => [
        new Date(l.created_at).toLocaleString("ro-RO"),
        l.from_location_name, l.to_location_name,
        l.product_name, l.product_base_id, l.quantity,
        l.employee_name || "", l.employee_card_code || "", l.note || "",
      ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transferuri_audit.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">De la</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Până la</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Locație</label>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate locațiile</SelectItem>
                {locations.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Angajat</label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toți angajații</SelectItem>
                {uniqueEmployees.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <FileDown className="h-3 w-3 mr-1" />Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Transfer list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transferuri Confirmate ({filteredTransfers.length})</CardTitle>
        </CardHeader>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Din</TableHead>
                <TableHead>În</TableHead>
                <TableHead>Angajat</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.map((t: any) => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTransferId(t.id)}>
                  <TableCell className="text-xs">
                    {new Date(t.confirmed_at || t.created_at).toLocaleString("ro-RO")}
                  </TableCell>
                  <TableCell>{t.from_loc?.name || "—"}</TableCell>
                  <TableCell>{t.to_loc?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{t.employees?.name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.note || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="text-xs cursor-pointer">Detalii</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTransfers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Niciun transfer găsit
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedTransferId} onOpenChange={(open) => { if (!open) setSelectedTransferId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalii Transfer</DialogTitle>
          </DialogHeader>
          {selectedLogs.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Direcție:</span>
                  <span>{selectedLogs[0].from_location_name} → {selectedLogs[0].to_location_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Angajat:</span>
                  <span>{selectedLogs[0].employee_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Card:</span>
                  <span className="font-mono">{selectedLogs[0].employee_card_code || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span>{new Date(selectedLogs[0].created_at).toLocaleString("ro-RO")}</span>
                </div>
                {selectedLogs[0].note && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Note:</span>
                    <span>{selectedLogs[0].note}</span>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod</TableHead>
                    <TableHead>Produs</TableHead>
                    <TableHead className="text-right">Cantitate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLogs.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.product_base_id}</TableCell>
                      <TableCell>{l.product_name}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{l.quantity}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} className="text-right font-medium">Total produse:</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {selectedLogs.reduce((s: number, l: any) => s + l.quantity, 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

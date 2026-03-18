import { useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface ExcelRow {
  articol: string;
  model: string;
  producator: string;
  data: string;
  pretVanzare: number;
  pretAchizitie: number;
}

interface ExcelImportProps {
  onImport: (rows: ExcelRow[]) => void;
}

const TEMPLATE_COLUMNS = ["Articol", "Model", "Producator", "Data", "Pret Vanzare", "Pret Achizitie"];

export function ExcelImport({ onImport }: ExcelImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const downloadTemplate = useCallback(() => {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLUMNS,
      ["01", "Pantofi Sport", "Nike", "27/02/2026", 250, 120],
    ]);
    ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receptie");
    XLSX.writeFile(wb, "template_receptie.xlsx");
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        // cellText: true prevents float64 precision loss on 17-digit barcodes
        const wb = XLSX.read(data, { type: "array", cellText: true, cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(ws, { raw: false, defval: "" });

        if (json.length === 0) {
          toast({ title: "Fișierul este gol", variant: "destructive" });
          return;
        }

        const rows: ExcelRow[] = json.map((row: any) => ({
          articol: String(row["Articol"] ?? row["articol"] ?? "").trim(),
          model: String(row["Model"] ?? row["model"] ?? "").trim(),
          producator: String(row["Producator"] ?? row["producator"] ?? "").trim(),
          data: String(row["Data"] ?? row["data"] ?? "").trim(),
          pretVanzare: parseFloat(row["Pret Vanzare"] ?? row["pret vanzare"] ?? row["Pret_Vanzare"] ?? 0) || 0,
          pretAchizitie: parseFloat(row["Pret Achizitie"] ?? row["pret achizitie"] ?? row["Pret_Achizitie"] ?? 0) || 0,
        }));

        const valid = rows.filter(r => r.articol || r.model);
        if (valid.length === 0) {
          toast({ title: "Nu s-au găsit rânduri valide", description: "Verifică numele coloanelor: Articol, Model, Producator, Data, Pret Vanzare, Pret Achizitie", variant: "destructive" });
          return;
        }

        onImport(valid);
        toast({ title: `✅ ${valid.length} produse importate din Excel` });
      } catch (err: any) {
        toast({ title: "Eroare la citirea fișierului", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset input so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = "";
  }, [onImport, toast]);

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <Download className="h-4 w-4 mr-1" />Template Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4 mr-1" />Import Excel
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

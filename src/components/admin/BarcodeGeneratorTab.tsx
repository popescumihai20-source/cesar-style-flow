import { useState, useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, Copy, Plus, Trash2, Barcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { useColorDictionary } from "@/hooks/use-color-dictionary";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";

interface GeneratedBarcode {
  barcode: string;
  articolCode: string;
  articolName: string;
  colorCode: string;
  colorName: string;
  producatorCode: string;
  producatorName: string;
  permanent: boolean;
  date: string;
  price: string;
}

export default function BarcodeGeneratorTab() {
  const { activeEntries: articolEntries } = useArticolDictionary();
  const { activeColors } = useColorDictionary();
  const { activeProducatori } = useProducatorDictionary();

  const [articolCode, setArticolCode] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [producatorCode, setProducatorCode] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [labelPrice, setLabelPrice] = useState("");
  const [bulkQty, setBulkQty] = useState(1);
  const [generated, setGenerated] = useState<GeneratedBarcode[]>([]);

  const formatDateDDMMYY = (d: Date): string => {
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yy = (d.getFullYear() % 100).toString().padStart(2, "0");
    return `${dd}${mm}${yy}`;
  };

  const canGenerate = articolCode && colorCode && producatorCode && labelPrice && entryDate;

  const handleGenerate = () => {
    if (!canGenerate) {
      toast.error("Completează toate câmpurile");
      return;
    }
    const priceNum = parseInt(labelPrice, 10);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 9999) {
      toast.error("Prețul trebuie să fie între 0 și 9999");
      return;
    }

    const priceStr = priceNum.toString().padStart(4, "0");
    const dateStr = formatDateDDMMYY(entryDate);
    const permFlag = permanent ? "1" : "0";
    const barcode = `${articolCode}${colorCode}${producatorCode}${permFlag}${dateStr}${priceStr}`;

    if (barcode.length !== 17) {
      toast.error(`Cod de bare invalid: ${barcode.length} cifre în loc de 17`);
      return;
    }

    const articolName = articolEntries.find(a => a.code === articolCode)?.name || "?";
    const colorName = activeColors.find(c => c.code === colorCode)?.name || "?";
    const producatorName = activeProducatori.find(p => p.code === producatorCode)?.name || "?";

    const newBarcodes: GeneratedBarcode[] = [];
    for (let i = 0; i < bulkQty; i++) {
      newBarcodes.push({
        barcode,
        articolCode,
        articolName,
        colorCode,
        colorName,
        producatorCode,
        producatorName,
        permanent,
        date: dateStr,
        price: priceStr,
      });
    }

    setGenerated(prev => [...newBarcodes, ...prev]);
    toast.success(`${bulkQty} cod(uri) generate`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiat în clipboard");
  };

  const copyAll = () => {
    const all = generated.map(g => g.barcode).join("\n");
    navigator.clipboard.writeText(all);
    toast.success(`${generated.length} coduri copiate`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Barcode className="h-4 w-4" /> Generator Cod de Bare V1 (17 cifre)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Articol, Color, Producator */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Articol [0-1]</Label>
              <Select value={articolCode} onValueChange={setArticolCode}>
                <SelectTrigger><SelectValue placeholder="Selectează..." /></SelectTrigger>
                <SelectContent>
                  {articolEntries.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Culoare [2-3]</Label>
              <Select value={colorCode} onValueChange={setColorCode}>
                <SelectTrigger><SelectValue placeholder="Selectează..." /></SelectTrigger>
                <SelectContent>
                  {activeColors.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Producător [4-5]</Label>
              <Select value={producatorCode} onValueChange={setProducatorCode}>
                <SelectTrigger><SelectValue placeholder="Selectează..." /></SelectTrigger>
                <SelectContent>
                  {activeProducatori.length === 0 ? (
                    <SelectItem value="_empty" disabled>Niciun producător adăugat</SelectItem>
                  ) : (
                    activeProducatori.map(p => (
                      <SelectItem key={p.code} value={p.code}>{p.code} - {p.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Permanent, Date, Price, Qty */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Permanent [6]</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={permanent} onCheckedChange={setPermanent} />
                <span className="text-sm font-mono">{permanent ? "1" : "0"}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data intrare [7-12]</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !entryDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate ? format(entryDate, "dd.MM.yyyy") : "Alege data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={entryDate} onSelect={(d) => d && setEntryDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preț etichetă [13-16]</Label>
              <Input
                type="number"
                placeholder="0-9999"
                value={labelPrice}
                onChange={e => setLabelPrice(e.target.value)}
                min={0}
                max={9999}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cantitate</Label>
              <Input
                type="number"
                value={bulkQty}
                onChange={e => setBulkQty(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={100}
              />
            </div>
          </div>

          {/* Preview */}
          {canGenerate && (
            <div className="bg-muted/50 rounded-md p-3 font-mono text-sm">
              <span className="text-primary font-bold">{articolCode}</span>
              <span className="text-accent-foreground font-bold">{colorCode}</span>
              <span className="text-secondary-foreground font-bold">{producatorCode}</span>
              <span className="text-muted-foreground font-bold">{permanent ? "1" : "0"}</span>
              <span className="text-muted-foreground">{formatDateDDMMYY(entryDate)}</span>
              <span className="text-destructive font-bold">{(parseInt(labelPrice) || 0).toString().padStart(4, "0")}</span>
              <span className="text-xs text-muted-foreground ml-2">= {17} cifre</span>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Generează {bulkQty > 1 ? `${bulkQty} coduri` : "cod"}
          </Button>
        </CardContent>
      </Card>

      {/* Generated list */}
      {generated.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Coduri generate ({generated.length})</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyAll}>
                <Copy className="h-3 w-3 mr-1" /> Copiază toate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setGenerated([])}>
                <Trash2 className="h-3 w-3 mr-1" /> Șterge lista
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-auto">
            {generated.map((g, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-md border bg-card hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-lg font-bold tracking-wider">{g.barcode}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-xs">{g.articolCode}-{g.articolName}</Badge>
                    <Badge variant="outline" className="text-xs">{g.colorCode}-{g.colorName}</Badge>
                    <Badge variant="outline" className="text-xs">{g.producatorCode}-{g.producatorName}</Badge>
                    <Badge variant={g.permanent ? "default" : "secondary"} className="text-xs">
                      {g.permanent ? "Permanent" : "Sezonier"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {g.date.substring(0, 2)}.{g.date.substring(2, 4)}.{g.date.substring(4, 6)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{parseInt(g.price)} RON</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => copyToClipboard(g.barcode)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useArticolDictionary } from "@/hooks/use-articol-dictionary";
import { useColorDictionary } from "@/hooks/use-color-dictionary";
import { useProducatorDictionary } from "@/hooks/use-producator-dictionary";
import { BarcodePreview } from "@/components/receptie/BarcodePreview";
import { toast } from "sonner";

export interface GeneratedProduct {
  articolCode: string;
  colorCode: string;
  producatorCode: string;
  permanent: boolean;
  dateStr: string;
  labelPrice: number;
  costPrice: number;
  quantity: number;
  barcode: string;
  baseId: string;
  productName: string;
}

interface NewProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (product: GeneratedProduct) => void;
}

function todayDDMMYY(): string {
  const d = new Date();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yy = (d.getFullYear() % 100).toString().padStart(2, "0");
  return `${dd}${mm}${yy}`;
}

export function NewProductModal({ open, onOpenChange, onGenerate }: NewProductModalProps) {
  const { activeEntries: articolEntries } = useArticolDictionary();
  const { activeColors } = useColorDictionary();
  const { activeProducatori } = useProducatorDictionary();

  const [articolCode, setArticolCode] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [producatorCode, setProducatorCode] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [labelPrice, setLabelPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [quantity, setQuantity] = useState(1);

  const dateStr = todayDDMMYY();

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!articolCode) errors.push("Selectează articolul");
    else if (!/^\d{2}$/.test(articolCode)) errors.push("Cod articol trebuie să fie exact 2 cifre");
    if (!colorCode) errors.push("Selectează culoarea");
    else if (!/^\d{2}$/.test(colorCode)) errors.push("Cod culoare trebuie să fie exact 2 cifre");
    if (!producatorCode) errors.push("Selectează producătorul");
    else if (!/^\d{2}$/.test(producatorCode)) errors.push("Cod producător trebuie să fie exact 2 cifre");
    if (!/^\d{6}$/.test(dateStr)) errors.push("Data internă invalidă");

    const priceNum = parseInt(labelPrice, 10);
    if (!labelPrice || isNaN(priceNum)) errors.push("Introdu prețul etichetă");
    else if (priceNum < 0 || priceNum > 9999) errors.push("Preț etichetă: 0-9999");

    if (quantity < 1) errors.push("Cantitate minimă: 1");
    return errors;
  }, [articolCode, colorCode, producatorCode, dateStr, labelPrice, quantity]);

  const barcode = useMemo(() => {
    if (!/^\d{2}$/.test(articolCode) || !/^\d{2}$/.test(colorCode) || !/^\d{2}$/.test(producatorCode)) return "";
    const priceNum = parseInt(labelPrice, 10);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 9999) return "";
    const flag = permanent ? "1" : "0";
    const priceStr = priceNum.toString().padStart(4, "0");
    const bc = `${articolCode}${colorCode}${producatorCode}${flag}${dateStr}${priceStr}`;
    if (bc.length !== 17) return "";
    console.log(`[BarcodeGen] Generated: ${bc} (length=${bc.length})`);
    return bc;
  }, [articolCode, colorCode, producatorCode, permanent, dateStr, labelPrice]);

  const handleSubmit = () => {
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    if (barcode.length !== 17) {
      toast.error(`Cod de bare invalid: ${barcode.length} cifre (trebuie 17)`);
      return;
    }

    const artName = articolEntries.find(a => a.code === articolCode)?.name || articolCode;
    const colName = activeColors.find(c => c.code === colorCode)?.name || colorCode;
    const prodName = activeProducatori.find(p => p.code === producatorCode)?.name || producatorCode;
    const baseId = `${articolCode}${colorCode}${producatorCode}${permanent ? "1" : "0"}`;

    console.log(`[BarcodeGen] Validated: barcode=${barcode}, baseId=${baseId}, qty=${quantity}`);

    onGenerate({
      articolCode,
      colorCode,
      producatorCode,
      permanent,
      dateStr,
      labelPrice: parseInt(labelPrice, 10),
      costPrice: parseFloat(costPrice) || 0,
      quantity,
      barcode,
      baseId,
      productName: `${artName} ${colName} ${prodName}`,
    });

    // Reset form
    setArticolCode("");
    setColorCode("");
    setProducatorCode("");
    setPermanent(true);
    setLabelPrice("");
    setCostPrice("");
    setQuantity(1);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Primește produse noi + Generează coduri</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Articol [AA]</Label>
              <Select value={articolCode} onValueChange={setArticolCode}>
                <SelectTrigger className="h-9"><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {articolEntries.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Culoare [CC]</Label>
              <Select value={colorCode} onValueChange={setColorCode}>
                <SelectTrigger className="h-9"><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {activeColors.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Producător [PP]</Label>
              <Select value={producatorCode} onValueChange={setProducatorCode}>
                <SelectTrigger className="h-9"><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {activeProducatori.map(p => (
                    <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Permanent [F]</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={permanent} onCheckedChange={setPermanent} />
                <span className="text-sm font-mono">{permanent ? "1" : "0"}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Data intrare [DDMMYY]</Label>
              <Input value={`${dateStr.substring(0,2)}.${dateStr.substring(2,4)}.${dateStr.substring(4,6)}`} disabled className="h-9 font-mono bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Preț etichetă [PRIC]</Label>
              <Input type="number" placeholder="0-9999" value={labelPrice} onChange={e => setLabelPrice(e.target.value)} min={0} max={9999} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Preț achiziție</Label>
              <Input type="number" placeholder="RON" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Cantitate</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} min={1} className="h-9" />
            </div>
          </div>

          {/* Barcode preview */}
          {barcode && (
            <div className="bg-muted/50 rounded-md p-3 space-y-1">
              <div className="font-mono text-lg font-bold tracking-wider text-center">{barcode}</div>
              <div className="flex justify-center">
                <BarcodePreview value={barcode} />
              </div>
              <div className="text-xs text-muted-foreground text-center">
                [{articolCode}][{colorCode}][{producatorCode}][{permanent ? "1" : "0"}][{dateStr}][{parseInt(labelPrice || "0").toString().padStart(4, "0")}] = 17 cifre ✓
              </div>
            </div>
          )}

          {validationErrors.length > 0 && barcode === "" && (
            <p className="text-xs text-destructive">{validationErrors[0]}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anulează</Button>
          <Button onClick={handleSubmit} disabled={validationErrors.length > 0}>
            <Plus className="h-4 w-4 mr-1" />Generează și adaugă
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Props {
  productId: string;
}

export function ProductVariantsEditor({ productId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newStock, setNewStock] = useState(0);

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["variants", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("variant_code");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("product_variants").insert({
        product_id: productId,
        variant_code: newCode,
        label: newLabel,
        stock_variant: newStock,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      setNewCode(""); setNewLabel(""); setNewStock(0);
      toast({ title: "Variantă adăugată" });
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Variantă ștearsă" });
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase.from("product_variants").update({ stock_variant: stock }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
    },
  });

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cod</TableHead>
            <TableHead>Etichetă</TableHead>
            <TableHead className="text-right">Stoc</TableHead>
            <TableHead className="text-right w-20">Acțiuni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map(v => (
            <TableRow key={v.id}>
              <TableCell className="font-mono">{v.variant_code}</TableCell>
              <TableCell>{v.label}</TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  defaultValue={v.stock_variant}
                  className="h-7 w-20 ml-auto text-right"
                  onBlur={e => {
                    const val = parseInt(e.target.value) || 0;
                    if (val !== v.stock_variant) updateStockMutation.mutate({ id: v.id, stock: val });
                  }}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(v.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {variants.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nicio variantă</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <div className="flex-1"><Input placeholder="Cod (ex: 50)" value={newCode} onChange={e => setNewCode(e.target.value)} className="h-8" /></div>
        <div className="flex-1"><Input placeholder="Etichetă (ex: M)" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="h-8" /></div>
        <div className="w-20"><Input type="number" placeholder="Stoc" value={newStock || ""} onChange={e => setNewStock(parseInt(e.target.value) || 0)} className="h-8" /></div>
        <Button size="sm" onClick={() => addMutation.mutate()} disabled={!newCode || !newLabel}>
          <Plus className="h-3 w-3 mr-1" />Adaugă
        </Button>
      </div>
    </div>
  );
}

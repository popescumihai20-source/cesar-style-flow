import { ShoppingCart } from "lucide-react";

export default function POS() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Punct de Vânzare</h1>
          <p className="text-sm text-muted-foreground">Mod PUBLIC — scanează cardul de angajat pentru a începe</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Interfața POS va fi construită în pasul următor.</p>
      </div>
    </div>
  );
}

import { Package } from "lucide-react";

export default function Produse() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Produse</h1>
          <p className="text-sm text-muted-foreground">Gestionare catalog produse și variante</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Modulul de administrare produse va fi construit în pasul următor.</p>
      </div>
    </div>
  );
}

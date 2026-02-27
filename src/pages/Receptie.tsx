import { Truck } from "lucide-react";

export default function Receptie() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Recepție Marfă</h1>
          <p className="text-sm text-muted-foreground">Intrare în stoc și recepții noi</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Modulul de recepție va fi construit în pasul următor.</p>
      </div>
    </div>
  );
}

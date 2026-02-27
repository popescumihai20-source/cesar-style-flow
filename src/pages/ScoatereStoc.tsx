import { PackageMinus } from "lucide-react";

export default function ScoatereStoc() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PackageMinus className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Scoatere Stoc</h1>
          <p className="text-sm text-muted-foreground">Scoatere produse din stoc (nu ca vânzare)</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Modulul de scoatere stoc va fi construit în pasul următor.</p>
      </div>
    </div>
  );
}

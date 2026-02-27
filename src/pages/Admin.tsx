import { Settings } from "lucide-react";

export default function Admin() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Panou Admin</h1>
          <p className="text-sm text-muted-foreground">Dashboard, angajați, dispozitive, rapoarte</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Panoul admin va fi construit în pasul următor.</p>
      </div>
    </div>
  );
}

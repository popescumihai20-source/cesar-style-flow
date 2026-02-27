import { ShoppingCart, Package, Truck, PackageMinus, LayoutDashboard, Settings, LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/pos", label: "POS", icon: ShoppingCart },
  { to: "/produse", label: "Produse", icon: Package },
  { to: "/receptie", label: "Recepție", icon: Truck },
  { to: "/scoatere-stoc", label: "Scoatere Stoc", icon: PackageMinus },
  { to: "/admin", label: "Admin", icon: Settings },
];

export function AppSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <span className="font-display text-lg font-bold text-primary-foreground">C</span>
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-gold-gradient">Cesar's</h1>
          <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Retail System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/40">
          <LayoutDashboard className="h-4 w-4" />
          <span>Mod PUBLIC</span>
        </div>
      </div>
    </aside>
  );
}

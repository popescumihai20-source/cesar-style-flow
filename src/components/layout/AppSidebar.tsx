import { ShoppingCart, Package, Truck, PackageMinus, Settings, LayoutDashboard } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "POS", url: "/pos", icon: ShoppingCart },
  { title: "Produse", url: "/produse", icon: Package },
  { title: "Recepție", url: "/receptie", icon: Truck },
  { title: "Scoatere Stoc", url: "/scoatere-stoc", icon: PackageMinus },
  { title: "Admin", url: "/admin", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">C</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display text-lg font-bold text-gold-gradient leading-tight">Cesar's</h1>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Retail System</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigare</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/40">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Mod PUBLIC</span>}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

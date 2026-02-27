import { ShoppingCart, Package, Truck, PackageMinus, Settings, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
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
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Magazin Ferdinand", url: "/pos", icon: ShoppingCart, roles: [] },
  { title: "Produse", url: "/produse", icon: Package, roles: ["admin"] },
  { title: "Recepție", url: "/receptie", icon: Truck, roles: ["admin"] },
  { title: "Scoatere Stoc", url: "/scoatere-stoc", icon: PackageMinus, roles: [] },
  { title: "Admin", url: "/admin", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { roles, user, signOut } = useAuth();
  const navigate = useNavigate();

  const visibleItems = navItems.filter(
    (item) => item.roles.length === 0 || item.roles.some((r) => roles.includes(r as any))
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
            <span className="font-parkavenue text-lg text-accent-foreground">C</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-parkavenue text-2xl text-gold-gradient leading-tight">Cesar's</h1>
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
              {visibleItems.map((item) => (
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

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed && user && (
          <p className="text-[10px] text-sidebar-foreground/40 px-2 mb-1 truncate">
            {user.email}
          </p>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className="w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Deconectare</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

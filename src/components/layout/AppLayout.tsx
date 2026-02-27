import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background dark">
      <AppSidebar />
      <main className="ml-64 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

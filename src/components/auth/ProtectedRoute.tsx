import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

type AppRole = "admin" | "casier" | "depozit";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 mx-auto rounded-lg bg-accent animate-pulse" />
          <p className="text-sm text-muted-foreground">Se încarcă...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some((role) => roles.includes(role));
    if (!hasAccess) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-3">
            <p className="text-lg font-bold text-destructive">Acces interzis</p>
            <p className="text-sm text-muted-foreground">
              Nu ai permisiunile necesare pentru această pagină.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

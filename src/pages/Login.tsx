import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShoppingCart, ShieldCheck } from "lucide-react";

export default function Login() {
  const [loading, setLoading] = useState<"admin" | "casier" | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/pos", { replace: true });
  }, [user, navigate]);

  const handleQuickLogin = async (role: "admin" | "casier") => {
    setError("");
    setLoading(role);

    try {
      // Find first active employee with this role
      const { data: employee, error: empErr } = await supabase
        .from("employees")
        .select("employee_card_code, pin_login, name")
        .eq("role", role)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (empErr) throw empErr;
      if (!employee) {
        setError(`Nu există angajat activ cu rolul "${role}"`);
        setLoading(null);
        return;
      }

      // Call auth edge function
      const { data, error: fnErr } = await supabase.functions.invoke("auth-by-card", {
        body: { card_code: employee.employee_card_code, pin_login: employee.pin_login },
      });

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: `Bun venit, ${data.employee?.name || employee.name}!`,
          description: `Rol: ${role}`,
        });

        if (role === "admin") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/pos", { replace: true });
        }
      }
    } catch (err: any) {
      setError(err.message || "Eroare la autentificare");
    } finally {
      setLoading(null);
    }
  };

  if (user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
            <span className="font-parkavenue text-2xl text-accent-foreground">C</span>
          </div>
          <CardTitle className="font-parkavenue text-3xl text-gold-gradient">Cesar's</CardTitle>
          <CardDescription>Selectează tipul de acces</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full h-16 text-lg gap-3"
            onClick={() => handleQuickLogin("casier")}
            disabled={loading !== null}
          >
            {loading === "casier" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShoppingCart className="h-5 w-5" />
            )}
            Vânzător
          </Button>
          <Button
            variant="secondary"
            className="w-full h-16 text-lg gap-3"
            onClick={() => handleQuickLogin("admin")}
            disabled={loading !== null}
          >
            {loading === "admin" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
            Admin
          </Button>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <p className="text-center text-xs text-muted-foreground">
            Acces rapid — fără cod de card sau PIN
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

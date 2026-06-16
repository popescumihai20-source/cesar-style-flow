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
  const { user, signInWithCard } = useAuth();

  useEffect(() => {
    if (user) navigate("/pos", { replace: true });
  }, [user, navigate]);

  const handleQuickLogin = async (role: "admin" | "casier") => {
    setError("");
    setLoading(role);

    try {
      // Quick-login: server-side lookup via edge function (no anon read on employees)
      const { data: quick, error: quickErr } = await supabase.functions.invoke("employee-auth", {
        body: { action: "quick_login", role },
      });
      if (quickErr) throw quickErr;
      if (!quick?.employee) {
        setError(quick?.error || `Nu există angajat activ cu rolul "${role}"`);
        setLoading(null);
        return;
      }

      const { employee: emp } = await signInWithCard(quick.employee.card_code);

      toast({
        title: `Bun venit, ${emp.name}!`,
        description: `Rol: ${role}`,
      });

      navigate(role === "admin" ? "/admin" : "/pos", { replace: true });
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

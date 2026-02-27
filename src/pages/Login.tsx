import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2 } from "lucide-react";

export default function Login() {
  const [cardCode, setCardCode] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate("/pos", { replace: true });
  }, [user, navigate]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardCode.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-by-card", {
        body: { card_code: cardCode.trim() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Set the session returned by edge function
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: `Bun venit, ${data.employee?.name || "Angajat"}!`,
          description: `Rol: ${(data.roles || []).join(", ") || "casier"}`,
        });

        navigate("/pos");
      }
    } catch (err: any) {
      toast({
        title: "Autentificare eșuată",
        description: err.message || "Card invalid sau inactiv",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
          <CardDescription>Scanează sau introdu codul cardului de angajat</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={cardCode}
                onChange={(e) => setCardCode(e.target.value)}
                placeholder="Cod card angajat..."
                className="h-14 pl-11 text-lg font-mono"
                autoFocus
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base" disabled={loading || !cardCode.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se autentifică...
                </>
              ) : (
                "Autentificare"
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Introdu codul de pe cardul de angajat sau scanează-l
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

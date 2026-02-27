import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, Lock } from "lucide-react";

export default function Login() {
  const [step, setStep] = useState<"card" | "pin">("card");
  const [cardCode, setCardCode] = useState("");
  const [pinLogin, setPinLogin] = useState("");
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/pos", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (step === "card") cardRef.current?.focus();
    else pinRef.current?.focus();
  }, [step]);

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cardCode.trim();
    if (!/^\d{7}$/.test(trimmed)) {
      toast({ title: "Cod card invalid", description: "Trebuie exact 7 cifre numerice", variant: "destructive" });
      return;
    }
    setStep("pin");
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinLogin)) {
      toast({ title: "PIN invalid", description: "Trebuie exact 4 cifre", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-by-card", {
        body: { card_code: cardCode.trim(), pin_login: pinLogin },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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
        description: err.message || "Card invalid sau PIN incorect",
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
          <CardDescription>
            {step === "card" ? "Scanează sau introdu codul cardului de angajat" : "Introdu PIN-ul de autentificare"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "card" ? (
            <form onSubmit={handleCardSubmit} className="space-y-4">
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={cardRef}
                  value={cardCode}
                  onChange={(e) => setCardCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="Cod card (7 cifre)..."
                  className="h-14 pl-11 text-lg font-mono"
                  autoFocus
                  maxLength={7}
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={cardCode.trim().length !== 7}>
                Continuă
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Card: <span className="font-mono font-bold">{cardCode}</span>
                <Button type="button" variant="link" size="sm" onClick={() => { setStep("card"); setPinLogin(""); }} className="ml-2">
                  Schimbă
                </Button>
              </p>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={pinRef}
                  type="password"
                  value={pinLogin}
                  onChange={(e) => setPinLogin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="PIN (4 cifre)..."
                  className="h-14 pl-11 text-lg font-mono text-center tracking-widest"
                  autoFocus
                  maxLength={4}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={loading || pinLogin.length !== 4}>
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
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Introdu codul de pe cardul de angajat și PIN-ul personal
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

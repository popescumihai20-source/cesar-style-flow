import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, Lock } from "lucide-react";

const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// In-memory lockout map (card_code -> { attempts, lockedUntil })
const lockoutMap = new Map<string, { attempts: number; lockedUntil: number }>();

function getLockout(card: string) {
  const entry = lockoutMap.get(card);
  if (!entry) return { locked: false, attempts: 0 };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const remainMin = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { locked: true, attempts: entry.attempts, remainMin };
  }
  // Lock expired — reset
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    lockoutMap.delete(card);
    return { locked: false, attempts: 0 };
  }
  return { locked: false, attempts: entry.attempts };
}

function recordFailedAttempt(card: string) {
  const entry = lockoutMap.get(card) || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
  }
  lockoutMap.set(card, entry);
}

function clearAttempts(card: string) {
  lockoutMap.delete(card);
}

export default function Login() {
  const [step, setStep] = useState<"card" | "pin">("card");
  const [cardCode, setCardCode] = useState("");
  const [pinLogin, setPinLogin] = useState("");
  const [cardError, setCardError] = useState("");
  const [pinError, setPinError] = useState("");
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

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError("");
    const trimmed = cardCode.trim();

    if (!/^\d{7}$/.test(trimmed)) {
      setCardError("Cod card invalid — trebuie exact 7 cifre numerice");
      return;
    }

    // Check lockout
    const lock = getLockout(trimmed);
    if (lock.locked) {
      setCardError(`Card blocat. Încercați din nou în ${lock.remainMin} minute.`);
      return;
    }

    // Validate card exists and is active
    setLoading(true);
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, employee_card_code")
        .eq("employee_card_code", trimmed)
        .eq("active", true)
        .maybeSingle();

      if (!emp) {
        setCardError("Date invalide");
        setLoading(false);
        return;
      }

      setStep("pin");
    } catch {
      setCardError("Date invalide");
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");

    if (!/^\d{4}$/.test(pinLogin)) {
      setPinError("PIN invalid — trebuie exact 4 cifre");
      return;
    }

    const card = cardCode.trim();

    // Check lockout before attempt
    const lock = getLockout(card);
    if (lock.locked) {
      setPinError(`Card blocat. Încercați din nou în ${lock.remainMin} minute.`);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-by-card", {
        body: { card_code: card, pin_login: pinLogin },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.session) {
        clearAttempts(card);

        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: `Bun venit, ${data.employee?.name || "Angajat"}!`,
          description: `Rol: ${(data.roles || []).join(", ") || "casier"}`,
        });

        // Role-based redirect
        const roles: string[] = data.roles || [];
        const employeeRole: string = data.employee?.role || "";

        if (roles.includes("admin") || employeeRole === "admin") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/pos", { replace: true });
        }
      }
    } catch (err: any) {
      recordFailedAttempt(card);
      const lockAfter = getLockout(card);

      if (lockAfter.locked) {
        setPinError(`Prea multe încercări. Card blocat pentru 10 minute.`);
      } else {
        const remaining = MAX_ATTEMPTS - lockAfter.attempts;
        setPinError(`Date invalide. ${remaining} încercări rămase.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCard = () => {
    setStep("card");
    setPinLogin("");
    setPinError("");
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
                  onChange={(e) => { setCardCode(e.target.value.replace(/\D/g, "").slice(0, 7)); setCardError(""); }}
                  placeholder="Cod card (7 cifre)..."
                  className={`h-14 pl-11 text-lg font-mono ${cardError ? "border-destructive" : ""}`}
                  autoFocus
                  maxLength={7}
                  disabled={loading}
                />
              </div>
              {cardError && <p className="text-sm text-destructive">{cardError}</p>}
              <Button type="submit" className="w-full h-12 text-base" disabled={cardCode.trim().length !== 7 || loading}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Se verifică...</> : "Continuă"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Card: <span className="font-mono font-bold">{cardCode}</span>
                <Button type="button" variant="link" size="sm" onClick={handleBackToCard} className="ml-2">
                  Schimbă
                </Button>
              </p>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={pinRef}
                  type="password"
                  value={pinLogin}
                  onChange={(e) => { setPinLogin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
                  placeholder="PIN (4 cifre)..."
                  className={`h-14 pl-11 text-lg font-mono text-center tracking-widest ${pinError ? "border-destructive" : ""}`}
                  autoFocus
                  maxLength={4}
                  disabled={loading}
                />
              </div>
              {pinError && <p className="text-sm text-destructive">{pinError}</p>}
              <Button type="submit" className="w-full h-12 text-base" disabled={loading || pinLogin.length !== 4}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Se autentifică...</>
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

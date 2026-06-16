import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "casier" | "depozit";

interface EmployeeUser {
  id: string;
  email: string;
  employee_id: string;
  name: string;
  card_code: string;
}

interface AuthContextType {
  user: EmployeeUser | null;
  session: { user: EmployeeUser } | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
  signInWithCard: (cardCode: string, pinLogin?: string) => Promise<{ employee: { id: string; name: string; role: string } }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "cesars_employee_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { user: EmployeeUser; roles: AppRole[] };
        setUser(parsed.user);
        setRoles(parsed.roles || []);
      }
    } catch {
      // ignore corrupted storage
    }
    setLoading(false);
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setRoles([]);
  };

  const signInWithCard = async (cardCode: string, pinLogin?: string) => {
    if (!/^\d{4,10}$/.test(cardCode)) {
      throw new Error("Cod card invalid — trebuie între 4 și 10 cifre");
    }

    const { data: lookup, error: lookupErr } = await supabase.functions.invoke("employee-auth", {
      body: { action: "lookup_card", card_code: cardCode },
    });
    if (lookupErr) throw lookupErr;
    if (!lookup?.employee) throw new Error(lookup?.error || "Card angajat invalid sau inactiv");
    const employee = lookup.employee as { id: string; name: string; role: string; card_code: string; user_id: string | null };

    if (pinLogin) {
      const { data: verify, error: verifyErr } = await supabase.functions.invoke("employee-auth", {
        body: { action: "verify_pin", employee_id: employee.id, pin: pinLogin },
      });
      if (verifyErr) throw verifyErr;
      if (!verify?.valid) throw new Error("PIN incorect");
    }

    const empUser: EmployeeUser = {
      id: employee.user_id || employee.id,
      email: `emp_${cardCode}@cesars.internal`,
      employee_id: employee.id,
      name: employee.name,
      card_code: employee.card_code,
    };

    const appRole: AppRole = employee.role === "admin" ? "admin" : "casier";
    const nextRoles: AppRole[] = [appRole];

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: empUser, roles: nextRoles }));
    setUser(empUser);
    setRoles(nextRoles);

    return { employee: { id: employee.id, name: employee.name, role: employee.role } };
  };

  return (
    <AuthContext.Provider value={{ user, session: user ? { user } : null, roles, loading, hasRole, signOut, signInWithCard }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

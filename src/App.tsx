import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import POS from "@/pages/POS";
import Produse from "@/pages/Produse";
import Receptie from "@/pages/Receptie";
import ScoatereStoc from "@/pages/ScoatereStoc";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/pos" element={<POS />} />
              <Route path="/produse" element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Produse />
                </ProtectedRoute>
              } />
              <Route path="/receptie" element={
                <ProtectedRoute allowedRoles={["admin", "depozit"]}>
                  <Receptie />
                </ProtectedRoute>
              } />
              <Route path="/scoatere-stoc" element={<ScoatereStoc />} />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Admin />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="/" element={<Navigate to="/pos" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

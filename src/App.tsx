import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
      staleTime: 5 * 60 * 1000, // 5 min cache agresiv pentru POS
      gcTime: 30 * 60 * 1000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/pos" element={<POS />} />
            <Route path="/produse" element={<Produse />} />
            <Route path="/receptie" element={<Receptie />} />
            <Route path="/scoatere-stoc" element={<ScoatereStoc />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

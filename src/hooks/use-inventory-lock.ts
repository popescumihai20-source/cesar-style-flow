import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to check if there's an open inventory session for a given location.
 * Used to block POS sales and transfers while inventory is in progress.
 */
export function useInventoryLock(location: "magazin" | "depozit") {
  const { data: openSession, isLoading } = useQuery({
    queryKey: ["inventory-lock", location],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("id, location, status, start_time")
        .eq("location", location)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 1000, // check every 10s
    refetchInterval: 30 * 1000, // refetch every 30s
  });

  return {
    isLocked: !!openSession,
    openSession,
    isLoading,
  };
}

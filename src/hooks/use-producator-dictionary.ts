import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProducatorEntry {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export function useProducatorDictionary() {
  const query = useQuery({
    queryKey: ["producator-dictionary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producator_dictionary")
        .select("*")
        .order("code");
      if (error) throw error;
      return data as ProducatorEntry[];
    },
    staleTime: 10 * 60 * 1000,
  });

  return {
    producatorEntries: query.data || [],
    activeProducatori: (query.data || []).filter(a => a.active),
    isLoading: query.isLoading,
  };
}

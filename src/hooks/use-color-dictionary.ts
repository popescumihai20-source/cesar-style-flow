import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ColorEntry {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export function useColorDictionary() {
  const query = useQuery({
    queryKey: ["color-dictionary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("color_dictionary")
        .select("*")
        .order("code");
      if (error) throw error;
      return data as ColorEntry[];
    },
    staleTime: 10 * 60 * 1000,
  });

  return {
    colorEntries: query.data || [],
    activeColors: (query.data || []).filter(a => a.active),
    isLoading: query.isLoading,
  };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ArticolEntry {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export function useArticolDictionary() {
  const query = useQuery({
    queryKey: ["articol-dictionary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articol_dictionary")
        .select("*")
        .order("code");
      if (error) throw error;
      return data as ArticolEntry[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const getArticolName = (code: string | null | undefined): string => {
    if (!code) return "";
    const entry = query.data?.find(a => a.code === code && a.active);
    return entry?.name || "";
  };

  const getArticolLabel = (code: string | null | undefined): string => {
    if (!code) return "";
    const name = getArticolName(code);
    return name ? `${code} - ${name}` : code;
  };

  return {
    articolEntries: query.data || [],
    activeEntries: (query.data || []).filter(a => a.active),
    getArticolName,
    getArticolLabel,
    isLoading: query.isLoading,
  };
}

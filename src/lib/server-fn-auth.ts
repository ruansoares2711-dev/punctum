import { supabase } from "@/integrations/supabase/client";

/** Headers para server functions que usam requireSupabaseAuth. */
export async function serverFnAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Faça login para continuar");
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

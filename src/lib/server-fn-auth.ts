import { supabase } from "@/integrations/supabase/client";

export async function getServerFnAuthHeaders(): Promise<{ authorization: string }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (error || !accessToken) {
    throw new Error("Sessão não encontrada");
  }

  return { authorization: `Bearer ${accessToken}` };
}
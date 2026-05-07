import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns true when the current authenticated user has a row in `app_admins`.
 * Used to gate developer-only UI (e.g. /dev shortcut, rename any member).
 */
export function useAppAdmin(): { isAppAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAppAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsAppAdmin(!!data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { isAppAdmin, loading };
}

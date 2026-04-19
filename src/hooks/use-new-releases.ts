import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "rmm:lastSeenReleaseAt";

/**
 * Returns the count of release_notes published since the user's last visit
 * to /sobre-desenvolvimento (tracked via localStorage).
 */
export function useNewReleasesCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const lastSeen =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      let query = supabase
        .from("release_notes")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      if (lastSeen) query = query.gt("released_at", lastSeen);
      const { count: c } = await query;
      if (!active) return;
      setCount(c ?? 0);
    })();
    return () => {
      active = false;
    };
  }, []);

  return count;
}

export function markReleasesSeen() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

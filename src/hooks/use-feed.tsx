import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface FeedComment {
  id: string;
  content: string;
  user_id: string;
  group_id: string;
  round_id: string | null;
  match_id: string | null;
  parent_id: string | null;
  created_at: string;
  profile?: {
    name: string;
    nickname: string | null;
    avatar_url: string | null;
  };
  reactions: { emoji: string; count: number; reacted: boolean }[];
  replies?: FeedComment[];
}

export function useGroupFeed(groupId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    const { data: raw } = await supabase
      .from("comments")
      .select("*")
      .eq("group_id", groupId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!raw?.length) {
      setComments([]);
      setIsLoading(false);
      return;
    }

    const commentIds = raw.map((c) => c.id);

    // Fetch replies
    const { data: replies } = await supabase
      .from("comments")
      .select("*")
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });

    // Fetch all user profiles
    const allUserIds = [
      ...new Set([
        ...raw.map((c) => c.user_id),
        ...(replies || []).map((r) => r.user_id),
      ]),
    ];
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, name, nickname, avatar_url")
      .in("user_id", allUserIds);
    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, p])
    );

    // Fetch reactions for all comments (parents + replies)
    const allIds = [...commentIds, ...(replies || []).map((r) => r.id)];
    const { data: reactions } = await supabase
      .from("comment_reactions")
      .select("*")
      .in("comment_id", allIds);

    const buildReactions = (commentId: string) => {
      const grouped = (reactions || []).filter((r) => r.comment_id === commentId);
      const emojiMap = new Map<string, { count: number; reacted: boolean }>();
      grouped.forEach((r) => {
        const prev = emojiMap.get(r.emoji) || { count: 0, reacted: false };
        emojiMap.set(r.emoji, {
          count: prev.count + 1,
          reacted: prev.reacted || r.user_id === user?.id,
        });
      });
      return Array.from(emojiMap.entries()).map(([emoji, v]) => ({
        emoji,
        ...v,
      }));
    };

    const enrichComment = (c: any): FeedComment => ({
      ...c,
      profile: profileMap.get(c.user_id),
      reactions: buildReactions(c.id),
    });

    const replyMap = new Map<string, FeedComment[]>();
    (replies || []).forEach((r) => {
      const parentId = r.parent_id!;
      if (!replyMap.has(parentId)) replyMap.set(parentId, []);
      replyMap.get(parentId)!.push(enrichComment(r));
    });

    setComments(
      raw.map((c) => ({
        ...enrichComment(c),
        replies: replyMap.get(c.id) || [],
      }))
    );
    setIsLoading(false);
  }, [groupId, user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`feed-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `group_id=eq.${groupId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comment_reactions" },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, refresh]);

  return { comments, isLoading, refresh };
}

export async function postComment(data: {
  groupId: string;
  userId: string;
  content: string;
  roundId?: string;
  matchId?: string;
  parentId?: string;
}) {
  const { error } = await supabase.from("comments").insert({
    group_id: data.groupId,
    user_id: data.userId,
    content: data.content,
    round_id: data.roundId || null,
    match_id: data.matchId || null,
    parent_id: data.parentId || null,
  });
  if (error) throw error;
}

export async function toggleReaction(commentId: string, userId: string, emoji: string) {
  // Check if reaction exists
  const { data: existing } = await supabase
    .from("comment_reactions")
    .select("id")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("comment_reactions").delete().eq("id", existing.id);
  } else {
    await supabase.from("comment_reactions").insert({
      comment_id: commentId,
      user_id: userId,
      emoji,
    });
  }
}

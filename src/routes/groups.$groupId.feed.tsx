import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGroupFeed, postComment } from "@/hooks/use-feed";
import { useGroupDetail } from "@/hooks/use-groups";
import { FeedCommentCard } from "@/components/FeedCommentCard";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/groups/$groupId/feed")({
  component: GroupFeedPage,
});

function GroupFeedPage() {
  const { groupId } = Route.useParams();
  const { user } = useAuth();
  const { group } = useGroupDetail(groupId);
  const { comments, isLoading } = useGroupFeed(groupId);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  const handlePost = async () => {
    if (!user || !newComment.trim()) return;
    setSending(true);
    try {
      await postComment({
        groupId,
        userId: user.id,
        content: newComment.trim(),
      });
      setNewComment("");
    } catch {
      toast.error("Erro ao enviar comentário");
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-xl px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <Link
            to="/groups/$groupId"
            params={{ groupId }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">Feed</h1>
            <p className="text-xs text-muted-foreground">{group?.name || "Grupo"}</p>
          </div>
        </div>
      </header>

      {/* Comment input */}
      <div className="sticky top-[73px] z-10 border-b border-border bg-background/80 backdrop-blur-xl px-5 py-3">
        <div className="flex items-center gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="O que está acontecendo? 🏸"
            className="flex-1 rounded-2xl border border-border bg-card/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePost()}
            disabled={sending}
          />
          <button
            onClick={handlePost}
            disabled={sending || !newComment.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="px-5 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground">
              Nenhuma mensagem ainda
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Seja o primeiro a comentar!
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <FeedCommentCard key={comment.id} comment={comment} groupId={groupId} />
          ))
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { type FeedComment, toggleReaction, postComment } from "@/hooks/use-feed";
import { MessageCircle, Send, Smile } from "lucide-react";

const QUICK_EMOJIS = ["👍", "🔥", "😂", "👏", "💪", "🏆"];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function CommentBubble({
  comment,
  groupId,
  onReply,
  isReply = false,
}: {
  comment: FeedComment;
  groupId: string;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const { user } = useAuth();
  const [showEmojis, setShowEmojis] = useState(false);

  const handleReaction = async (emoji: string) => {
    if (!user) return;
    await toggleReaction(comment.id, user.id, emoji);
    setShowEmojis(false);
  };

  return (
    <div className={`${isReply ? "ml-10 mt-2" : ""}`}>
      <div className="flex gap-2.5">
        {comment.profile?.avatar_url ? (
          <img
            src={comment.profile.avatar_url}
            alt=""
            className={`rounded-full object-cover border border-border ${isReply ? "h-7 w-7" : "h-9 w-9"}`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-full bg-muted font-bold text-foreground ${
              isReply ? "h-7 w-7 text-[9px]" : "h-9 w-9 text-xs"
            }`}
          >
            {(comment.profile?.name || "?").charAt(0)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="rounded-2xl border border-border bg-card/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-foreground truncate">
                {comment.profile?.nickname || comment.profile?.name || "Jogador"}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {timeAgo(comment.created_at)}
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          </div>

          {/* Reactions */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {comment.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => handleReaction(r.emoji)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  r.reacted
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}

            <button
              onClick={() => setShowEmojis(!showEmojis)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>

            {!isReply && onReply && (
              <button
                onClick={onReply}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageCircle className="h-3 w-3" />
                Responder
              </button>
            )}
          </div>

          {/* Quick emoji picker */}
          {showEmojis && (
            <div className="flex gap-1 mt-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-card border border-border hover:bg-accent/30 text-base transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedCommentCard({
  comment,
  groupId,
}: {
  comment: FeedComment;
  groupId: string;
}) {
  const { user } = useAuth();
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendReply = async () => {
    if (!user || !replyText.trim()) return;
    setSending(true);
    try {
      await postComment({
        groupId,
        userId: user.id,
        content: replyText.trim(),
        parentId: comment.id,
      });
      setReplyText("");
      setShowReply(false);
    } catch {
      // handled by realtime
    }
    setSending(false);
  };

  return (
    <div className="mb-4">
      <CommentBubble
        comment={comment}
        groupId={groupId}
        onReply={() => setShowReply(!showReply)}
      />

      {/* Replies */}
      {(comment.replies || []).map((reply) => (
        <CommentBubble key={reply.id} comment={reply} groupId={groupId} isReply />
      ))}

      {/* Reply input */}
      {showReply && (
        <div className="ml-10 mt-2 flex items-center gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Escreva uma resposta..."
            className="flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
            disabled={sending}
          />
          <button
            onClick={handleSendReply}
            disabled={sending || !replyText.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

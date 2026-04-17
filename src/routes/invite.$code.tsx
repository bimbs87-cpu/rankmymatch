import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { TrophyLoadingBar } from "@/components/TrophyLoadingBar";
import { useUserProfile } from "@/hooks/use-user-profile";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useState, useEffect } from "react";
import { Users, CheckCircle, XCircle, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$code")({
  component: InvitePage,
});

interface InviteData {
  id: string;
  group_id: string;
  code: string;
  is_active: boolean;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  group: {
    name: string;
    description: string | null;
    sport: string;
    is_public: boolean;
    image_url: string | null;
    member_count: number;
    max_players: number;
  } | null;
}

function InviteAuthButtons({ inviteUrl }: { inviteUrl: string }) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: inviteUrl,
      });
      if (result.error) {
        toast.error("Erro ao fazer login. Tente novamente.");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      // Tokens received — verify session is persisted (iOS Safari workaround)
      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { confirmed = true; break; }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (confirmed) {
        window.location.replace(inviteUrl);
      } else {
        toast.error("Sessão não pôde ser estabelecida. Tente novamente.");
        setLoading(false);
      }
    } catch (err) {
      console.error("[invite] OAuth error:", err);
      toast.error("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <>
      <p className="text-center text-sm text-muted-foreground">
        Faça login para entrar no grupo
      </p>
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {loading ? "Entrando..." : "Entrar com Google"}
      </button>
    </>
  );
}

function InvitePage() {
  const { code } = Route.useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { displayName: profileDisplayName } = useUserProfile();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [joined, setJoined] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

  useEffect(() => {
    const loadInvite = async () => {
      setLoading(true);
      const { data: inviteData, error: inviteErr } = await supabase
        .from("invite_links")
        .select("id, group_id, code, is_active, max_uses, use_count, expires_at")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (inviteErr || !inviteData) {
        setError("Convite inválido ou expirado.");
        setLoading(false);
        return;
      }

      // Check expiration
      if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
        setError("Este convite expirou.");
        setLoading(false);
        return;
      }

      // Check max uses
      if (inviteData.max_uses && inviteData.max_uses > 0 && inviteData.use_count >= inviteData.max_uses) {
        setError("Este convite atingiu o limite de usos.");
        setLoading(false);
        return;
      }

      // Load group info
      const { data: groupData } = await supabase
        .from("groups")
        .select("name, description, sport, is_public, image_url, max_players")
        .eq("id", inviteData.group_id)
        .single();

      const { data: countData } = await supabase.rpc("get_group_member_count", {
        _group_id: inviteData.group_id,
      });
      const count = countData ?? 0;

      // Check if already member
      if (user) {
        const { data: membership } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", inviteData.group_id)
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (membership) setAlreadyMember(true);
      }

      setInvite({
        ...inviteData,
        group: groupData ? { ...groupData, member_count: count } : null,
      });
      setLoading(false);
    };

    loadInvite();
  }, [code, user]);

  const handleJoin = async () => {
    if (!user || !invite) return;
    setJoining(true);

    const userName = profileDisplayName || user.user_metadata?.full_name || user.user_metadata?.name || "Um jogador";
    const maxPlayers = invite.group?.max_players ?? 999;
    const currentCount = invite.group?.member_count ?? 0;
    const isFull = currentCount >= maxPlayers;

    try {
      if (isFull) {
        // Group is full — create a join request instead
        const { error: reqErr } = await supabase.from("group_join_requests").insert({
          group_id: invite.group_id,
          user_id: user.id,
          status: "pending",
          message: `Tentou entrar via convite, mas o grupo estava cheio (${currentCount}/${maxPlayers}).`,
        });

        if (reqErr) {
          if (reqErr.message?.includes("duplicate")) {
            toast.info("Você já tem uma solicitação pendente para este grupo.");
          } else {
            throw reqErr;
          }
          setJoining(false);
          return;
        }

        // Notify admins about waitlist entry
        const { data: admins } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", invite.group_id)
          .in("role", ["creator", "admin"])
          .eq("status", "active");

        if (admins?.length) {
          const notifications = admins
            .filter((a) => a.user_id !== user.id)
            .map((a) => ({
              user_id: a.user_id,
              group_id: invite.group_id,
              type: "join_request",
              title: "Solicitação de entrada (grupo cheio)",
              body: `${userName} tentou entrar via convite, mas o grupo está cheio. Aprove ou decline.`,
              data: { invite_code: invite.code },
            }));

          if (notifications.length) {
            await supabase.from("notifications").insert(notifications);
          }
        }

        setWaitlisted(true);
        toast.info("Solicitação enviada! O admin será notificado.");
        setJoining(false);
        return;
      }

      // Normal join — group has space
      const { error: joinErr } = await supabase.from("group_members").insert({
        group_id: invite.group_id,
        user_id: user.id,
        role: "member",
        status: "active",
      });

      if (joinErr) {
        if (joinErr.message?.includes("duplicate")) {
          toast.info("Você já é membro deste grupo!");
          setAlreadyMember(true);
        } else {
          throw joinErr;
        }
        setJoining(false);
        return;
      }

      // Increment use_count
      await supabase
        .from("invite_links")
        .update({ use_count: invite.use_count + 1 })
        .eq("id", invite.id);

      // Notify group admins
      const { data: admins } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", invite.group_id)
        .in("role", ["creator", "admin"])
        .eq("status", "active");

      if (admins?.length) {
        const notifications = admins
          .filter((a) => a.user_id !== user.id)
          .map((a) => ({
            user_id: a.user_id,
            group_id: invite.group_id,
            type: "member_joined",
            title: "Novo membro via convite",
            body: `${userName} entrou no grupo pelo link de convite.`,
            data: { invite_code: invite.code },
          }));

        if (notifications.length) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      setJoined(true);
      toast.success("Você entrou no grupo!");
    } catch (e: any) {
      toast.error("Erro ao entrar no grupo");
    }
    setJoining(false);
  };

  if (loading || authLoading) {
    return <TrophyLoadingBar />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="font-display text-lg font-bold text-foreground">Convite Inválido</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">{error}</p>
        <Link to="/groups" className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">
          Explorar grupos
        </Link>
      </div>
    );
  }

  if (waitlisted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
          <Users className="h-8 w-8 text-amber-500" />
        </div>
        <h1 className="font-display text-lg font-bold text-foreground">Grupo cheio</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          O grupo <strong>{invite?.group?.name}</strong> está com todas as vagas preenchidas.
          Sua solicitação foi enviada e o admin será notificado.
        </p>
        <Link
          to="/groups"
          className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Explorar grupos
        </Link>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <h1 className="font-display text-lg font-bold text-foreground">Você entrou!</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Bem-vindo ao grupo <strong>{invite?.group?.name}</strong>
        </p>
        <Link
          to="/groups/$groupId"
          params={{ groupId: invite!.group_id }}
          className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Ver grupo
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        {/* Group card */}
        <div className="overflow-hidden rounded-3xl border border-border bg-card text-center">
          {invite?.group?.image_url ? (
            <div className="relative h-32 w-full">
              <img
                src={invite.group.image_url}
                alt={invite.group.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center bg-primary/5">
              <Users className="h-10 w-10 text-primary/30" />
            </div>
          )}
          <div className="px-6 pb-6 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Você foi convidado para
            </p>
            <h1 className="mt-1 font-display text-xl font-bold text-foreground">
              {invite?.group?.name}
            </h1>
            {invite?.group?.description && (
              <p className="mt-2 text-sm text-muted-foreground">{invite.group.description}</p>
            )}
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-primary">
                🏸 {invite?.group?.sport}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <Users className="h-3 w-3" />
                {invite?.group?.member_count} membros
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {!isAuthenticated ? (
            <InviteAuthButtons inviteUrl={window.location.href} />
          ) : alreadyMember ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Você já é membro deste grupo!
              </p>
              <Link
                to="/groups/$groupId"
                params={{ groupId: invite!.group_id }}
                className="flex w-full items-center justify-center rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
              >
                Ver grupo
              </Link>
            </>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {joining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {joining ? "Entrando..." : "Entrar no grupo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";

const TITLE = "Excluir conta — Raqueteia";
const DESCRIPTION =
  "Como solicitar a exclusão da sua conta do Raqueteia, o que é apagado, o que é mantido e em quanto tempo.";

export const Route = createFileRoute("/excluir-conta")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://raqueteia.app/excluir-conta" }],
  }),
  component: DeleteAccountPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DeleteAccountPage() {
  const { user, isLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [open, setOpen] = useState(false);

  const signIn = async () => {
    setSigningIn(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/excluir-conta`,
      });
      if (result.error) {
        toast.error("Não foi possível entrar. Tente novamente.");
        setSigningIn(false);
      }
    } catch {
      toast.error("Não foi possível entrar. Tente novamente.");
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-background/80 px-5 py-4 backdrop-blur">
        <Link
          to="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="font-display text-lg font-bold text-foreground">Excluir conta do Raqueteia</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-5 py-6">
        <p className="text-sm text-muted-foreground">
          Esta página permite pedir a exclusão da sua conta do <strong className="text-foreground">Raqueteia</strong>{" "}
          (raqueteia.app) sem precisar do aplicativo instalado.
        </p>

        <Section title="1. Confirme que a conta é sua">
          <p>
            Por segurança, a exclusão só pode ser pedida por quem entrar na própria conta com o Google. Informar
            apenas um e-mail não é suficiente.
          </p>
          <div className="pt-2">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : user ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Conta confirmada.
                </p>
                <Button variant="destructive" onClick={() => setOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Pedir exclusão da conta
                </Button>
              </div>
            ) : (
              <Button onClick={signIn} disabled={signingIn}>
                {signingIn && <Loader2 className="h-4 w-4 animate-spin" />} Entrar com Google para continuar
              </Button>
            )}
          </div>
        </Section>

        <Section title="2. Prazo">
          <p>
            Depois do pedido, você tem 7 dias para desistir em Perfil → Excluir conta. Passado esse prazo, a exclusão é
            processada automaticamente na rotina diária. Se algo falhar, o pedido é tentado novamente e só é dado como
            concluído quando o login da conta deixa de existir.
          </p>
        </Section>

        <Section title="3. O que é apagado">
          <p>
            Login, nome, apelido, foto, data de nascimento, Instagram, preferências de jogo, notificações, aparelhos
            cadastrados para avisos, favoritos, contatos pessoais, partidas avulsas próprias, pedidos de entrada em
            grupos e registros de uso ligados à conta. O texto dos seus comentários é substituído por "comentário
            removido".
          </p>
        </Section>

        <Section title="4. O que é mantido">
          <p>
            Os resultados de partidas, sets, presenças, rankings e estatísticas dos grupos continuam existindo, porque
            fazem parte do histórico dos outros jogadores. Eles passam a aparecer como "Usuário removido", sem ligação
            com seu nome ou login.
          </p>
          <p>
            Também mantemos o registro do próprio pedido de exclusão e os registros de auditoria dos grupos, para
            comprovar o atendimento e a segurança do serviço.
          </p>
        </Section>

        <Section title="5. Ajuda">
          <p>
            Se não conseguir entrar na conta, escreva para{" "}
            <a href="mailto:contato@rankmymatch.app" className="text-primary underline">
              contato@rankmymatch.app
            </a>{" "}
            usando o mesmo e-mail da conta. Veja também a{" "}
            <Link to="/privacidade" className="text-primary underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </Section>
      </main>

      {user && <DeleteAccountDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}

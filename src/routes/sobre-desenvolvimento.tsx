import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bug,
  Heart,
  Hammer,
  Sparkles,
  Rocket,
  ShieldCheck,
  MessageCircle,
  Mail,
  Code2,
  Layers,
  Zap,
  Users,
  Trophy,
} from "lucide-react";

export const Route = createFileRoute("/sobre-desenvolvimento")({
  head: () => ({
    meta: [
      { title: "Aplicativo em desenvolvimento — RankMyMatch" },
      {
        name: "description",
        content:
          "RankMyMatch é um projeto vivo, em constante evolução. Saiba como você pode ajudar reportando bugs e sugestões.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AboutDevelopmentPage,
});

const SUPPORT_WHATSAPP = "https://wa.me/?text=" + encodeURIComponent(
  "Olá! Encontrei algo no RankMyMatch e gostaria de reportar:\n\n— O que aconteceu:\n— Onde estava (tela/grupo):\n— O que esperava:",
);
const SUPPORT_EMAIL = "mailto:contato@rankmymatch.app?subject=Bug%20no%20RankMyMatch&body=Ol%C3%A1%21%20Encontrei%20algo%20no%20RankMyMatch%3A%0A%0A-%20O%20que%20aconteceu%3A%0A-%20Onde%20estava%20%28tela%2Fgrupo%29%3A%0A-%20O%20que%20esperava%3A";

function AboutDevelopmentPage() {
  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-6 pb-4 lg:mx-auto lg:max-w-5xl lg:px-6">
        <Link
          to="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="flex-1 font-display text-lg font-bold text-foreground">
          Sobre o desenvolvimento
        </h1>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-5 px-5 lg:px-6">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 lg:p-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary lg:h-20 lg:w-20">
              <Hammer className="h-8 w-8 lg:h-10 lg:w-10" />
            </div>
            <div className="flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Em desenvolvimento ativo
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-foreground lg:text-4xl">
                Construindo o melhor app de ranking de padel do Brasil 🇧🇷
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground lg:text-base">
                Este projeto nasceu da paixão pelo esporte e pela tecnologia.
                Cada partida disputada, cada bug encontrado e cada sugestão
                enviada ajuda a moldar a próxima versão do RankMyMatch.
              </p>
            </div>
          </div>
        </section>

        {/* WHAT WE'RE BUILDING */}
        <section className="rounded-3xl border border-border bg-card p-5 lg:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> O que estamos construindo
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Trophy className="h-4 w-4" />}
              title="Ranking inteligente"
              text="Sistema Elo adaptado ao padel — leva em conta sets, games, força do oponente e parceria."
            />
            <FeatureCard
              icon={<Users className="h-4 w-4" />}
              title="Grupos vivos"
              text="Rodadas, presença, estatísticas, conquistas — tudo organizado em tempo real."
            />
            <FeatureCard
              icon={<Zap className="h-4 w-4" />}
              title="Tempo real"
              text="Atualizações instantâneas. Quem marca um ponto vê o ranking mexer no mesmo instante."
            />
            <FeatureCard
              icon={<Sparkles className="h-4 w-4" />}
              title="Cards compartilháveis"
              text="Imagens dinâmicas para WhatsApp, Instagram e Stories — direto do seu perfil."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Privacidade primeiro"
              text="Você controla o que é público. Estatísticas, grupos e histórico — tudo configurável."
            />
            <FeatureCard
              icon={<Rocket className="h-4 w-4" />}
              title="Sempre evoluindo"
              text="Novos recursos toda semana. Push notifications, PWA instalável, modo offline em breve."
            />
          </div>
        </section>

        {/* WHY IT MATTERS */}
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5 lg:p-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Heart className="h-3.5 w-3.5" /> Por que isso importa
          </h3>
          <p className="text-sm leading-relaxed text-foreground lg:text-base">
            Padel é o esporte que mais cresce no mundo, e a maioria dos grupos
            ainda usa planilhas, papel ou memória. O RankMyMatch transforma
            cada rodada em dados ricos e justos, mantendo a competitividade
            saudável e divertida — sem que ninguém precise virar estatístico
            nas horas vagas.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Hoje são <strong className="text-foreground">27+ tabelas</strong>{" "}
            no banco, dezenas de fluxos cuidadosamente desenhados, e milhares
            de linhas de código rodando sob o capô para que tudo pareça
            simples na tela. É um projeto extenso, e como qualquer projeto
            vivo, vai ter arestas a aparar.
          </p>
        </section>

        {/* BUGS */}
        <section className="rounded-3xl border border-border bg-card p-5 lg:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Bug className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-bold text-foreground">
                Encontrou um bug? Conta pra gente!
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Cada bug reportado é uma melhoria desbloqueada. Descreva o que
                aconteceu, em qual tela, e o que você esperava — quanto mais
                detalhe, mais rápido a correção entra.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={SUPPORT_WHATSAPP}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Reportar via WhatsApp
                </a>
                <a
                  href={SUPPORT_EMAIL}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Enviar e-mail
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* THANKS */}
        <section className="rounded-3xl border border-border bg-card p-5 text-center lg:p-8">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart className="h-6 w-6" />
          </div>
          <h3 className="mt-3 font-display text-xl font-bold text-foreground lg:text-2xl">
            Obrigado pela paciência ❤️
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground lg:text-base">
            Você está usando uma versão que melhora a cada semana. Ao jogar,
            reportar e sugerir, você ajuda a construir uma ferramenta que
            milhares de jogadores vão usar nos próximos anos. Isso é grande,
            e é graças a você.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            — Feito com café, raquetadas e linhas de código.
          </p>
        </section>

        {/* FOOTER LINK */}
        <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-muted-foreground">
          <Code2 className="h-3 w-3" />
          <span>RankMyMatch · v0.{new Date().getFullYear() % 100}.{new Date().getMonth() + 1}</span>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="mt-2.5 text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

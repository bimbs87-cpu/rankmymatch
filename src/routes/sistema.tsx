import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Crown,
  Sparkles,
  Check,
  Zap,
  Shield,
  TrendingUp,
  Users,
  Trophy,
  MessageCircle,
  Star,
  Infinity as InfinityIcon,
  Headphones,
  ChevronRight,
  Quote,
  CalendarCheck,
  BarChart3,
  Rocket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import mockupImacHome from "@/assets/mockup-imac-home.png";
import mockupPhoneHome from "@/assets/mockup-phone-home.png";
import mockupPhoneRanking from "@/assets/mockup-phone-ranking.png";

export const Route = createFileRoute("/sistema")({
  head: () => ({
    meta: [
      { title: "RankMyMatch — Premium para grupos de padel sérios" },
      {
        name: "description",
        content:
          "Crie grupos ilimitados, rodadas sem limite, ranking Elo profissional e suporte direto. R$ 29,90/mês. Ou pague R$ 9,90 por grupo avulso.",
      },
      { property: "og:title", content: "RankMyMatch Premium — O sistema de ranking que seu grupo merece" },
      {
        property: "og:description",
        content: "Pare de improvisar planilha no WhatsApp. Tenha ranking Elo, agenda automática e estatísticas de verdade.",
      },
    ],
  }),
  component: SistemaPage,
});

type PlanInterest = "premium" | "avulso" | "duvida";

function SistemaPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanInterest>("premium");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState<"whatsapp" | "email">("whatsapp");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openForm = (selected: PlanInterest) => {
    setPlan(selected);
    setOpen(true);
    setTimeout(() => {
      document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      toast.error("Preencha seu nome e contato.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("sales_leads").insert({
      name: name.trim(),
      contact: contact.trim(),
      contact_type: contactType,
      plan_interest: plan,
      message: message.trim() || null,
      source: "sistema_page",
      user_id: user?.id ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não conseguimos enviar. Tente novamente em instantes.");
      return;
    }
    toast.success("Recebemos! Vamos te chamar em até 1 dia útil. 🚀");
    setName("");
    setContact("");
    setMessage("");
    setOpen(false);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-24 lg:pb-12">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent" />
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_10%,oklch(0.85_0.18_135/0.25),transparent_40%),radial-gradient(circle_at_80%_30%,oklch(0.85_0.18_135/0.15),transparent_45%)]" />

        <div className="relative mx-auto max-w-7xl px-5 pt-8 pb-10 lg:px-8 lg:pt-14 lg:pb-14">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Pitch */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                RankMyMatch Premium
              </div>
              <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight text-foreground lg:text-6xl">
                Pare de anotar resultado{" "}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  na planilha do grupo
                </span>{" "}
                do WhatsApp.
              </h1>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground lg:text-lg">
                O <strong className="text-foreground">RankMyMatch</strong> transforma a sua roda de padel em
                uma liga profissional: ranking Elo de verdade, agenda automática, sorteio de duplas,
                histórico completo e estatísticas que mostram quem realmente joga.
              </p>

              {/* Trust strip */}
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
                    ))}
                  </div>
                  <span className="font-semibold text-foreground">4,9/5</span>
                  <span>nas avaliações</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>+1.200 jogadores ativos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-primary" />
                  <span>+15.000 partidas registradas</span>
                </div>
              </div>

              {/* CTAs */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => openForm("premium")}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground shadow-[0_10px_40px_-10px_oklch(0.85_0.18_135/0.6)] transition-all hover:scale-[1.02]"
                >
                  <Crown className="h-4 w-4" />
                  Quero o Premium por R$ 29,90/mês
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => openForm("avulso")}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  Grupo avulso por R$ 9,90
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                ⚡ Sem cartão agora · Garantia de 7 dias · Cancele quando quiser
              </p>
            </div>

            {/* Mockup hero: somente iMac */}
            <div className="relative">
              <img
                src={mockupImacHome}
                alt="RankMyMatch projetado em um iMac com ranking, evolução do Elo e rodadas"
                className="block w-full"
                loading="eager"
              />
            </div>

          </div>
        </div>
      </section>

      {/* PAIN → SOLUTION */}
      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-black tracking-tight text-foreground lg:text-4xl">
            Você já viveu isso?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Todo grupo sério chega no mesmo ponto. A planilha não escala.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              before: "“Quem foi mesmo o vencedor da Rodada 4?”",
              after: "Resultado registrado, ranking atualizado em tempo real.",
            },
            {
              before: "Discussão sem fim sobre quem é o melhor do grupo.",
              after: "Ranking Elo profissional adaptado para padel — sem subjetividade.",
            },
            {
              before: "Lista de presença confusa, sempre falta gente na rodada.",
              after: "Agenda automática, confirmações com 1 toque, fila de espera inteligente.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-3xl border border-border bg-card p-6"
            >
              <p className="text-sm italic text-muted-foreground line-through decoration-destructive/40 decoration-2">
                {item.before}
              </p>
              <div className="my-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                <Zap className="h-3.5 w-3.5" />
                Com RankMyMatch
              </div>
              <p className="text-sm font-medium text-foreground">{item.after}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Tecnologia profissional
            </div>
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-foreground lg:text-4xl">
              O mesmo motor de ranking dos pros, na mão do seu grupo.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sistema Elo adaptado para padel: leva em conta diferença de set, dupla, formato (singles ou
              doubles), constância e até confiabilidade do jogador. Cada partida importa.
            </p>

            <ul className="mt-6 space-y-3">
              {[
                { icon: Trophy, text: "Ranking Elo por temporada com pódio e história completa" },
                { icon: TrendingUp, text: "Gráfico de evolução do Elo, picos, melhores duplas" },
                { icon: CalendarCheck, text: "Rodadas agendadas com confirmação automática e fila" },
                { icon: Users, text: "Sorteio inteligente de duplas equilibradas pelo ranking" },
                { icon: Shield, text: "Histórico imutável: nada se perde, tudo se prova" },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm text-foreground">{f.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[280px] lg:max-w-[340px]">
            <img
              src={mockupPhoneRanking}
              alt="Tela de ranking do RankMyMatch com pódio e classificação geral"
              className="block w-full"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* MOBILE SHOWCASE */}
      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 mx-auto w-full max-w-[280px] lg:order-1 lg:max-w-[340px]">
            <img
              src={mockupPhoneHome}
              alt="Tela inicial do RankMyMatch no celular com Elo e estatísticas"
              className="block w-full"
              loading="lazy"
            />
          </div>
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Cabe no bolso
            </div>
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-foreground lg:text-4xl">
              No celular, <span className="text-primary">tudo na palma da mão</span>.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Confirme presença, registre placar, acompanhe seu Elo e converse com o grupo — direto do
              app, em segundos. Pensado mobile-first para a beira da quadra.
            </p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="planos" className="relative mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Rocket className="h-3.5 w-3.5" />
            Escolha seu plano
          </div>
          <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-foreground lg:text-5xl">
            Dois caminhos. <span className="text-primary">Zero amarras.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pague pelo grupo ou liberte tudo. Sem fidelidade, cancele em 1 clique.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Grupo Avulso */}
          <div className="relative flex flex-col rounded-3xl border border-border bg-card p-7 lg:p-9">
            <h3 className="font-display text-xl font-bold text-foreground">Grupo Avulso</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ideal pra quem quer testar com uma temporada curta.
            </p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tight text-foreground">R$ 9,90</span>
              <span className="text-sm text-muted-foreground">/ grupo</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pagamento único · Até 20 rodadas</p>

            <ul className="mt-6 space-y-3 text-sm text-foreground">
              {[
                "1 grupo com até 20 rodadas",
                "Ranking Elo completo do grupo",
                "Agenda e confirmação de presença",
                "Histórico e estatísticas",
                "Suporte por email",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => openForm("avulso")}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-3.5 text-sm font-bold text-foreground transition-colors hover:bg-accent"
            >
              Comprar grupo avulso
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Premium */}
          <div className="relative flex flex-col overflow-hidden rounded-3xl border-2 border-primary bg-gradient-to-br from-primary/10 via-card to-card p-7 shadow-[0_30px_80px_-30px_oklch(0.85_0.18_135/0.5)] lg:p-9">
            <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary-foreground">
              <Crown className="h-3 w-3" />
              Mais escolhido
            </div>

            <h3 className="font-display text-xl font-bold text-foreground">Premium</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pra quem leva o ranking do grupo a sério.
            </p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-5xl font-black tracking-tight text-foreground">R$ 29,90</span>
              <span className="text-sm text-muted-foreground">/ mês</span>
            </div>
            <p className="mt-1 text-xs text-primary font-semibold">
              Equivale a 1 cerveja por mês. E rende muito mais.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-foreground">
              {[
                { icon: InfinityIcon, text: "Grupos ilimitados com rodadas ilimitadas" },
                { icon: Trophy, text: "Temporadas ilimitadas + ranking histórico permanente" },
                { icon: TrendingUp, text: "Estatísticas avançadas, melhores duplas, rivais" },
                { icon: Users, text: "Convide quantos jogadores quiser" },
                { icon: Headphones, text: "Suporte direto por WhatsApp em até 2h úteis" },
                { icon: Sparkles, text: "Acesso antecipado a todos os novos recursos" },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <li key={t.text} className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{t.text}</span>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => openForm("premium")}
              className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-black text-primary-foreground shadow-[0_10px_40px_-10px_oklch(0.85_0.18_135/0.6)] transition-all hover:scale-[1.02]"
            >
              <Crown className="h-4 w-4" />
              Garantir minha vaga Premium
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              7 dias de garantia. Não curtiu? Devolvemos 100%.
            </p>
          </div>
        </div>
      </section>

      {/* LEAD FORM */}
      {open && (
        <section id="lead-form" className="mx-auto max-w-2xl px-5 lg:px-8">
          <div className="rounded-3xl border-2 border-primary bg-card p-6 shadow-[0_30px_80px_-30px_oklch(0.85_0.18_135/0.4)] lg:p-8">
            <h3 className="font-display text-2xl font-black text-foreground">
              Falta pouco. Vamos conversar.
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Deixe seu contato e a gente te chama em até 1 dia útil para liberar o acesso.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Plano de interesse
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "premium", label: "Premium" },
                    { id: "avulso", label: "Avulso" },
                    { id: "duvida", label: "Tenho dúvida" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPlan(opt.id as PlanInterest)}
                      className={`rounded-2xl border py-3 text-xs font-bold transition-colors ${
                        plan === opt.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Seu nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Como prefere ser chamado
                  </label>
                  <div className="flex gap-1 rounded-full border border-border bg-background p-0.5">
                    {(["whatsapp", "email"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setContactType(t)}
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          contactType === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type={contactType === "email" ? "email" : "tel"}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={contactType === "whatsapp" ? "(11) 99999-9999" : "voce@email.com"}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mensagem (opcional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Conte um pouco sobre seu grupo..."
                  className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-black text-primary-foreground transition-all hover:scale-[1.01] disabled:opacity-50"
              >
                {submitting ? "Enviando..." : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Quero garantir minha vaga
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                🔒 Seus dados ficam seguros. Sem spam, sem repasse.
              </p>
            </form>
          </div>
        </section>
      )}

      {/* SOCIAL PROOF */}
      <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-black tracking-tight text-foreground lg:text-4xl">
            Quem já joga não larga mais.
          </h2>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              quote:
                "Acabou a discussão sobre quem é o melhor. Agora é olhar o ranking. Mudou o nível do nosso grupo.",
              name: "Carlos H.",
              role: "Imbecis do Pádel · 26 temporadas",
            },
            {
              quote:
                "A agenda automática salvou a vida. Antes era um caos no Zap, hoje todo mundo confirma em 2 toques.",
              name: "Diego M.",
              role: "JV X BMB · admin",
            },
            {
              quote:
                "O gráfico de evolução do Elo virou vício. Todo mundo quer subir. Os jogos ficaram mais sérios.",
              name: "Joao P.",
              role: "Tansos · jogador Top 3",
            },
          ].map((t) => (
            <div key={t.name} className="rounded-3xl border border-border bg-card p-6">
              <Quote className="h-6 w-6 text-primary/60" />
              <p className="mt-3 text-sm leading-relaxed text-foreground">"{t.quote}"</p>
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
        <h2 className="text-center font-display text-3xl font-black tracking-tight text-foreground lg:text-4xl">
          Perguntas que todo mundo faz.
        </h2>
        <div className="mt-8 space-y-3">
          {[
            {
              q: "Posso cancelar quando quiser?",
              a: "Sim. Cancele com 1 clique direto pelo app. Você continua com acesso até o fim do ciclo pago.",
            },
            {
              q: "E se eu já tiver um grupo ativo no plano gratuito?",
              a: "Continua tudo igual. O Premium libera grupos e rodadas adicionais, sem mexer no que já está rodando.",
            },
            {
              q: "Qual a diferença entre Avulso e Premium?",
              a: "Avulso é pagamento único (R$ 9,90) por 1 grupo de até 20 rodadas. Premium (R$ 29,90/mês) libera grupos ilimitados, rodadas ilimitadas, suporte direto por WhatsApp e novidades em primeira mão.",
            },
            {
              q: "Funciona pra grupo de 1v1 (singles)?",
              a: "Sim. Suportamos doubles e singles, com regras de jogador ímpar e formatos personalizados.",
            },
            {
              q: "Vocês têm garantia?",
              a: "7 dias de garantia incondicional no Premium. Não curtiu? Devolvemos 100%, sem perguntas.",
            },
          ].map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-card/70"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-foreground">
                {item.q}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-12 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-8 text-center lg:p-14">
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_50%_0%,oklch(0.85_0.18_135/0.4),transparent_60%)]" />
          <div className="relative">
            <Crown className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-foreground lg:text-5xl">
              Seu grupo merece <span className="text-primary">jogar como pro</span>.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Comece hoje. Garantia de 7 dias. Sem cartão agora — você fala com a gente, libera o acesso e
              só paga depois.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => openForm("premium")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-sm font-black text-primary-foreground shadow-[0_15px_50px_-15px_oklch(0.85_0.18_135/0.7)] transition-all hover:scale-[1.03]"
              >
                <Crown className="h-4 w-4" />
                Quero o Premium agora
              </button>
              <Link
                to="/groups"
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Continuar no plano gratuito <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-primary" /> Garantia 7 dias</span>
              <span className="flex items-center gap-1"><Headphones className="h-3 w-3 text-primary" /> Suporte direto</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-primary" /> Sem fidelidade</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- MOCKUPS ----------------------------- */

function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2.4rem] border-[10px] border-foreground/15 bg-foreground/5 p-0 shadow-[0_30px_80px_-20px_oklch(0_0_0/0.65)] ${className}`}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-2xl bg-foreground/40" />
      <div className="overflow-hidden rounded-[1.8rem]">{children}</div>
    </div>
  );
}

function BrowserFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_100px_-30px_oklch(0_0_0/0.6)] ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-background/80 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <div className="ml-3 flex-1 truncate rounded-md bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          rankmymatch.app
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

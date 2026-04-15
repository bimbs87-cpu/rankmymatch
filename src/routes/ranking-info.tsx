import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Shield, Award } from "lucide-react";

export const Route = createFileRoute("/ranking-info")({
  component: RankingInfoPage,
});

function RankingInfoPage() {
  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="flex items-center gap-3 px-5 pt-6 pb-2">
        <Link to="/ranking" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="font-display text-lg font-bold text-foreground">Como funciona o Ranking</h1>
      </header>

      <div className="space-y-4 px-5 pt-4">
        {/* Resumo */}
        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="font-display text-base font-bold text-foreground">Sistema Elo Adaptado</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Nosso sistema de ranking é baseado no Elo, usado no xadrez e adaptado para padel.
            Ele calcula a habilidade relativa dos jogadores com base nos resultados das partidas.
          </p>
        </div>

        {/* Rules */}
        <div className="space-y-3">
          {[
            {
              icon: TrendingUp, color: "text-success", bg: "bg-success/10",
              title: "Vencer adversários fortes vale mais",
              desc: "Se você vence uma dupla com rating mais alto, ganha mais pontos.",
            },
            {
              icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10",
              title: "Perder para mais fracos pune mais",
              desc: "Perder para adversários com rating inferior resulta em perda maior.",
            },
            {
              icon: Target, color: "text-info", bg: "bg-info/10",
              title: "Placar importa",
              desc: "Vitórias elásticas (6-1, 6-2) rendem bônus. Derrotas apertadas minimizam a perda.",
            },
            {
              icon: Shield, color: "text-primary", bg: "bg-primary/10",
              title: "Proteção contra distorções",
              desc: "Limite máximo de ganho/perda por partida para evitar oscilações.",
            },
            {
              icon: Award, color: "text-rank-gold", bg: "bg-rank-gold/10",
              title: "Elegibilidade",
              desc: "Participe de pelo menos 30% das rodadas para aparecer no ranking oficial.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-3xl border border-border bg-card p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Formula */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 font-display text-sm font-bold text-foreground">Fórmula simplificada</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Cada jogador começa com <strong className="text-foreground">1000 pontos</strong></p>
            <p>• <strong className="text-foreground">Rating da dupla</strong> = média dos individuais</p>
            <p>• <strong className="text-foreground">K-factor</strong> = entre 24 e 32</p>
            <p>• <strong className="text-foreground">Multiplicador</strong> = bônus por margem com teto</p>
            <p>• <strong className="text-foreground">Limite</strong> = ganho/perda máxima controlada</p>
          </div>
        </div>

        {/* Tiebreak */}
        <div className="rounded-3xl border border-border bg-card p-5">
          <h3 className="mb-3 font-display text-sm font-bold text-foreground">Critérios de Desempate</h3>
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            {["Pontuação Elo", "Aproveitamento (%)", "Saldo de sets", "Saldo de games", "Confronto direto", "Playoff (manual)"].map((c, i) => (
              <li key={c} className="flex gap-2">
                <span className="font-bold text-primary">{i + 1}.</span> {c}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

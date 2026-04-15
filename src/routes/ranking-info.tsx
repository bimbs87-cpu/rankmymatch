import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Shield, Award } from "lucide-react";

export const Route = createFileRoute("/ranking-info")({
  component: RankingInfoPage,
});

function RankingInfoPage() {
  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/ranking" className="rounded-xl p-1 hover:bg-accent">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">Como funciona o Ranking</h1>
        </div>
      </header>

      <div className="space-y-5 px-4 pt-5">
        {/* Resumo */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <h2 className="text-base font-bold text-foreground">Sistema Elo Adaptado</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Nosso sistema de ranking é baseado no Elo, usado no xadrez e adaptado para padel. 
            Ele calcula a habilidade relativa dos jogadores com base nos resultados das partidas.
          </p>
        </div>

        {/* Regras principais */}
        <div className="space-y-3">
          {[
            {
              icon: TrendingUp,
              color: "text-success",
              bg: "bg-success/10",
              title: "Vencer adversários fortes vale mais",
              desc: "Se você vence uma dupla com rating mais alto que o seu, ganha mais pontos.",
            },
            {
              icon: TrendingDown,
              color: "text-destructive",
              bg: "bg-destructive/10",
              title: "Perder para mais fracos pune mais",
              desc: "Perder para adversários com rating inferior resulta em perda maior de pontos.",
            },
            {
              icon: Target,
              color: "text-info",
              bg: "bg-info/10",
              title: "Placar importa",
              desc: "Vitórias com placar elástico (ex: 6-1, 6-2) rendem bônus. Derrotas apertadas (6-4, 7-6) minimizam a perda.",
            },
            {
              icon: Shield,
              color: "text-sport",
              bg: "bg-sport/10",
              title: "Proteção contra distorções",
              desc: "Há um limite máximo de ganho/perda por partida para evitar oscilações exageradas.",
            },
            {
              icon: Award,
              color: "text-rank-gold",
              bg: "bg-rank-gold/10",
              title: "Elegibilidade",
              desc: "Para aparecer no ranking oficial, é preciso participar de pelo menos 30% das rodadas da temporada.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Fórmula */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-bold text-foreground">Fórmula simplificada</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Cada jogador começa com <strong className="text-foreground">1000 pontos</strong></p>
            <p>• <strong className="text-foreground">Rating da dupla</strong> = média dos ratings individuais</p>
            <p>• <strong className="text-foreground">Expectativa de vitória</strong> = baseada na diferença entre as duplas</p>
            <p>• <strong className="text-foreground">K-factor</strong> = entre 24 e 32 (moderado)</p>
            <p>• <strong className="text-foreground">Multiplicador de margem</strong> = bônus por placar com teto</p>
            <p>• <strong className="text-foreground">Limite por partida</strong> = ganho/perda máxima controlada</p>
          </div>
        </div>

        {/* Desempate */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-bold text-foreground">Critérios de Desempate</h3>
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2"><span className="font-bold text-foreground">1.</span> Pontuação Elo</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">2.</span> Aproveitamento (%)</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">3.</span> Saldo de sets</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">4.</span> Saldo de games</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">5.</span> Confronto direto</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">6.</span> Playoff (manual)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — RankMyMatch" },
      {
        name: "description",
        content:
          "Como o RankMyMatch coleta, usa e protege seus dados pessoais — em conformidade com a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — RankMyMatch" },
      {
        property: "og:description",
        content:
          "Como o RankMyMatch coleta, usa e protege seus dados pessoais — em conformidade com a LGPD.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rankmymatch.app/privacidade" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
        <h1 className="font-display text-lg font-bold text-foreground">
          Política de Privacidade
        </h1>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 text-sm leading-relaxed text-foreground">
        <p className="text-xs text-muted-foreground">
          Última atualização: 21 de abril de 2026
        </p>

        <section className="space-y-2">
          <p>
            O RankMyMatch ("nós", "nosso") respeita sua privacidade. Esta Política
            descreve como coletamos, usamos, armazenamos e protegemos suas
            informações ao usar o aplicativo, em conformidade com a Lei Geral de
            Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
        </section>

        <Section title="1. Dados que coletamos">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Conta:</strong> nome, e-mail e foto fornecidos pelo Google
              durante o login.
            </li>
            <li>
              <strong>Perfil:</strong> apelido, data de nascimento, mão dominante,
              posição preferida, golpe favorito, Instagram (opcionais, definidos
              por você).
            </li>
            <li>
              <strong>Atividade esportiva:</strong> grupos que você participa,
              presenças, partidas, placares, evolução de Elo.
            </li>
            <li>
              <strong>Dados técnicos:</strong> tipo de dispositivo, navegador,
              endpoint de notificação push, registros de erros e métricas
              anônimas de uso.
            </li>
          </ul>
        </Section>

        <Section title="2. Como usamos seus dados">
          <ul className="ml-5 list-disc space-y-1">
            <li>Permitir login e identificar você dentro do aplicativo.</li>
            <li>
              Calcular ranking, estatísticas, rivalidades e histórico das suas
              partidas.
            </li>
            <li>
              Enviar notificações relevantes sobre suas rodadas, presenças e
              ações administrativas dos seus grupos.
            </li>
            <li>Detectar erros e melhorar o desempenho do produto.</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </Section>

        <Section title="3. Compartilhamento">
          <p>
            Não vendemos seus dados. Compartilhamos informações apenas com
            provedores essenciais para a operação do serviço (hospedagem,
            autenticação, envio de notificações), sob contrato e respeitando os
            mesmos padrões de proteção descritos aqui.
          </p>
          <p>
            Outros membros dos seus grupos visualizam seu nome, avatar e
            estatísticas que você não marcou como privadas. Você controla a
            visibilidade na seção <strong>Perfil → Privacidade</strong>.
          </p>
        </Section>

        <Section title="4. Cookies e tecnologias semelhantes">
          <p>
            Usamos armazenamento local do navegador para manter sua sessão,
            preferências de tema e configurações do app. Usamos Google Analytics
            de forma agregada para entender padrões de uso.
          </p>
        </Section>

        <Section title="5. Seus direitos (LGPD)">
          <p>Você pode, a qualquer momento:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Acessar e corrigir seus dados na tela de perfil.</li>
            <li>
              Configurar a visibilidade pública/privada das suas estatísticas.
            </li>
            <li>
              <strong>Excluir sua conta</strong> diretamente pelo app, em
              <em> Perfil → Excluir conta</em>. Seus dados pessoais são
              removidos; o histórico esportivo é anonimizado para preservar a
              integridade dos rankings dos grupos onde você jogou.
            </li>
            <li>
              Solicitar portabilidade ou esclarecimentos enviando e-mail para
              <a
                href="mailto:contato@rankmymatch.app"
                className="ml-1 text-primary underline"
              >
                contato@rankmymatch.app
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="6. Retenção">
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa. Após a
            exclusão, dados pessoais são apagados em até 30 dias e o histórico
            esportivo permanece anonimizado.
          </p>
        </Section>

        <Section title="7. Segurança">
          <p>
            Aplicamos políticas de segurança em nível de linha (RLS), criptografia
            em trânsito (HTTPS) e controle de acesso por função. Nenhum sistema é
            100% imune; em caso de incidente, comunicaremos os afetados conforme
            exige a LGPD.
          </p>
        </Section>

        <Section title="8. Crianças">
          <p>
            O RankMyMatch é destinado a maiores de 13 anos. Menores devem usar o
            app sob supervisão e consentimento dos responsáveis.
          </p>
        </Section>

        <Section title="9. Alterações">
          <p>
            Podemos atualizar esta Política periodicamente. Mudanças relevantes
            serão comunicadas dentro do app.
          </p>
        </Section>

        <Section title="10. Contato">
          <p>
            Encarregado de dados (DPO):{" "}
            <a
              href="mailto:contato@rankmymatch.app"
              className="text-primary underline"
            >
              contato@rankmymatch.app
            </a>
          </p>
        </Section>

        <p className="pt-4 text-xs text-muted-foreground">
          Veja também os{" "}
          <Link to="/termos" className="text-primary underline">
            Termos de Uso
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}

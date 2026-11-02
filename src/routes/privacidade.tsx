import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  getConsentChoice,
  onConsentChange,
  setConsentChoice,
  type ConsentChoice,
} from "@/lib/privacy-consent";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Raqueteia" },
      {
        name: "description",
        content:
          "Como o Raqueteia coleta, usa e protege seus dados pessoais — em conformidade com a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — Raqueteia" },
      {
        property: "og:description",
        content:
          "Como o Raqueteia coleta, usa e protege seus dados pessoais — em conformidade com a LGPD.",
      },
    ],
    links: [{ rel: "canonical", href: "https://raqueteia.app/privacidade" }],
  }),
  component: PrivacyPage,
});

function TrackingPreferenceCard() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<ConsentChoice | null>(null);

  useEffect(() => {
    setChoice(getConsentChoice());
    return onConsentChange((c) => setChoice(c));
  }, []);

  const decide = (c: ConsentChoice) => setConsentChoice(c, user?.id ?? null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">
        Sua escolha atual:{" "}
        {choice === "granted" && <span className="text-primary">medição ativada</span>}
        {choice === "denied" && <span className="text-foreground">medição desativada</span>}
        {choice === null && <span className="text-muted-foreground">ainda não definida</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Você pode mudar quando quiser. A escolha vale imediatamente para este
        dispositivo e fica registrada na sua conta quando você está logado.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide("denied")}
          className={`flex-1 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
            choice === "denied"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:bg-accent"
          }`}
        >
          Desativar
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className={`flex-1 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
            choice === "granted"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:bg-accent"
          }`}
        >
          Ativar
        </button>
      </div>
    </div>
  );
}

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
          Última atualização: 2 de novembro de 2026
        </p>

        <section className="space-y-2">
          <p>
            O Raqueteia ("nós", "nosso") respeita sua privacidade. Esta Política
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
              <strong>Origem do cadastro:</strong> quando você chega por um link
              de divulgação ou convite, registramos a origem (parâmetros de
              campanha, código de convite e site de referência) para entender
              como o app é descoberto.
            </li>
            <li>
              <strong>Relatórios de erro:</strong> ao reportar um problema, você
              pode anexar uma captura de tela. Ela fica armazenada de forma
              privada, acessível apenas a você e à equipe de desenvolvimento.
            </li>
            <li>
              <strong>Dados técnicos:</strong> tipo de dispositivo, navegador,
              inscrição de notificação push e registros de uso necessários ao
              funcionamento do app.
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

        <Section title="4. Medição de uso e publicidade (opcional)">
          <p>
            Usamos armazenamento local do navegador para manter sua sessão e
            preferências do app — isso é essencial e sempre ativo. Também
            registramos métricas próprias de visitas às páginas, sem cookies de
            terceiros.
          </p>
          <p>
            <strong>Google Analytics e Google Ads</strong> são tecnologias
            opcionais: só são carregados se você aceitar no aviso exibido no
            primeiro acesso. Com eles, medimos páginas visitadas e eventos de
            uso (como cadastro e criação de grupo) para entender o produto e
            medir divulgação. Endereços de página são enviados sem parâmetros,
            e códigos de convite nunca são incluídos. A personalização de
            anúncios está desativada.
          </p>
          <p>
            Se você recusar, nenhum script do Google é carregado e o app
            funciona normalmente. Se você desativar depois de ter aceitado, a
            coleta para imediatamente (sem precisar recarregar a página) e os
            cookies do Google são removidos do navegador. Sua escolha pode ser
            alterada a qualquer momento:
          </p>
          <TrackingPreferenceCard />
        </Section>

        <Section title="5. Seus direitos (LGPD)">
          <p>Você pode, a qualquer momento:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Acessar e corrigir seus dados na tela de perfil.</li>
            <li>
              Configurar a visibilidade pública/privada das suas estatísticas.
            </li>
            <li>
              Ativar ou desativar a medição opcional (seção 4 acima ou em
              <em> Perfil → Privacidade</em>).
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
                href="mailto:bimbapps@gmail.com"
                className="ml-1 text-primary underline"
              >
                bimbapps@gmail.com
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
          <p>
            Registros operacionais de envio de notificações push e registros
            técnicos de diagnóstico são apagados automaticamente após
            <strong> 90 dias</strong>. Registros de exclusão de conta, auditoria
            de segurança e histórico de e-mails transacionais são mantidos pelo
            tempo necessário para comprovação legal e segurança do serviço.
          </p>
        </Section>

        <Section title="7. Segurança">
          <p>
            Aplicamos políticas de segurança em nível de linha (RLS), criptografia
            em trânsito (HTTPS) e controle de acesso por função. Arquivos
            enviados em relatórios de erro ficam em armazenamento privado.
            Nenhum sistema é 100% imune; em caso de incidente, comunicaremos os
            afetados conforme exige a LGPD.
          </p>
        </Section>

        <Section title="8. Crianças">
          <p>
            O Raqueteia é destinado a maiores de 13 anos. Menores devem usar o
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
              href="mailto:bimbapps@gmail.com"
              className="text-primary underline"
            >
              bimbapps@gmail.com
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

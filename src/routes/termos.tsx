import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — RankMyMatch" },
      {
        name: "description",
        content:
          "Termos e condições para utilização do RankMyMatch — ranking de padel, beach tennis e tênis.",
      },
      { property: "og:title", content: "Termos de Uso — RankMyMatch" },
      {
        property: "og:description",
        content:
          "Termos e condições para utilização do RankMyMatch — ranking de padel, beach tennis e tênis.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rankmymatch.app/termos" }],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          Termos de Uso
        </h1>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 text-sm leading-relaxed text-foreground">
        <p className="text-xs text-muted-foreground">
          Última atualização: 21 de abril de 2026
        </p>

        <p className="text-muted-foreground">
          Estes Termos regulam o uso do aplicativo RankMyMatch ("Serviço"). Ao
          criar uma conta ou usar o Serviço, você concorda integralmente com
          estes Termos. Se não concordar, não utilize o Serviço.
        </p>

        <Section title="1. O Serviço">
          <p>
            O RankMyMatch é uma plataforma para gerenciamento de grupos
            esportivos amadores (padel, beach tennis, tênis), permitindo
            registro de presenças, partidas, placares, ranking baseado em Elo,
            estatísticas e notificações.
          </p>
        </Section>

        <Section title="2. Cadastro e conta">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              O cadastro é feito via Google. Você é responsável pelas informações
              fornecidas e pela segurança da sua conta Google.
            </li>
            <li>Apenas maiores de 13 anos podem criar conta.</li>
            <li>
              Você pode excluir sua conta a qualquer momento em
              <em> Perfil → Excluir conta</em>.
            </li>
          </ul>
        </Section>

        <Section title="3. Uso aceitável">
          <p>É proibido usar o Serviço para:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Ofender, ameaçar ou expor outros usuários.</li>
            <li>Manipular placares, criar contas falsas ou fraudar rankings.</li>
            <li>
              Publicar conteúdo ilegal, ofensivo, discriminatório ou que viole
              direitos de terceiros.
            </li>
            <li>
              Tentar acessar áreas restritas, automatizar requisições em massa
              ou explorar vulnerabilidades.
            </li>
          </ul>
          <p>
            Podemos suspender ou encerrar contas que violem essas regras, sem
            aviso prévio em casos graves.
          </p>
        </Section>

        <Section title="4. Conteúdo gerado pelo usuário">
          <p>
            Você mantém os direitos sobre o conteúdo que envia (avatar, apelido,
            comentários). Ao publicar, concede ao RankMyMatch licença gratuita,
            não exclusiva e mundial para exibir esse conteúdo dentro do Serviço,
            inclusive em prévias compartilhadas (links com imagem do grupo, por
            exemplo).
          </p>
        </Section>

        <Section title="5. Administradores de grupo">
          <p>
            Criadores e administradores de grupos têm responsabilidade adicional
            pela moderação dos seus grupos: aprovar membros, gerenciar partidas e
            agir contra usuários que violem estes Termos dentro do grupo.
          </p>
        </Section>

        <Section title="6. Disponibilidade">
          <p>
            O Serviço é fornecido "como está". Buscamos disponibilidade contínua,
            mas não garantimos ausência de falhas, indisponibilidades temporárias
            ou perda de dados decorrentes de incidentes de força maior.
          </p>
        </Section>

        <Section title="7. Propriedade intelectual">
          <p>
            Marca, logotipo, design, código e funcionalidades do RankMyMatch são
            de propriedade dos seus criadores. É vedada qualquer reprodução,
            engenharia reversa ou redistribuição sem autorização expressa.
          </p>
        </Section>

        <Section title="8. Limitação de responsabilidade">
          <p>
            O RankMyMatch não se responsabiliza por danos indiretos, lucros
            cessantes ou consequências de uso inadequado do Serviço, incluindo
            disputas entre usuários ou organização de jogos presenciais.
          </p>
        </Section>

        <Section title="9. Alterações dos Termos">
          <p>
            Podemos atualizar estes Termos a qualquer momento. Mudanças
            relevantes serão comunicadas dentro do app. O uso continuado após a
            alteração equivale à concordância com a nova versão.
          </p>
        </Section>

        <Section title="10. Lei aplicável e foro">
          <p>
            Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro
            da comarca do usuário consumidor para dirimir quaisquer controvérsias.
          </p>
        </Section>

        <Section title="11. Contato">
          <p>
            <a
              href="mailto:contato@rankmymatch.app"
              className="text-primary underline"
            >
              contato@rankmymatch.app
            </a>
          </p>
        </Section>

        <p className="pt-4 text-xs text-muted-foreground">
          Veja também a{" "}
          <Link to="/privacidade" className="text-primary underline">
            Política de Privacidade
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

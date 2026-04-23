// Edge function that takes recent GitHub commits and asks Lovable AI to
// group them into 3-5 release-note entries written in clear PT-BR.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CommitInput = {
  sha: string;
  message: string;
  date?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { commits, latestVersion } = (await req.json()) as {
      commits: CommitInput[];
      latestVersion?: string | null;
    };

    if (!Array.isArray(commits) || commits.length === 0) {
      return new Response(
        JSON.stringify({ error: "commits array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Compact commit list for the prompt
    const commitList = commits
      .map((c, i) => `${i + 1}. [${c.sha}] ${c.message.split("\n")[0]}`)
      .join("\n");

    const systemPrompt = `Você é um redator de release notes para o RankMyMatch, um app de ranking de padel/tênis em PT-BR.

Recebe uma lista de commits do Git e deve produzir release notes ESPECÍFICAS e DETALHADAS, escritas para usuários finais (não devs).

OBJETIVO: cada commit que tenha conteúdo identificável vira UMA entrada própria. Só agrupe quando MÚLTIPLOS commits descrevem literalmente a mesma mudança (ex: "fix push" + "fix push retry" + "fix push log" = 1 entrada de push).

Regras de qualidade (CRÍTICAS):
- Prefira MAIS entradas específicas (8-15) a poucas entradas genéricas. O ideal é 1 entrada por mudança real.
- Title: curto, concreto, descreve EXATAMENTE o que mudou (ex: "Chip de próxima rodada clicável", "Popover de Grupos com fundo sólido"). Sem jargão técnico, sem prefixos tipo "feat:".
- Description: 1 frase explicando o impacto/benefício REAL pro usuário, mencionando a tela ou contexto quando aplicável (ex: "No menu Grupos do BottomNav, o chip agora vai direto pra rodada").
- Type: "feature" (algo novo visível), "improvement" (algo já existia e ficou melhor), "fix" (corrigiu bug).
- NUNCA escreva entradas vagas tipo "Ajustes de performance e estabilidade", "Melhorias gerais", "Ajustes internos". Se a mensagem do commit é muito vaga pra entender, IGNORE esse commit (não inclua) em vez de inventar uma entrada genérica.
- IGNORE commits puramente internos: merge, revert, chore, ci, refactor sem impacto visível, "Changes", "WIP", "Lovable auto-sync", bumps de dependência sem efeito.
- Use as palavras-chave da própria mensagem do commit pra inferir contexto (ex: "rivalry", "BottomNav", "changelog", "push") e cite-as no título/descrição.
- Cada entrada referencia os SHAs que a originaram (campo "commit_shas").

Exemplos de entradas BOAS (estilo desejado):
- {type:"improvement", title:"Chip de próxima rodada clicável", description:"No menu Grupos do BottomNav (1 grupo), o chip de próxima rodada agora vai direto pra rodada."}
- {type:"fix", title:"Popover de Grupos com fundo sólido", description:"Corrigido o popover do menu Grupos no desktop que estava sobrepondo a tela."}
- {type:"improvement", title:"Tooltip com tempo de confirmação", description:"O ícone de presença na próxima rodada agora mostra 'Confirmado por você há X'."}

Exemplo de entrada RUIM (NÃO faça):
- {type:"improvement", title:"Ajustes de performance e estabilidade", description:"Fizemos uma série de ajustes internos..."} ← genérico demais, proibido.`;

    const userPrompt = `Última versão publicada: ${latestVersion ?? "nenhuma"}

Commits recentes (mais novo primeiro):
${commitList}

Gere quantas entradas específicas forem necessárias (idealmente 1 por mudança real, sem agrupar coisas diferentes). Não force agrupamento — prefira mais entradas concretas a poucas genéricas.`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_release_entries",
                description: "Return grouped release-note entries.",
                parameters: {
                  type: "object",
                  properties: {
                    entries: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: {
                            type: "string",
                            enum: ["feature", "improvement", "fix"],
                          },
                          title: { type: "string" },
                          description: { type: "string" },
                          commit_shas: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                        required: ["type", "title", "description", "commit_shas"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["entries"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "emit_release_entries" },
          },
        }),
      },
    );

    if (!aiRes.ok) {
      const body = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições da IA atingido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("AI gateway error:", aiRes.status, body);
      return new Response(
        JSON.stringify({ error: `Erro da IA (${aiRes.status})` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "IA não retornou estrutura esperada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = JSON.parse(argsStr) as {
      entries: Array<{
        type: "feature" | "improvement" | "fix";
        title: string;
        description: string;
        commit_shas: string[];
      }>;
    };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-commits error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

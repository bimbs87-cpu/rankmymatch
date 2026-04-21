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

    const systemPrompt = `Você é um redator de release notes para o RankMyMatch, um app de ranking de padel em PT-BR.

Recebe uma lista de commits do Git (que muitas vezes têm mensagens vagas tipo "Changes" ou "Work in progress") e deve AGRUPAR commits relacionados em 3 a 5 entradas de release notes claras, escritas para usuários finais — não desenvolvedores.

Regras:
- Escreva em português do Brasil, tom amigável e direto.
- Cada entrada tem: type ("feature" | "improvement" | "fix"), title (curto, máx 70 chars, sem prefixos técnicos), description (1-2 frases explicando o benefício pro usuário).
- Agrupe commits sobre o mesmo tema (ex: 5 commits de ajuste em push notifications viram UMA entrada "Notificações push corrigidas").
- IGNORE commits sem informação útil (chore, merge, "Changes", "WIP") — não invente conteúdo.
- Se não conseguir entender o que foi feito, diga genericamente "Ajustes internos" ao invés de inventar.
- Cada entrada deve referenciar os SHAs dos commits que a originaram (campo "commit_shas" — array).`;

    const userPrompt = `Última versão publicada: ${latestVersion ?? "nenhuma"}

Commits recentes (mais novo primeiro):
${commitList}

Agrupe em 3-5 entradas de release notes.`;

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

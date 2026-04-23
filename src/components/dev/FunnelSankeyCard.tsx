import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitBranch, Loader2 } from "lucide-react";

// Lazy: nivo é pesado (~200KB)
const ResponsiveSankey = lazy(() =>
  import("@nivo/sankey").then((m) => ({ default: m.ResponsiveSankey }))
);

export type SankeyData = {
  nodes: { id: string }[];
  links: { source: string; target: string; value: number }[];
};

interface Props {
  utm?: SankeyData;
  referrer?: SankeyData;
}

function SankeyChart({ data }: { data: SankeyData }) {
  if (!data.nodes.length || !data.links.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sem dados suficientes para o Sankey neste período.
      </p>
    );
  }
  return (
    <div className="h-[420px] w-full">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ResponsiveSankey
          data={data}
          margin={{ top: 12, right: 160, bottom: 12, left: 160 }}
          align="justify"
          colors={{ scheme: "category10" }}
          nodeOpacity={1}
          nodeHoverOthersOpacity={0.35}
          nodeThickness={14}
          nodeSpacing={18}
          nodeBorderWidth={0}
          nodeBorderRadius={3}
          linkOpacity={0.45}
          linkHoverOthersOpacity={0.1}
          linkContract={2}
          enableLinkGradient
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={8}
          labelTextColor={{ from: "color", modifiers: [["darker", 2]] }}
          theme={{
            text: { fontSize: 11, fill: "hsl(var(--foreground))" },
            tooltip: {
              container: {
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
                fontSize: 12,
                borderRadius: 8,
                padding: "6px 10px",
              },
            },
          }}
        />
      </Suspense>
    </div>
  );
}

export function FunnelSankeyCard({ utm, referrer }: Props) {
  const [tab, setTab] = useState<"utm" | "referrer">("utm");
  if (!utm && !referrer) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Funil Sankey por origem (7d)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sessões → Signup → Grupo → Partida. Os nós "Drop" mostram as quedas em
          cada etapa.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "utm" | "referrer")}>
          <TabsList>
            <TabsTrigger value="utm">UTM source</TabsTrigger>
            <TabsTrigger value="referrer">Referrer</TabsTrigger>
          </TabsList>
          <TabsContent value="utm" className="mt-4">
            {utm ? (
              <SankeyChart data={utm} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            )}
          </TabsContent>
          <TabsContent value="referrer" className="mt-4">
            {referrer ? (
              <SankeyChart data={referrer} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

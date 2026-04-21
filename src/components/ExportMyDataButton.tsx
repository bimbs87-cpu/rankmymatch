import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { exportMyDataFn } from "@/lib/export-my-data.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

export function ExportMyDataButton() {
  const [busy, setBusy] = useState(false);
  const exportFn = useServerFn(exportMyDataFn);

  const handleExport = async () => {
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const data = await exportFn({ headers } as Parameters<typeof exportFn>[0]);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `rankmymatch-meus-dados-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Seus dados foram exportados");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao exportar dados");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <div className="flex-1">
        <div className="text-sm font-medium">Exportar meus dados</div>
        <div className="text-xs text-muted-foreground">
          Baixe um JSON com todos os seus dados (LGPD)
        </div>
      </div>
    </button>
  );
}

import { useState, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { Bug, Image as ImageIcon, Loader2, X, Check } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/app-version";

const bugSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Título precisa ter ao menos 3 caracteres")
    .max(200, "Título muito longo"),
  description: z
    .string()
    .trim()
    .min(10, "Descreva com ao menos 10 caracteres")
    .max(5000, "Descrição muito longa"),
});

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function BugReportForm() {
  const { user } = useAuth();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("Imagem muito grande (máx 5MB).");
      return;
    }
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearScreenshot() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScreenshot(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = bugSchema.safeParse({ title, description });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;

      if (screenshot) {
        const ext = screenshot.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${user?.id ?? "anon"}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("bug-screenshots")
          .upload(path, screenshot, {
            contentType: screenshot.type,
            upsert: false,
          });
        if (upErr) throw upErr;
        const { data } = supabase.storage
          .from("bug-screenshots")
          .getPublicUrl(path);
        screenshotUrl = data.publicUrl;
      }

      const userAgent =
        typeof navigator !== "undefined"
          ? `${navigator.userAgent} | ${APP_VERSION}`
          : APP_VERSION;

      const { error } = await supabase.from("bug_reports").insert({
        user_id: user?.id ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        route: location.pathname,
        user_agent: userAgent,
        screenshot_url: screenshotUrl,
      });
      if (error) throw error;

      setSubmitted(true);
      setTitle("");
      setDescription("");
      clearScreenshot();
      toast.success("Bug reportado! Obrigado pela ajuda 🙌");
    } catch (err) {
      console.error("Erro ao enviar bug report:", err);
      toast.error("Não foi possível enviar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="h-6 w-6" />
        </div>
        <h4 className="mt-3 font-display text-lg font-bold text-foreground">
          Recebido! ❤️
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu relato chegou pra nós. Vamos investigar e priorizar a correção.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent"
        >
          Reportar outro bug
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="bug-title"
          className="mb-1.5 block text-xs font-bold text-foreground"
        >
          Título <span className="text-destructive">*</span>
        </label>
        <input
          id="bug-title"
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Botão de salvar não funciona no perfil"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>

      <div>
        <label
          htmlFor="bug-desc"
          className="mb-1.5 block text-xs font-bold text-foreground"
        >
          O que aconteceu? <span className="text-destructive">*</span>
        </label>
        <textarea
          id="bug-desc"
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Descreva o que estava fazendo, o que esperava e o que aconteceu de errado..."
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
        <p className="mt-1 text-right text-[10px] text-muted-foreground">
          {description.length}/5000
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-foreground">
          Screenshot (opcional)
        </label>
        {previewUrl ? (
          <div className="relative inline-block">
            <img
              src={previewUrl}
              alt="Pré-visualização"
              className="h-32 w-auto rounded-xl border border-border object-cover"
            />
            <button
              type="button"
              onClick={clearScreenshot}
              className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md"
              aria-label="Remover screenshot"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-background/50 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <ImageIcon className="h-4 w-4" />
            Anexar imagem (máx 5MB)
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-muted-foreground">
          Vamos registrar a tela atual e seu navegador para ajudar no debug.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Bug className="h-3.5 w-3.5" />
              Enviar relato
            </>
          )}
        </button>
      </div>
    </form>
  );
}

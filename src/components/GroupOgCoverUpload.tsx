/**
 * Admin-only uploader for the **OG cover image** of a group.
 *
 * Distinct from `GroupImageUpload` (which sets the small avatar/logo). The OG
 * cover is rendered as a rich hero background in the dynamic Open Graph card
 * at `/api/og/group/$groupId`. Recommended size: 1200x630 landscape.
 *
 * On every change we:
 *   1. Persist the URL on `groups.og_cover_url`
 *   2. Invalidate the cached PNG so the next share preview is fresh
 */
import { useRef, useState } from "react";
import { Camera, Loader2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { invalidateGroupOgCache } from "@/lib/og-cache.functions";

interface Props {
  groupId: string;
  currentUrl: string | null;
  onChanged?: (url: string | null) => void;
}

export function GroupOgCoverUpload({ groupId, currentUrl, onChanged }: Props) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidateGroupCache = useServerFn(invalidateGroupOgCache);

  const persist = async (url: string | null) => {
    const { error } = await supabase
      .from("groups")
      .update({ og_cover_url: url } as never)
      .eq("id", groupId);
    if (error) throw error;
    invalidateGroupCache({ data: { groupId } }).catch(() => {});
    onChanged?.(url);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A capa deve ter no máximo 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${groupId}/og-cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("group-images")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("group-images").getPublicUrl(path);
      setPreview(urlData.publicUrl);
      await persist(urlData.publicUrl);
      toast.success("Capa OG atualizada — prévias serão regeneradas");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar a capa");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      setPreview(null);
      await persist(null);
      toast.success("Capa OG removida");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />
        Capa do card de compartilhamento (OG)
      </label>
      {preview ? (
        <div className="relative w-full overflow-hidden rounded-2xl border border-border">
          <img
            src={preview}
            alt="Capa OG do grupo"
            className="aspect-[1200/630] w-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm disabled:opacity-50"
            aria-label="Remover capa"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-xs font-medium">Adicionar capa OG (1200×630)</span>
            </>
          )}
        </button>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        Aparece como fundo do card que é mostrado no WhatsApp, Instagram e Twitter ao
        compartilhar o link do grupo. Use uma imagem horizontal nítida (PNG ou JPG ≤ 5MB).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

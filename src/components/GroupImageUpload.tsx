import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  groupId?: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
}

export function GroupImageUpload({ groupId, currentUrl, onUploaded, onRemoved }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 5MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const folder = groupId || "temp";
    const path = `${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("group-images")
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error("Erro ao fazer upload");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("group-images")
      .getPublicUrl(path);

    setPreview(urlData.publicUrl);
    onUploaded(urlData.publicUrl);
    setUploading(false);
  };

  const handleRemove = () => {
    setPreview(null);
    onRemoved?.();
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Imagem do grupo</label>
      {preview ? (
        <div className="relative w-full overflow-hidden rounded-2xl border border-border">
          <img src={preview} alt="Grupo" className="h-32 w-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-xs font-medium">Adicionar foto</span>
            </>
          )}
        </button>
      )}
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

import { toast } from "sonner";
import noPhotoAvatar from "@/assets/avatars/no-photo.png";

/** Open the platform's image share sheet (WhatsApp is offered when installed). */
export async function shareImage(node: HTMLElement, filename: string, title: string, options?: { width?: number; height?: number; outputWidth?: number; outputHeight?: number }) {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  let blob = await toBlob(node, {
    cacheBust: false,
    imagePlaceholder: new URL(noPhotoAvatar, window.location.href).href,
    pixelRatio: 1,
    width: options?.width ?? node.offsetWidth,
    height: options?.height ?? node.offsetHeight,
    backgroundColor: getComputedStyle(node).backgroundColor,
    filter: (element) => !(element instanceof HTMLElement && element.hasAttribute("data-share-exclude")),
  });
  if (!blob) throw new Error("Não foi possível criar a imagem");
  if (options?.outputWidth && options.outputHeight) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = options.outputWidth;
    canvas.height = options.outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível criar a imagem");
    context.fillStyle = getComputedStyle(node).backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    context.drawImage(bitmap, (canvas.width - bitmap.width * scale) / 2, 0, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    const resized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!resized) throw new Error("Não foi possível redimensionar a imagem");
    blob = resized;
  }
  const file = new File([blob], `${filename}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      throw error;
    }
  } else {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.info("Imagem baixada. Abra o arquivo para compartilhar pelo WhatsApp.");
  }
}
import { toast } from "sonner";
import noPhotoAvatar from "@/assets/avatars/no-photo.png";

/** Open the platform's image share sheet (WhatsApp is offered when installed). */
export async function shareImage(node: HTMLElement, filename: string, title: string, options?: { width?: number; height?: number; outputWidth?: number; outputHeight?: number }) {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  const backgroundProbe = document.createElement("span");
  backgroundProbe.style.backgroundColor = "var(--background)";
  node.append(backgroundProbe);
  const background = getComputedStyle(backgroundProbe).backgroundColor;
  backgroundProbe.remove();
  const renderOptions = {
    cacheBust: false,
    imagePlaceholder: new URL(noPhotoAvatar, window.location.href).href,
    pixelRatio: 1,
    width: options?.width ?? node.offsetWidth,
    height: options?.height ?? node.offsetHeight,
    backgroundColor: background,
    filter: (element) => !(element instanceof HTMLElement && element.hasAttribute("data-share-exclude")),
  };
  let blob: Blob | null;
  try {
    blob = await toBlob(node, renderOptions);
  } catch {
    // A remote profile photo can expire or reject cross-origin capture.
    // Preserve the image instead of failing the whole share.
    const fallback = node.cloneNode(true) as HTMLElement;
    fallback.style.cssText += ";position:fixed;left:0;top:0;z-index:-2;pointer-events:none";
    fallback.querySelectorAll("img").forEach((image) => {
      if (new URL(image.src, window.location.href).origin !== window.location.origin) image.src = noPhotoAvatar;
    });
    document.body.append(fallback);
    try {
      blob = await toBlob(fallback, renderOptions);
    } finally {
      fallback.remove();
    }
  }
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
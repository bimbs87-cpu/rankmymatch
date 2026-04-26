/**
 * <link> tags for the root route: favicons, manifest, and the full set
 * of iOS apple-touch-startup-image (splash screen) variants.
 */

const SPLASHES: { file: string; w: number; h: number; ratio: number }[] = [
  { file: "apple-splash-640-1136.png",   w: 320,  h: 568,  ratio: 2 },
  { file: "apple-splash-750-1334.png",   w: 375,  h: 667,  ratio: 2 },
  { file: "apple-splash-828-1792.png",   w: 414,  h: 896,  ratio: 2 },
  { file: "apple-splash-1125-2436.png",  w: 375,  h: 812,  ratio: 3 },
  { file: "apple-splash-1170-2532.png",  w: 390,  h: 844,  ratio: 3 },
  { file: "apple-splash-1179-2556.png",  w: 393,  h: 852,  ratio: 3 },
  { file: "apple-splash-1242-2208.png",  w: 414,  h: 736,  ratio: 3 },
  { file: "apple-splash-1242-2688.png",  w: 414,  h: 896,  ratio: 3 },
  { file: "apple-splash-1284-2778.png",  w: 428,  h: 926,  ratio: 3 },
  { file: "apple-splash-1290-2796.png",  w: 430,  h: 932,  ratio: 3 },
  { file: "apple-splash-1536-2048.png",  w: 768,  h: 1024, ratio: 2 },
  { file: "apple-splash-1620-2160.png",  w: 810,  h: 1080, ratio: 2 },
  { file: "apple-splash-1668-2224.png",  w: 834,  h: 1112, ratio: 2 },
  { file: "apple-splash-1668-2388.png",  w: 834,  h: 1194, ratio: 2 },
  { file: "apple-splash-2048-2732.png",  w: 1024, h: 1366, ratio: 2 },
];

const splashLinks = SPLASHES.map((s) => ({
  rel: "apple-touch-startup-image",
  href: `/splash/${s.file}`,
  media: `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`,
}));

export const ROOT_LINKS = [
  { rel: "canonical", href: "https://rankmymatch.app/" },
  { rel: "manifest", href: "/manifest.json?v=android-assets-v3" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
  { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
  { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
  { rel: "shortcut icon", href: "/favicon.ico" },
  ...splashLinks,
];

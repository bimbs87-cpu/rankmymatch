import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { UserProfileProvider } from "@/hooks/use-user-profile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopNav } from "@/components/DesktopNav";
import { InstallFlowProvider } from "@/components/InstallFlowProvider";
import { AvatarPromptGate } from "@/components/AvatarPromptGate";
import { PlayerProfileViewerProvider } from "@/components/PlayerProfileViewer";
import { Toaster } from "@/components/ui/sonner";
import "../styles.css";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { name: "description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { property: "og:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@rankmymatch" },
      { name: "twitter:creator", content: "@rankmymatch" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "RankMyMatch" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "twitter:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { name: "twitter:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { name: "twitter:image:alt", content: "RankMyMatch — Rankings entre amigos" },
      { property: "og:image", content: "https://rankmymatch.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "RankMyMatch — Rankings entre amigos" },
      { property: "og:site_name", content: "RankMyMatch" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: "https://rankmymatch.app" },
      { name: "twitter:image", content: "https://rankmymatch.app/og-image.png" },
    ],
    scripts: [
      {
        async: true,
        src: "https://www.googletagmanager.com/gtag/js?id=AW-18099845561",
      },
      {
        children: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'AW-18099845561');`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "RankMyMatch",
              url: "https://rankmymatch.app",
              applicationCategory: "SportsApplication",
              operatingSystem: "Web, iOS, Android",
              description:
                "Rankings, temporadas e estatísticas de Padel, Beach Tênis, Tênis, Squash e Pickleball entre amigos e clubes.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
              image: "https://rankmymatch.app/og-image.png",
            },
            {
              "@type": "Organization",
              name: "RankMyMatch",
              url: "https://rankmymatch.app",
              logo: "https://rankmymatch.app/icon-512.png",
              sameAs: ["https://rankmymatch.app"],
            },
            {
              "@type": "WebSite",
              name: "RankMyMatch",
              url: "https://rankmymatch.app",
              inLanguage: "pt-BR",
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "canonical", href: "https://rankmymatch.app/" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-640-1136.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-750-1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-828-1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1125-2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1170-2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1179-2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1242-2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1242-2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1284-2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1290-2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1536-2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1620-2160.png", media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1668-2224.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-1668-2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash/apple-splash-2048-2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('rmm-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ua=navigator.userAgent;var isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(isIos&&'serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});if(typeof caches!=='undefined'){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}}}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const host = window.location.hostname;
    const isPreview =
      host.includes("id-preview--") ||
      host.includes("lovableproject.com") ||
      host.includes("lovable.dev");

    // iOS Safari has well-known bugs where service workers intercept and
    // break OAuth callbacks (Supabase sessions silently fail to persist
    // after an OAuth redirect). Detect iOS and ALWAYS unregister any SW
    // there, regardless of environment.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const shouldRegister = !isInIframe && !isPreview && !isIos && "serviceWorker" in navigator;

    if (shouldRegister) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {});
    } else if ("serviceWorker" in navigator) {
      // iOS / preview / iframe: aggressively unregister any SW + clear caches
      // so an old worker can't break OAuth or keep the app stuck loading.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      }).catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
    }
  }, []);


  return (
    <AuthProvider>
      <UserProfileProvider>
        <PlayerProfileViewerProvider>
          <InstallFlowProvider>
            {/* === Premium global background === */}
            <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />

            {/* Mobile/tablet auras (intense) */}
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 z-0 lg:hidden"
              style={{
                backgroundImage: `
                  radial-gradient(80vw 55vh at 50% -10%, color-mix(in oklab, var(--primary) 28%, transparent), transparent 70%),
                  radial-gradient(70vw 50vh at 110% 35%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 75%),
                  radial-gradient(90vw 60vh at -10% 70%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 75%),
                  radial-gradient(70vw 50vh at 50% 110%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%),
                  linear-gradient(180deg, color-mix(in oklab, var(--background) 90%, var(--primary)) 0%, var(--background) 40%, var(--background) 65%, color-mix(in oklab, var(--background) 90%, var(--primary)) 100%)
                `,
              }}
            />

            {/* Desktop: subtle solid tint, no grid/auras to avoid hard edges */}
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 z-0 hidden lg:block"
              style={{
                background: "color-mix(in oklab, var(--background) 96%, var(--primary))",
              }}
            />

            {/* Shared noise texture (very subtle on desktop) */}
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 z-0 opacity-[0.10] mix-blend-overlay lg:hidden"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.75  0 0 0 0 1  0 0 0 0 0.55  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                backgroundSize: "260px 260px",
              }}
            />
            <div className="relative z-10 mx-auto max-w-lg lg:max-w-7xl lg:px-8 min-h-screen">
              <AuthDesktopNav />
              <Outlet />
            </div>
            <AuthNav />
            <Toaster richColors position="top-center" />
          </InstallFlowProvider>
        </PlayerProfileViewerProvider>
      </UserProfileProvider>
    </AuthProvider>
  );
}

function AuthDesktopNav() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <DesktopNav />;
}

function AuthNav() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return (
    <>
      <BottomNav />
      <AvatarPromptGate />
    </>
  );
}

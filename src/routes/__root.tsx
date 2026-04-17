import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { UserProfileProvider } from "@/hooks/use-user-profile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopNav } from "@/components/DesktopNav";
import { InstallFlowProvider } from "@/components/InstallFlowProvider";
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
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "twitter:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { name: "twitter:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:image", content: "https://rankmymatch.lovable.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "RankMyMatch" },
      { property: "og:url", content: "https://rankmymatch.lovable.app" },
      { name: "twitter:image", content: "https://rankmymatch.lovable.app/og-image.png" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png" },
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
        <InstallFlowProvider>
          <div className="mx-auto max-w-lg lg:max-w-7xl lg:px-8 min-h-screen">
            <AuthDesktopNav />
            <Outlet />
          </div>
          <AuthNav />
          <Toaster richColors position="top-center" />
        </InstallFlowProvider>
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
    </>
  );
}

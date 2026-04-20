import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { trackPageview } from "@/lib/analytics";
import { UserProfileProvider } from "@/hooks/use-user-profile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopNav } from "@/components/DesktopNav";
import { InstallFlowProvider } from "@/components/InstallFlowProvider";
import { AvatarPromptGate } from "@/components/AvatarPromptGate";
import { PlayerProfileViewerProvider } from "@/components/PlayerProfileViewer";
import { Toaster } from "@/components/ui/sonner";
import { ROOT_META, ROOT_JSONLD } from "@/lib/seo-meta";
import { ROOT_LINKS } from "@/lib/pwa-links";
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
    meta: ROOT_META,
    scripts: [
      {
        async: true,
        src: "https://www.googletagmanager.com/gtag/js?id=G-HDEGEPMC1K",
      },
      {
        children: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-HDEGEPMC1K');gtag('config', 'AW-18099845561');`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(ROOT_JSONLD),
      },
    ],
    links: ROOT_LINKS,
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
  const router = useRouter();

  useEffect(() => {
    // Track initial pageview + every SPA navigation for GA4
    trackPageview(window.location.pathname + window.location.search);
    const unsub = router.subscribe("onResolved", () => {
      trackPageview(window.location.pathname + window.location.search);
    });
    return () => {
      unsub();
    };
  }, [router]);

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

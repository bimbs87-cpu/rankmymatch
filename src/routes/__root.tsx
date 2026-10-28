import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter, useLocation, useRouterState } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/lib/theme";
import loggedInBgDesktopDark from "@/assets/loggedin-bg-desktop-dark.webp";
import { trackPageview } from "@/lib/analytics";
import { captureAcquisitionOnce } from "@/lib/acquisition-tracking";
import { trackPageVisit } from "@/lib/visit-tracking";
import { UserProfileProvider } from "@/hooks/use-user-profile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopNav } from "@/components/DesktopNav";
import { InstallFlowProvider } from "@/components/InstallFlowProvider";
import { AvatarPromptGate } from "@/components/AvatarPromptGate";
import { PlayerProfileViewerProvider } from "@/components/PlayerProfileViewer";
import { PendingDeletionBanner } from "@/components/PendingDeletionBanner";
import { Toaster } from "@/components/ui/sonner";
import { ROOT_META, ROOT_JSONLD } from "@/lib/seo-meta";
import { ROOT_LINKS } from "@/lib/pwa-links";
import "../styles.css";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

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
            __html: `(function(){try{var c=document.documentElement.classList;c.add('dark');c.remove('light');localStorage.setItem('rmm-theme','dark');}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ua=navigator.userAgent;var isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(isIos&&'serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});if(typeof caches!=='undefined'){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;if(standalone){document.documentElement.setAttribute('data-pwa-launch','true');}}catch(e){}})();`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `#pwa-launch{display:none;position:fixed;inset:0;z-index:2147483647;background:var(--launch-background);align-items:center;justify-content:center;flex-direction:column;gap:28px;overflow:hidden}html[data-pwa-launch="true"],html[data-pwa-launch="true"] body{background:var(--launch-background)}html[data-pwa-launch="true"] #pwa-launch{display:flex}#pwa-launch img{display:block;width:112px;height:112px;object-fit:contain}#pwa-launch-track{width:144px;height:3px;background:var(--launch-track);overflow:hidden;border-radius:2px}#pwa-launch-track::after{content:"";display:block;width:40%;height:100%;background:var(--launch-progress);animation:pwa-launch-loading 1.2s ease-in-out infinite}@keyframes pwa-launch-loading{from{transform:translateX(-100%)}to{transform:translateX(350%)}}@media(prefers-reduced-motion:reduce){#pwa-launch-track::after{animation:none;width:100%}}`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <div id="pwa-launch" role="status" aria-label="Carregando Raqueteia">
          <img src="/android-icon-512-v7.png" alt="" width="112" height="112" fetchPriority="high" />
          <div id="pwa-launch-track" role="progressbar" aria-label="Carregando" />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(document.documentElement.getAttribute('data-pwa-launch')==='true'){setTimeout(function(){document.documentElement.removeAttribute('data-pwa-launch');},15000);}})();`,
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();

  useEffect(() => {
    // Capture UTM/invite/referrer on first visit (persisted in localStorage)
    captureAcquisitionOnce();
    // Track initial pageview + every SPA navigation for GA4 + page_visits table
    const initialPath = window.location.pathname + window.location.search;
    trackPageview(initialPath);
    void trackPageVisit(window.location.pathname);
    const unsub = router.subscribe("onResolved", () => {
      const p = window.location.pathname + window.location.search;
      trackPageview(p);
      void trackPageVisit(window.location.pathname);
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PwaLaunchReady />
        <UserProfileProvider>
          <PlayerProfileViewerProvider>
            <InstallFlowProvider>
              {/* Global background layers — adapt based on auth + theme */}
              <GlobalBackground />
              <div className="relative z-10 mx-auto max-w-lg lg:max-w-7xl lg:px-8 min-h-screen">
                <PendingDeletionBanner />
                <AuthDesktopNav />
                <Outlet />
              </div>
              <AuthNav />
              <Toaster richColors position="top-center" />
            </InstallFlowProvider>
          </PlayerProfileViewerProvider>
        </UserProfileProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PwaLaunchReady() {
  const { isLoading } = useAuth();
  const isRouterLoading = useRouterState({ select: (state) => state.isLoading });

  useEffect(() => {
    if (isLoading || isRouterLoading || document.documentElement.getAttribute("data-pwa-launch") !== "true") return;
    // Let the ready screen paint before removing the launch overlay. No artificial delay.
    const frame = requestAnimationFrame(() => {
      document.documentElement.removeAttribute("data-pwa-launch");
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, isRouterLoading]);

  return null;
}

function AuthDesktopNav() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <DesktopNav />;
}

function GlobalBackground() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  useTheme();
  const [imageLoaded, setImageLoaded] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    const image = new Image();
    image.onerror = () => setImageLoaded(false);
    image.src = loggedInBgDesktopDark;
  }, [isDesktop]);
  const showImage = isAuthenticated && !isLoading && pathname !== "/landing" && isDesktop && imageLoaded;
  useEffect(() => {
    if (showImage) document.body.setAttribute("data-bg-image", "dark");
    else document.body.removeAttribute("data-bg-image");
    return () => document.body.removeAttribute("data-bg-image");
  }, [showImage]);
  return <>
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />
    {showImage && <img aria-hidden src={loggedInBgDesktopDark} alt="" className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover" />}
  </>;
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

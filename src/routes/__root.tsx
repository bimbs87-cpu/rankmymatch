import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter, useLocation } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/lib/theme";
import loggedInBgDesktopDark from "@/assets/loggedin-bg-desktop-dark.webp";
import loggedInBgDesktopLight from "@/assets/loggedin-bg-desktop-light.webp";
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
            __html: `(function(){try{var t=localStorage.getItem('rmm-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ua=navigator.userAgent;var isIos=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(isIos&&'serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});if(typeof caches!=='undefined'){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var isAndroid=/Android/i.test(navigator.userAgent);var standalone=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;if(isAndroid&&standalone){document.documentElement.setAttribute('data-android-pwa-launch','true');}}catch(e){}})();`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `#android-launch-splash{display:none;position:fixed;inset:0;z-index:2147483647;background:#050707;align-items:center;justify-content:center;overflow:hidden}html[data-android-pwa-launch="true"] body{background:#050707}html[data-android-pwa-launch="true"] #android-launch-splash{display:flex}#android-launch-splash img{display:block;width:100vw;height:100svh;max-width:100vw;max-height:100svh;object-fit:contain;object-position:center center}`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <div id="android-launch-splash" aria-hidden="true">
          <img src="/android-splash-championship-v2.png" alt="" />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(document.documentElement.getAttribute('data-android-pwa-launch')==='true'){var done=function(){setTimeout(function(){document.documentElement.setAttribute('data-android-pwa-launch','done');},900);};if(document.readyState==='complete'){done();}else{window.addEventListener('load',done,{once:true});}setTimeout(function(){document.documentElement.setAttribute('data-android-pwa-launch','done');},2800);}}catch(e){}})();`,
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

function AuthDesktopNav() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <DesktopNav />;
}

function GlobalBackground() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { resolved } = useTheme();
  const path = location.pathname;
  // Background is eternal once logged in — present on every authenticated route,
  // including the homepage. Only the public /landing marketing page opts out.
  const isExcluded = path === "/landing";
  const [darkLoaded, setDarkLoaded] = useState(true);
  const [lightLoaded, setLightLoaded] = useState(true);
  // Track desktop viewport — image backgrounds are desktop-only (lg ≥ 1024px).
  // Mobile keeps a solid premium background (auras + tint) for performance and a sharper feel.
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    const preload = (src: string, onFail: () => void) => {
      const img = new Image();
      img.onerror = onFail;
      img.src = src;
      try { (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "high"; } catch { /* noop */ }
    };
    preload(loggedInBgDesktopDark, () => setDarkLoaded(false));
    preload(loggedInBgDesktopLight, () => setLightLoaded(false));
  }, [isDesktop]);

  const isDark = resolved === "dark";
  // The persistent image background applies to every authenticated page (except /landing),
  // on desktop only, on every route — for BOTH light and dark themes.
  const showImage = isAuthenticated && !isLoading && !isExcluded && isDesktop;
  const showDarkImage = showImage && isDark && darkLoaded;
  const showLightImage = showImage && !isDark && lightLoaded;

  // When either themed image is showing we let it be the entire background — no solid tint, no auras.
  const useImageBackground = showDarkImage || showLightImage;

  // Mark body so global CSS can make wrappers transparent when the image background is active.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (showDarkImage) {
      document.body.setAttribute("data-bg-image", "dark");
    } else if (showLightImage) {
      document.body.setAttribute("data-bg-image", "light");
    } else {
      document.body.removeAttribute("data-bg-image");
    }
    return () => {
      document.body.removeAttribute("data-bg-image");
    };
  }, [showDarkImage, showLightImage]);

  return (
    <>
      {/* Solid background fallback (hidden when an image background takes over) */}
      {!useImageBackground && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />
      )}

      {/* Mobile/tablet auras — kept on logged-out pages only */}
      {!useImageBackground && (
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
      )}

      {/* Desktop subtle tint — also hidden when an image background is active */}
      {!useImageBackground && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 hidden lg:block"
          style={{
            background: "color-mix(in oklab, var(--background) 96%, var(--primary))",
          }}
        />
      )}

      {/* Themed gradient fallback under the image (in case it fails to load) */}
      {showImage && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: isDark
              ? "radial-gradient(70vw 60vh at 15% 30%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%), linear-gradient(135deg, color-mix(in oklab, var(--background) 92%, var(--primary)) 0%, var(--background) 60%)"
              : "radial-gradient(70vw 60vh at 15% 30%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%), linear-gradient(135deg, #fafafa 0%, #ffffff 60%)",
          }}
        />
      )}

      {/* Dark image — full-bleed, all viewports, persistent for the entire authenticated session */}
      {showImage && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-150"
          style={{ backgroundImage: `url(${loggedInBgDesktopDark})`, opacity: showDarkImage ? 1 : 0 }}
        />
      )}

      {/* Light image — full-bleed, all viewports, persistent for the entire authenticated session */}
      {showImage && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-150"
          style={{ backgroundImage: `url(${loggedInBgDesktopLight})`, opacity: showLightImage ? 1 : 0 }}
        />
      )}

      {/* Subtle noise on mobile when no image dominates */}
      {!useImageBackground && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.10] mix-blend-overlay lg:hidden"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.75  0 0 0 0 1  0 0 0 0 0.55  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            backgroundSize: "260px 260px",
          }}
        />
      )}
    </>
  );
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

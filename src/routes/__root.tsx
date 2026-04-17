import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { UserProfileProvider } from "@/hooks/use-user-profile";
import { BottomNav } from "@/components/BottomNav";
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" },
      { title: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { name: "description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { property: "og:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "twitter:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
      { name: "twitter:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b4210149-0ef2-4a4d-b3ca-f80098abdcf5" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b4210149-0ef2-4a4d-b3ca-f80098abdcf5" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
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
    // Register service worker for PWA install support (production only)
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const isPreview = window.location.hostname.includes("id-preview--");

    if (!isInIframe && !isPreview && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          // Force-check for updates on every page load so users stuck on an
          // old SW (which was breaking OAuth on Chrome/iOS) get the fix
          // without needing a manual cache clear.
          reg.update().catch(() => {});
        })
        .catch(() => {});

      // When the new SW takes control, reload once so the fresh (non-
      // intercepting) worker handles all subsequent requests.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } else if (isInIframe || isPreview) {
      navigator.serviceWorker?.getRegistrations().then((regs) =>
        regs.forEach((r) => r.unregister())
      );
    }
  }, []);


  return (
    <AuthProvider>
      <UserProfileProvider>
        <InstallFlowProvider>
          <div className="mx-auto max-w-lg min-h-screen">
            <Outlet />
          </div>
          <AuthNav />
          <Toaster richColors position="top-center" />
        </InstallFlowProvider>
      </UserProfileProvider>
    </AuthProvider>
  );
}

function AuthNav() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <BottomNav />;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="rounded-xl p-1 hover:bg-accent">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </Link>
            <h1 className="text-lg font-bold text-foreground">Notificações</h1>
          </div>
          <button className="rounded-xl p-2 hover:bg-accent">
            <CheckCheck className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="px-4 pt-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-base font-semibold text-foreground">
            Tudo em dia!
          </h3>
          <p className="text-sm text-muted-foreground">
            Você receberá notificações sobre rodadas, resultados e ranking aqui.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

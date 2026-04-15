import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <h1 className="font-display text-lg font-bold text-foreground">Notificações</h1>
        </div>
        <button className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-accent">
          <CheckCheck className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>

      <div className="px-5 pt-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/20" />
          <h3 className="font-display text-base font-bold text-foreground">Tudo em dia!</h3>
          <p className="text-sm text-muted-foreground">
            Você receberá notificações sobre rodadas, resultados e ranking aqui.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

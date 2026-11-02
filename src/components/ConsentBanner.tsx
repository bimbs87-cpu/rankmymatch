import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getConsentChoice,
  onConsentChange,
  setConsentChoice,
  type ConsentChoice,
} from "@/lib/privacy-consent";

/**
 * Banner de consentimento para medição opcional (Google Analytics / Ads).
 * Aparece uma única vez até o usuário escolher; a escolha pode ser alterada
 * depois em /privacidade. Aceitar e recusar têm o mesmo peso visual.
 */
export function ConsentBanner() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<ConsentChoice | null>(() => getConsentChoice());

  useEffect(() => onConsentChange((c) => setChoice(c)), []);

  if (choice !== null) return null;

  const decide = (c: ConsentChoice) => {
    setConsentChoice(c, user?.id ?? null);
    setChoice(c);
  };

  return (
    <div
      role="dialog"
      aria-label="Preferências de medição"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4"
    >
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold text-foreground">
              Medição de uso opcional
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Usamos Google Analytics e Google Ads para entender o uso do app e
              medir divulgação. Isso é opcional: o Raqueteia funciona igual se
              você recusar. Detalhes na{" "}
              <Link to="/privacidade" className="text-primary underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-accent"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

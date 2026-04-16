interface LoadingBarProps {
  progress?: number;
  label?: string;
  fullScreen?: boolean;
}

export function LoadingBar({ progress = 50, label = "Carregando...", fullScreen = true }: LoadingBarProps) {
  const content = (
    <>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <div className="w-full max-w-xs">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{label}</p>
      </div>
    </>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8">
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-8">
      {content}
    </div>
  );
}

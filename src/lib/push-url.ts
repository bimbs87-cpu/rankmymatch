// Validação de destino de notificações push: apenas caminhos internos do app.
// Impede que uma notificação abra um site externo arbitrário.

/** Retorna o caminho interno sanitizado, ou null se for externo/inseguro. */
export function sanitizePushUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = String(url).trim().slice(0, 500);
  // Deve começar com "/" e não pode ser "//" (URL relativa a host externo).
  if (!/^\/(?!\/)/.test(trimmed)) return undefined;
  return trimmed;
}

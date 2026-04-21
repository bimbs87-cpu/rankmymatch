// Shared brand styles for RankMyMatch transactional/auth emails.
// Carbon Fiber Precision palette adapted for white-bg email rendering.

export const brand = {
  rally: '#a3e635', // rally neon green
  rallyDark: '#84cc16',
  carbon: '#0f1419', // dark carbon (headers, footer)
  carbonSoft: '#1f2937',
  text: '#1a1a1a',
  textMuted: '#55575d',
  textFaint: '#9ca3af',
  border: '#e5e7eb',
  bg: '#ffffff',
  bgSoft: '#f9fafb',
} as const;

export const styles = {
  main: {
    backgroundColor: brand.bg,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    margin: 0,
    padding: 0,
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '0',
  },
  header: {
    backgroundColor: brand.carbon,
    padding: '28px 32px',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
  },
  brandText: {
    color: brand.rally,
    fontSize: '20px',
    fontWeight: 700 as const,
    letterSpacing: '-0.02em',
    margin: 0,
    fontFamily:
      '"Space Grotesk", Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  brandSub: {
    color: '#9ca3af',
    fontSize: '12px',
    margin: '4px 0 0',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
  body: {
    backgroundColor: brand.bg,
    padding: '32px',
    border: `1px solid ${brand.border}`,
    borderTop: 'none',
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: 700 as const,
    color: brand.text,
    margin: '0 0 16px',
    letterSpacing: '-0.01em',
  },
  text: {
    fontSize: '15px',
    color: brand.textMuted,
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  button: {
    backgroundColor: brand.rally,
    color: brand.carbon,
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '999px',
    padding: '14px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  buttonWrap: { margin: '8px 0 24px' },
  link: { color: brand.rallyDark, textDecoration: 'underline' },
  code: {
    fontFamily: '"Space Grotesk", "Courier New", monospace',
    fontSize: '32px',
    fontWeight: 700 as const,
    color: brand.text,
    backgroundColor: brand.bgSoft,
    border: `1px solid ${brand.border}`,
    borderRadius: '8px',
    padding: '16px 24px',
    textAlign: 'center' as const,
    letterSpacing: '0.2em',
    margin: '0 0 24px',
    display: 'block',
  },
  footer: {
    fontSize: '12px',
    color: brand.textFaint,
    margin: '24px 0 0',
    lineHeight: '1.5',
  },
  warning: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#92400e',
    lineHeight: '1.5',
    margin: '0 0 20px',
  },
} as const;

export const SITE_NAME = 'RankMyMatch';
export const SITE_URL = 'https://rankmymatch.app';
export const SITE_TAGLINE = 'Sua liga, seu ranking';

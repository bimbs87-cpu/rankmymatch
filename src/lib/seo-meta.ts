/**
 * Default SEO meta tags applied at the root route.
 * Per-route overrides (title/description/og:*) live in each route's `head()`.
 */
export const ROOT_META = [
  { charSet: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  { title: "Raqueteia — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { name: "description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { property: "og:title", content: "Raqueteia — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { property: "og:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:site", content: "@raqueteia" },
  { name: "twitter:creator", content: "@raqueteia" },
  { name: "theme-color", content: "#0a0a0a" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-title", content: "Raqueteia" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  { name: "twitter:title", content: "Raqueteia — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { name: "twitter:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { name: "twitter:image:alt", content: "Raqueteia — Rankings entre amigos" },
  { property: "og:image", content: "https://raqueteia.app/og-image.png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: "Raqueteia — Rankings entre amigos" },
  { property: "og:site_name", content: "Raqueteia" },
  { property: "og:locale", content: "pt_BR" },
  { property: "og:url", content: "https://raqueteia.app" },
  { name: "twitter:image", content: "https://raqueteia.app/og-image.png" },
];

export const ROOT_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Raqueteia",
      url: "https://raqueteia.app",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Rankings, temporadas e estatísticas de Padel, Beach Tênis, Tênis, Squash e Pickleball entre amigos e clubes.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
      image: "https://raqueteia.app/og-image.png",
    },
    {
      "@type": "Organization",
      name: "Raqueteia",
      url: "https://raqueteia.app",
      logo: "https://raqueteia.app/icon-512.png",
      sameAs: ["https://raqueteia.app"],
    },
    {
      "@type": "WebSite",
      name: "Raqueteia",
      url: "https://raqueteia.app",
      inLanguage: "pt-BR",
    },
  ],
};

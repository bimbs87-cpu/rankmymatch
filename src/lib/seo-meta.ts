/**
 * Default SEO meta tags applied at the root route.
 * Per-route overrides (title/description/og:*) live in each route's `head()`.
 */
export const ROOT_META = [
  { charSet: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  { title: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { name: "description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { property: "og:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { property: "og:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:site", content: "@rankmymatch" },
  { name: "twitter:creator", content: "@rankmymatch" },
  { name: "theme-color", content: "#0a0a0a" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-title", content: "RankMyMatch" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  { name: "twitter:title", content: "RankMyMatch — Rankings de Padel, Beach Tênis, Tênis e mais.." },
  { name: "twitter:description", content: "O app definitivo para feirinos com rankings, temporadas de padel entre amigos e clubes." },
  { name: "twitter:image:alt", content: "RankMyMatch — Rankings entre amigos" },
  { property: "og:image", content: "https://rankmymatch.app/og-image.png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: "RankMyMatch — Rankings entre amigos" },
  { property: "og:site_name", content: "RankMyMatch" },
  { property: "og:locale", content: "pt_BR" },
  { property: "og:url", content: "https://rankmymatch.app" },
  { name: "twitter:image", content: "https://rankmymatch.app/og-image.png" },
];

export const ROOT_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "RankMyMatch",
      url: "https://rankmymatch.app",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Rankings, temporadas e estatísticas de Padel, Beach Tênis, Tênis, Squash e Pickleball entre amigos e clubes.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
      image: "https://rankmymatch.app/og-image.png",
    },
    {
      "@type": "Organization",
      name: "RankMyMatch",
      url: "https://rankmymatch.app",
      logo: "https://rankmymatch.app/icon-512.png",
      sameAs: ["https://rankmymatch.app"],
    },
    {
      "@type": "WebSite",
      name: "RankMyMatch",
      url: "https://rankmymatch.app",
      inLanguage: "pt-BR",
    },
  ],
};

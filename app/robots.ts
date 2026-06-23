import type { MetadataRoute } from "next";

// robots.txt → https://imoghid.md/robots.txt
// Публичные страницы индексируются; защищённая зона /app/* и API закрыты.
const BASE_URL = "https://imoghid.md";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

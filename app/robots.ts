import type { MetadataRoute } from "next";

// robots.txt → https://imoghid.md/robots.txt — полностью разрешаем индексацию.
const BASE_URL = "https://imoghid.md";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

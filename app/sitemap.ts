import type { MetadataRoute } from "next";

// Sitemap для публичных страниц → https://imoghid.md/sitemap.xml
// Защищённые /app/* не включаем (требуют входа, не индексируются).
const BASE_URL = "https://imoghid.md";

const PUBLIC_ROUTES = [
  "", // /
  "/despre",
  "/faq",
  "/confidentialitate",
  "/termeni",
  "/login",
  "/register",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}

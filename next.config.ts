import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Постоянный редирект старого URL инструментов на «Actele mele».
  // (Next отдаёт 308 Permanent Redirect — постоянный, метод-сохраняющий эквивалент 301.)
  async redirects() {
    return [
      { source: "/app/instrumente", destination: "/app/acte", permanent: true },
    ];
  },

  // Файлы, читаемые в рантайме через fs по динамическому process.cwd()-пути,
  // nft автоматически НЕ трассирует — без этого на Vercel они отсутствуют в
  // serverless-бандле и используется fallback. Принудительно включаем docs/.
  outputFileTracingIncludes: {
    // Step 3 — системный промпт Георгия (docs/imoghid-reference.md §3 + база знаний).
    "/api/transactions/[id]/analyze": [
      "./docs/imoghid-reference.md",
      "./docs/baza_cunostinte.md",
    ],
    // Генератор анонса — кешируемый промпт.
    "/api/tools/generate-anunt": ["./docs/templates/anunt-generator-prompt.md"],
    // Заполнение .docx-шаблонов (docxtemplater читает файлы из docs/templates/).
    "/api/tools/generate-doc": ["./docs/templates/**/*"],
  },
};

export default nextConfig;

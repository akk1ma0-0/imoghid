import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Файлы, читаемые в рантайме через fs по динамическому process.cwd()-пути,
  // nft автоматически НЕ трассирует — без этого на Vercel они отсутствуют в
  // serverless-бандле и используется fallback. Принудительно включаем docs/.
  outputFileTracingIncludes: {
    // Step 3 — системный промпт Георгия (docs/imoghid-reference.md §3).
    "/api/transactions/[id]/analyze": ["./docs/imoghid-reference.md"],
    // Генератор анонса — кешируемый промпт.
    "/api/tools/generate-anunt": ["./docs/templates/anunt-generator-prompt.md"],
    // Заполнение .docx-шаблонов (docxtemplater читает файлы из docs/templates/).
    "/api/tools/generate-doc": ["./docs/templates/**/*"],
  },
};

export default nextConfig;

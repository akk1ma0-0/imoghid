# My Next App

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · PostgreSQL

## Структура

```
.
├── app/                  # роуты (App Router)
│   ├── api/              # API-роуты (route handlers)
│   │   ├── health/      # GET /api/health
│   │   └── users/       # GET, POST /api/users
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/           # React-компоненты
│   └── Button.tsx
├── lib/                  # prisma client + утилиты
│   ├── prisma.ts        # синглтон PrismaClient
│   └── utils.ts
├── prisma/
│   ├── schema.prisma    # модели БД
│   └── seed.ts          # начальные данные
└── .env                  # DATABASE_URL
```

## Запуск

1. Установить зависимости:
   ```bash
   npm install
   ```

2. Указать строку подключения к PostgreSQL в `.env` (`DATABASE_URL`).

3. Применить схему к БД и сгенерировать клиент:
   ```bash
   npm run prisma:migrate    # создаст миграцию + сгенерирует client
   # или без миграций:
   npm run db:push
   ```

4. (Опционально) Заполнить тестовыми данными:
   ```bash
   npm run db:seed
   ```

5. Запустить dev-сервер:
   ```bash
   npm run dev
   ```

Открыть http://localhost:3000

# CLAUDE.md

Этот файл автоматически читается Claude Code в начале каждой сессии.
Сюда складываем важный контекст проекта, чтобы он не терялся между окнами/сессиями VS Code.

> Как дополнять: просто попроси «запиши это в CLAUDE.md» или отредактируй файл вручную.

---

## Что за проект

**ImoGhid** — SaaS-платформа для риелторов Молдовы (и в перспективе других стран).

Стек: **Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Prisma 6 · PostgreSQL 17**

Три главных модуля:
- **Ghidul tranzacției** — пошаговый маршрут сделки (8 шагов), анализ документов через Claude API
- **Anunțuri 999** — лента объявлений от собственников с 999.md
- **Instrumente** — генератор объявлений (AI), CMA, PDF-отчёты

Референс дизайна и функционала: `docs/imoghid-v4.html` (открыть в браузере)

---

## Деплой и продакшн

- **Production URL:** https://imoghid.md (домен подключён к Vercel)
- **Vercel project:** `imoghid.vercel.app` (алиас того же деплоя)
- **Database:** Neon PostgreSQL, регион EU Frankfurt (`DATABASE_URL` в Vercel Environment Variables; локально — свой Postgres из `.env`)
- **Хостинг:** Vercel, авто-деплой из GitHub `akk1ma0-0/imoghid` (ветка `main`). Каждый push в `main` → новый production-деплой.
- **Build:** `prisma migrate deploy || echo … ; next build` — миграции применяются на Neon при сборке (non-blocking: если БД недоступна на этапе build, деплой не падает).
- **Env на Vercel (Production):** `DATABASE_URL` (Neon, pooled), `AUTH_SECRET` (свой, не из локального `.env`), `ANTHROPIC_API_KEY`, `AUTH_TRUST_HOST=true`. Секреты только в Vercel, в репозитории их нет.
- **Стартовая страница:** корень `/` → `/app` → **`/app/cadastru` (Verificare imobil)** — первая вкладка меню.

---

## Правила использования Claude API

Действуют постоянно, во всех сессиях.

1. **Подтверждение тестовых вызовов.** Перед любым тестовым вызовом к Claude API
   (`anthropic.messages.create`) во время разработки — остановиться и спросить
   пользователя в формате:
   > «Хочу сделать тестовый вызов Claude API для проверки [что именно]. Примерная
   > стоимость: ~[X] токенов входных + ~[Y] токенов выходных = ~$[сумма]. Подтверждаете?»
   Делать вызов только после явного «да».
2. **Не передавать содержимое `.docx`-шаблонов** (и вообще больших файлов) в запрос к
   Claude — после извлечения это 20–30 КБ текста, модели не нужны для генерации анонса
   или заполнения форм. Заполнение шаблонов — детерминированно через docxtemplater, без LLM.
3. **Минимальный вход.** В каждый вызов — только системный промпт + реально нужные данные
   (Step 3: текст OCR документов; генератор анонса: тезисы из textarea). Без данных сделок/
   `ExtractedField`/шаблонов, если они не нужны конкретной операции.
4. **Системные промпты кешировать** в памяти при старте модуля, не читать файл на каждый
   запрос (генератор анонса — `ANUNT_SYSTEM_PROMPT` в `lib/tools-claude.ts`).
5. **Два места реальных вызовов:** Step 3 (`lib/claude.ts`) и генератор анонса
   (`lib/tools-claude.ts`). `/api/tools/generate-doc` Claude НЕ вызывает.

---

## Структура

```
app/                  # роуты (App Router)
  (auth)/             # группа: login, register, subscribe + auth.css, BrandPanel
  app/                # защищённая зона (требует активной подписки)
    layout.tsx        # topbar + SessionProvider; imoghid.css (дизайн v4)
    objects/          # «Obiectele mele» — карточки транзакций
    transactions/new, transactions/[id]   # маршрут сделки (8 шагов)
    _components/flow/ # TransactionFlow, StepNav, RightRail, steps/Step1..8
  api/                # API-роуты (route handlers)
    auth/[...nextauth]/route.ts   # NextAuth handlers
    auth/register/route.ts        # регистрация + bcrypt + инвайт
    subscribe/route.ts            # активация плана / инвайта
    transactions/...              # CRUD + documents/analyze/owners/checklist/calculation
    health/route.ts, users/route.ts
  layout.tsx, page.tsx, globals.css
auth.ts               # NextAuth: провайдер Credentials (Prisma + bcrypt)
auth.config.ts        # edge-safe конфиг + колбэки (authorized/jwt/session)
middleware.ts         # защита /app/* (matcher)
types/next-auth.d.ts  # аугментация Session/User/JWT (id, plan, planActive)
components/           # Button.tsx, Providers.tsx (SessionProvider)
lib/                  # prisma, utils, plan, invite, steps, transaction-auth,
                      # calc (калькуляторы), claude (анализ), analyze/, checklist/
prisma/               # schema.prisma, seed.ts, migrations/
docs/                 # imoghid-v4.html, imoghid-auth.html — референсы UI/UX
```

---

## Команды

```bash
npm run dev              # дев-сервер → http://localhost:3000
npm run build            # прод-сборка
npm run prisma:migrate   # создать+применить миграцию
npm run db:seed          # заполнить тестовыми данными
npm run prisma:studio    # GUI для БД
```

---

## ⚠️ Важно: окружение установлено вручную (нет brew/системных сервисов)

На этой машине не было Node.js, npm, PostgreSQL, Docker. Всё поставлено вручную:

- **Node.js v24.16.0 LTS** → `~/.local/node-v24.16.0-darwin-arm64/` (PATH прописан в `~/.zshrc`)
- **PostgreSQL 17.10** (self-contained бинарники Zonky) → `~/.local/pgsql/`, данные в `~/.local/pgsql/data/`
  - Минимальный набор: есть только `initdb`, `pg_ctl`, `postgres`. **Нет `psql`/`createdb`** — БД создаёт сам Prisma.

### PostgreSQL НЕ запускается автоматически. После перезагрузки Mac:

```bash
# запустить:
~/.local/pgsql/bin/pg_ctl -D ~/.local/pgsql/data -l ~/.local/pgsql/data/server.log -o "-p 5432" start
# остановить:
~/.local/pgsql/bin/pg_ctl -D ~/.local/pgsql/data stop
```

Если `npm run dev` падает с ошибкой подключения к БД — скорее всего Postgres не запущен.

---

## Аутентификация (NextAuth v5 + bcrypt)

- **Провайдер:** Credentials (email + пароль), стратегия сессии — **JWT**. Секрет — `AUTH_SECRET` в `.env`.
- **Форма сессии:** `session.user = { id, email, name, plan, planActive }`. Типы в `types/next-auth.d.ts` (аугментация `next-auth` и `@auth/core/jwt`).
- **Регистрация** `POST /api/auth/register` — валидация (пароль ≥8 + заглавная + цифра), `bcrypt.hash` (10 раундов), создание `User` с `plan=BASIC`. Валидный `inviteCode` → план кода (PRO) + `planActivatedAt=now`, инкремент `usedCount` (всё в одной транзакции).
- **Активная подписка:** `planActivatedAt != null` и (нет `planExpiresAt` или он в будущем). Хелпер `isPlanActive()` в `lib/plan.ts`. Новый пользователь без инвайта — **неактивен**, пока не выберет план на `/subscribe`.
- **Защита маршрутов:** `middleware.ts` (matcher `/app/:path*`) → колбэк `authorized` в `auth.config.ts`: нет сессии → `/login`; неактивная подписка → `/subscribe`.
- **`POST /api/subscribe`** (нужна сессия) — активирует `{ plan }` или `{ inviteCode }`. После вызова клиент делает `useSession().update({ plan, planActive })`, чтобы обновить JWT. ⚠️ Реальной оплаты Stripe пока нет — план активируется напрямую.
- **Edge-safe разделение:** `auth.config.ts` без Prisma/bcrypt (используется в middleware), полный `auth.ts` с провайдером — в Node runtime. Не импортировать Prisma в middleware.
- **Сид-данные** (`npm run db:seed`): инвайт `IMOTEST2025` (PRO, maxUses 50); `admin@imoghid.md` / `Admin1234` (ADMIN, PRO); `demo@imoghid.md` / `Demo1234` (агент, BASIC активен).

---

## База данных

- Подключение в `.env`: `DATABASE_URL` → `localhost:5432`, база `my_next_app`
- Креды: пользователь `postgres`, пароль `postgres` (локальная разработка)
- ORM: Prisma 6, схема в `prisma/schema.prisma`
- Конфиг Prisma вынесен в `prisma.config.ts` (блока `prisma` в `package.json` больше нет). `.env` грузится через `import "dotenv/config"` в этом файле.
- Схема ImoGhid применена (миграция `imoghid_init`); старые модели `User`/`Post` удалены.

### Ключевые решения по БД:

**Подписки:**
- 2 плана: `BASIC` ($10/мес) и `PRO` ($30/мес). Бесплатного доступа нет.
- PRO выдаётся вручную через Prisma Studio (`plan = 'PRO'`) или через `InviteCode`
- Инвайт-коды создаёт администратор, тестировщики вводят при регистрации

**Объявления 999.md (модуль Anunțuri 999, страница `/app/listings`):**
- **Сейчас — моковые данные** из `lib/listings-mock.ts` (10 объявлений; структура совпадает с моделью `Listing999`). 3 агентства (`isOwner=false`), 1 в чёрном списке, 2 со сниженной ценой.
- **Реальный парсер 999.md подключается через `lib/listings-service.ts → getListings(filters)`** — меняется ТОЛЬКО эта функция; API-роуты (`GET /api/listings`) и UI не трогаются.
- **Частота обновления:** планируется каждые 5 минут через cron job.
- **Телефоны продавцов платформа НЕ хранит** — только в `SavedListingContact` по инициативе риелтора (`POST/DELETE /api/listings/[id]/contact`), видны только владельцу (фильтр по `userId`). FK требует строку `Listing999` — она материализуется upsert'ом при сохранении контакта (с реальным парсером объявления уже будут в БД).
- Чёрный список: пока флаг встроен в мок (`blacklist`); реальный парсер вычислит по SHA-256 телефона из `BlacklistReport`.
- Хранятся постоянно (нужны для CMA и истории цен); архивация через `pg_cron` (>6 мес → `listing_999_archive`). Индексы на `(sector, listingType, isOwner, isActive)` и `priceEur`.

**Безопасность и приватность:**
- Телефоны в чёрном списке хранятся как SHA-256 хеш — никогда plaintext (Legea 133/2011)
- Контакты агента (телефон/заметка на объявлении) видны только ему — `WHERE userId = currentUser.id` везде
- Агентство пока = строка `agencyName` у пользователя (таблица `Agency` — в v2)

**Тип сделки Schimb (обмен):**
- Поле `objectIndex` (1 или 2) на таблицах: `TransactionDocument`, `ExtractedField`, `TransactionFlag`, `PropertyOwner`
- В шагах 2, 3, 4 интерфейс делится на два столбца по объектам

---

## Бизнес-правила (критически важны для логики)

- **Платформа подсказывает, не решает** — дисклеймер на каждом экране, никогда не писать «документы в порядке» как окончательный вывод
- **PDF-отчёт** — только план PRO
- **Генератор объявлений (AI)** — только план PRO
- **CMA (аналитика рынка)** — только план PRO
- **Лимиты анализа документов (шаг 3):** BASIC — 30 анализов/мес, PRO — 100/мес. Счётчик `User.analysisCount` + `User.analysisCountResetAt` (месячный сброс по календарному месяцу). Перед `POST /api/transactions/[id]/analyze`: если `analysisCountResetAt` в прошлом месяце → сброс в 0; если лимит достигнут → **429** с сообщением на румынском; иначе инкремент и анализ. Лимиты в `lib/analysis-limits.ts`. Текущее использование — `GET /api/analysis-usage`; в UI шага 3 показывается «Analize utilizate: X / Y» (серый текст под заголовком).
- **LegalRule** — правила хранятся в БД, не в коде. При изменении закона редактируется запись в таблице `legal_rules`, деплой не нужен
- **8 шагов маршрута сделки:** DATE_OBIECT → INCARCARE → VERIFICARE_ACTE → COPROPRIETARI → LISTA_NOTAR → PLATI → RAPORT → PROGRAMARE_ASP
- **Статусы объекта** (`Transaction.status`, enum `TransactionStatus`): ACTIVE/WAITING/DONE/ARCHIVE — вкладки «Obiectele mele» (În lucru / În așteptare / Finisate / Arhivă). Меняются кнопками на карточке (PATCH `{status}`); шаг 8 ставит DONE. Цвета: active=зелёный, waiting=жёлтый, done=синий, archive=серый.
- **Schimb (2 объекта):** на шагах 1–4 интерфейс делится на Obiect 1 / Obiect 2; objectIndex 1/2 в документах/полях/флагах/анализе Claude. У `Transaction` отдельных колонок под Obiect 2 нет (адрес/кадастр объекта 2 на шаге 1 — UI-уровень); основной объект = Obiect 1.
- **Типы сделок:** VANZARE_CUMPARARE · DONATIE · SCHIMB · ALT_TIP
- Язык интерфейса: румынский (основной), русский (переключение)

---

## Модуль «Verificare imobil» (`/app/cadastru`)

Отдельная вкладка (первая в меню, перед «Ghidul tranzacției»), по дизайну `docs/imoghid-v4.html` (#viewCadastru). Название модуля — «Verificare imobil» (URL остался `/app/cadastru`). Порядок меню: Verificare imobil · Ghidul tranzacției · Obiectele mele · Instrumente · Anunțuri 999.

- **Данные моковые** (как 999): `lib/cadastru-service.ts` (`CAD_RECORDS`, `CAD_BUILDINGS`, `CAD_ADDR_INDEX`). Реальный API ASP/Acces-Web подключается заменой **только** `lookupCadastru()`/`getRecordByCad()`.
- `POST /api/cadastru/lookup { query }` → `record`/`picker` (200) или `fallback` (404). Логика: точный кадастровый номер → запись; адрес с/без квартиры → запись или picker; квартира не в здании → picker; адрес не найден → 404 fallback (ручной портал e-Cadastru).
- Страница: 2-колоночный grid (`.cad-shell` — **display:grid**, не block), trace агента, picker квартир, fallback, карточка результата с 3 флагами (Alte drepturi reale / Notări / Interdicții, зелёный «Nu există» / красный «Există»), empty-state. Правая панель: «Cum funcționează», «Acte normative», «Legendă semnale».
- **Связь с маршрутом:** «Creați dosarul» → редирект на `/app/transactions/new?from=cadastru&address=…&cad=…`. На шаге 1 показывается синяя плашка «Date completate din verificarea cadastrului» и предзаполняются адрес + кадастровый номер. Прямой заход на `/app/transactions/new` — обычная пустая форма без плашки.

---

## Модуль «Ghidul tranzacției» (маршрут сделки)

Реализован по дизайну `docs/imoghid-v4.html`. Все данные привязаны к `userId` сессии.

- **Страницы:** `/app/objects` (карточки), `/app/transactions/new` (создание с шага 1), `/app/transactions/[id]?step=N` (8 шагов). `/app` → redirect на `/app/objects`.
- **Оркестратор:** `app/app/_components/flow/TransactionFlow.tsx` (клиент) — левое меню шагов, main, правый rail. При переходе между шагами PATCH'ит `currentStep` в БД → «Deschide ghidul» открывает на сохранённом шаге.
- **Навигация шагов:** карточки «Pasul următor» в правой панели НЕТ; под контентом каждого шага — кнопки «← Pasul anterior» (disabled на шаге 1) и «→ Pasul N» (без названия шага); на шаге 8 второй кнопки нет (только «anterior»). Правый rail — только «Acte normative» (9 законов, включая Legea freelancerilor) + дисклеймер.
- **Шаги ↔ enum:** `lib/steps.ts` (`TransactionStep` ↔ числа 1–8).
- **Шаг 3 (анализ):** `POST /api/transactions/[id]/analyze` — `lib/claude.ts` зовёт `claude-sonnet-4-6` при заданном `ANTHROPIC_API_KEY` (PDF/image-блоки + structured JSON), иначе **детерминированный stub**. Извлекает поля → `ExtractedField`; детерминированные флаги (`lib/analyze/flags.ts`): AREA_MISMATCH(red), NOT_ACTUALIZED(amber), PRIVATIZARE_CERT(amber), LEGAL_ENTITY_SELLER(«orange»=amber+код), NO_ENCUMBRANCE(green); посев `PropertyOwner`. Идемпотентно. Для SCHIMB — per `objectIndex` (1/2, две колонки).
- **FlagSeverity:** только RED/AMBER/GREEN (без миграции); «оранжевый» вид задаётся по `code` в UI (`flagPresentation`).
- **Шаг 5 (чеклист):** генерируется из dealType+флагов (`lib/checklist/catalog.ts`); legalRef из таблицы `LegalRule` (сидируется).
- **Шаг 6 (калькуляторы):** `lib/calc.ts` — единый источник для фронта и `POST .../calculation` (налоги VC/донация/обмен, нотариат Legea 271/2003, ипотека).
- **Файлы:** загрузка в `/public/uploads/[txId]/` (dev-хранилище, в `.gitignore`; прод — S3/Supabase).
- **Заглушки (как в дизайне):** PDF-отчёт шаг 7 (PRO-gate, BASIC → upsell), «Acord de avans» шаг 5, вкладки Anunțuri/Instrumente в topbar.

---

## Модуль «Instrumente» (`/app/instrumente`)

Четыре карточки (дизайн `docs/imoghid-v4.html` #viewAI):
1. **Generare anunț** — `POST /api/tools/generate-anunt` (Claude, кешированный промпт `docs/templates/anunt-generator-prompt.md`; в запрос только промпт + тезисы) → текст объявления + хэштеги (ro/ru), кнопка Copiați.
2. **Acte / Contracte** — 2 шаблона `.docx` с тегами `{tag}` (`docs/templates/`): «Completați →» открывает модалку с формой (`modal-garantie`/`modal-contract`, поля 1:1 с дизайном). Вверху — «Selectați tranzacția»: при выборе сделки поля предзаполняются из `ExtractedField`+`Transaction` (только подтверждённые). «Generați documentul →» → `POST /api/tools/generate-doc { templateName, data }` → **docxtemplater** (`pizzip`+`docxtemplater`, `lib/templates.ts`) подставляет теги, **незаполненные → `____________`** (nullGetter, §4 — не выдумываем) → скачивание `.docx` с сохранением форматирования шаблона. Серверные конверсии (`lib/ro-words.ts`): `{suma_garantie_litere}`←cifre, `{durata_litere}`←cifre (числа прописью с диакритиками), дата контракта → `{contract_zi}`/`{contract_luna}` (месяц словами)/`{contract_an}` (2 цифры, в шаблоне жёстко «20» перед тегом). Заполнение шаблонов **БЕЗ Claude** (детерминированно); Claude остаётся только для генерации анонса (card 1).
3. **Analiză de piață (CMA)** — демо-статистика из `lib/listings-mock.ts` через `getCmaStats()` (единая точка замены на B2B-данные 999.md). `GET /api/tools/cma`.
4. **Raport pentru client (PDF)** — Premium, заглушка (alert «în MVP»).

---

## Claude API (AI-функции)

> Единый источник правды по правовой логике и промптам — `docs/imoghid-reference.md` (заменил `инструкция_по_анализу_документов.txt` и `georgii-step3-prompt.md`). Системный промпт Step 3 = **Секция 3** этого файла (читается `lib/claude.ts` → `loadSystemPrompt()` по маркерам `## 3.`…`## 4.`). Логика автозаполнения шаблонов — Секция 4.
> **Claude-вызовы:** (1) Step 3 — анализ документов (`lib/claude.ts`); (2) Instrumente — **генерация анонса** (`lib/tools-claude.ts`, `anunt-generator-prompt.md`). Заполнение шаблонов Acte/Contracte — БЕЗ Claude (docxtemplater, детерминированно). Промпт `document-fill-prompt.md` оставлен как референс §4, но больше не вызывается. У Claude-вызовов свой системный промпт и stub-fallback без ключа.


- Используется для: OCR и анализ документов (шаг 3), генератор объявлений (Instrumente)
- Модель: `claude-sonnet-4-6`
- Клиент в: `lib/claude.ts`
- Мониторинг токенов: сохранять `inputTokens` и `outputTokens` в `AnuntGeneration`
- Промпты для анализа документов берутся из таблицы `LegalRule` (не хардкод)

---

## Журнал решений

- 2026-06-16: Инициализирован проект, окружение установлено вручную, миграция `init` применена, API проверены (health/users работают)
- 2026-06-16: Спроектирована схема БД (17 таблиц) — заменить старые модели User/Post на схему ImoGhid из `docs/imoghid-v4.html` и `prisma/schema.prisma`
- 2026-06-16: Применена схема ImoGhid (миграция `imoghid_init`, БД сброшена). Конфиг Prisma перенесён из `package.json` в `prisma.config.ts`.
- 2026-06-17: Реализована аутентификация — NextAuth v5 (Credentials + JWT) + bcrypt: регистрация с инвайт-кодами, защита `/app/*` по активной подписке, страницы login/register/subscribe по `docs/imoghid-auth.html`. Проверено end-to-end.
- 2026-06-17: Реализован модуль «Ghidul tranzacției» (8 шагов) + «Obiectele mele» по `docs/imoghid-v4.html`. Анализ документов через Claude (`claude-sonnet-4-6`) с stub-fallback. Проверено end-to-end (VC + SCHIMB): create → upload → analyze (flags) → owners → checklist → calc → completedAt.
- 2026-06-17: Добавлены лимиты анализов (BASIC 30 / PRO 100 в месяц) с месячным сбросом + UI-счётчик; добавлен `ANTHROPIC_API_KEY` в `.env` (реальный Claude).
- 2026-06-17: Реализован модуль «Anunțuri 999» (`/app/listings`) с моковыми данными (`lib/listings-mock.ts`) через swap-слой `lib/listings-service.ts`. Приватные контакты `SavedListingContact` (только владелец). Готов к подключению реального парсера без переписывания UI/API.
- 2026-06-17: Модуль «Verificare cadastru» вынесен в отдельную вкладку `/app/cadastru` (первая в меню). Моковый поиск через `lib/cadastru-service.ts` (`lookupCadastru`), `POST /api/cadastru/lookup`. «Creați dosarul» → префилл шага 1 (адрес+кадастр) с синей плашкой. Шаг 1 Ghidul больше не содержит поиск по кадастру.
- 2026-06-18: Аудит-проход по `docs/imoghid-v4.html`: навигация шагов «Pasul următor» (карточка справа) → кнопки «← Pasul anterior / → Pasul N» под контентом; nav-btn 16px/тёмная активная плашка. (draft-бейдж «SCHIȚĂ v0.4» добавляли, затем убрали по просьбе.)
- 2026-06-19: Правки UI по `docs/imoghid-v4.html`: `.law-tag` 11px/ink2; шаг 1 — 3 необязательных поля (suprafață/destinație/valoare evaluare; колонки в Transaction, миграция `add_object_optional_fields`; сохраняются в POST/PATCH; префилл из БД или Verificare imobil); шаг 4 — `.owner-ava` скрыт; шаг 5 — подписи без «încărcat/lipsește» (карта `CHK_HINT`), Procură «După caz» в обеих частях (Partea 2 получила Procură); правая панель — блок контакта (Liudmila Popovscaia) + QR `/qr-liudmila.png`.
- 2026-06-19: Правки UI по `docs/imoghid-v4.html`: stepNav «→ Pasul N» без названия, на шаге 8 только «anterior»; поля ввода 13.5px; `.disclaimer` = стиль `.rules-bd p` (13.5px/ink3/400); добавлена «Legea freelancerilor»; убрано слово «Premium» (PDF-отчёт); топбар показывает имя пользователя + инициалы из реального имени (не хардкод «IA»).
- 2026-06-19: Оптимизация Claude API в Instrumente: заполнение шаблонов (`/api/tools/generate-doc`) — без Claude (docxtemplater); генератор анонса переименован в `/api/tools/generate-anunt`, системный промпт кешируется при старте, в запрос только промпт+тезисы. `{contract_an}` → полный год (4 цифры, шаблон исправлен). Добавлен раздел «Правила использования Claude API» (подтверждение тестовых вызовов, не слать .docx, кешировать промпты).
- 2026-06-19: Flow «Completați →» переведён на **docxtemplater** (`pizzip`+`docxtemplater`, убраны `mammoth`/`docx`): две модалки с формами (поля 1:1 с дизайном), теги `{tag}` в шаблонах, серверные конверсии чисел прописью и даты (`lib/ro-words.ts`), незаполненные → `____________`, предзаполнение из сделки. Заполнение шаблонов теперь без Claude.
- 2026-06-19: Реализован модуль «Instrumente» (`/app/instrumente`, 4 карточки). Второй тип Claude-вызова (заполнение .docx-шаблонов, `lib/tools-claude.ts` + `mammoth`/`docx`). Источник промптов/правовой базы консолидирован в `docs/imoghid-reference.md` (Step 3 = §3); старые `georgii-step3-prompt.md` и `инструкция_…txt` удалены. Проверено e2e (anunț, fill с подстановкой данных и сохранением `____`, .docx-генерация, CMA).
- 2026-06-18: Пакет из 12 правок по `docs/imoghid-v4.html`: модуль переименован «Verificare cadastru»→«Verificare imobil»; 999 перемещён в конец меню; заголовки карточек 13.5px/ink; убран «Alt tip» (шаг 1); загрузка файла контракта (шаг 1); Schimb на шаге 1 = 2 карточки Obiect 1/2 + «Verifică obiect →»; шаг 5 «Partea 1/2», убрана кнопка acord de avans; шаг 6 Schimb — метки Obiect 1/2 + чекбокс sultă; «Obiectele mele» — статусы ACTIVE/WAITING/DONE/ARCHIVE (миграция `add_transaction_status`), кнопки смены статуса, убраны «Vizionări» и таб «Selectate».

import { Button } from "@/components/Button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">My Next App</h1>
      <p className="text-lg text-gray-500">
        Next.js · TypeScript · Tailwind · Prisma · PostgreSQL
      </p>
      <div className="flex gap-3">
        <Button>Начать</Button>
        <Button variant="secondary">Документация</Button>
      </div>
    </main>
  );
}

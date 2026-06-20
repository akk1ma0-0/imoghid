import { redirect } from "next/navigation";

// Корень открывает приложение ImoGhid (→ /app → /app/objects; без сессии middleware ведёт на /login).
export default function Home() {
  redirect("/app");
}

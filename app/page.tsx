import { redirect } from "next/navigation";

// Корень открывает приложение ImoGhid (→ /app → /app/cadastru; без сессии middleware ведёт на /login).
export default function Home() {
  redirect("/app");
}

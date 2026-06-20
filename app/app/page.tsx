import { redirect } from "next/navigation";

// /app → первая вкладка меню «Verificare imobil».
export default function AppHome() {
  redirect("/app/cadastru");
}

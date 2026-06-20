import { redirect } from "next/navigation";

// /app → главный модуль «Obiectele mele».
export default function AppHome() {
  redirect("/app/objects");
}

import { RegisterForm } from "./RegisterForm";

// Текст про активацию плана зависит от режима списка ожидания (env читается на сервере).
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterForm waitlist={process.env.WAITLIST_MODE === "true"} />;
}

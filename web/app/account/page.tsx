import PasswordForm from "@/components/PasswordForm";
import { me } from "@/lib/api";

export const metadata = { title: "Вход и пароль — Позиция" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await me();
  return (
    <div className="space-y-4">
      {user ? (
        <p className="text-sm text-ink-600">
          Вы вошли как <b>{user.name ?? user.email}</b> ({user.email})
        </p>
      ) : null}
      <PasswordForm />
    </div>
  );
}

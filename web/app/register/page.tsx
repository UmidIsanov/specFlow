import RegisterForm from "@/components/RegisterForm";

export const metadata = { title: "Приглашение — Позиция" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      {invite ? (
        <RegisterForm token={invite} />
      ) : (
        <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6">
          <h1 className="text-lg font-semibold">Нужна ссылка-приглашение</h1>
          <p className="mt-2 text-sm text-ink-600">
            Пользователей в «Позиции» заводят по приглашению: попросите ссылку у того, кто ведёт объект.
          </p>
        </div>
      )}
    </div>
  );
}

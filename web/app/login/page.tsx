import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Вход — Позиция" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Чужой адрес в next увёл бы человека на другой сайт — берём только внутренние пути.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <LoginForm next={target} />
    </div>
  );
}

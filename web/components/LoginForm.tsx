"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Не получилось войти");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Сервер не отвечает");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
      <div>
        <h1 className="text-lg font-semibold">Вход в «Позицию»</h1>
        <p className="mt-1 text-sm text-ink-400">Объекты, заявки и цены видит только тот, кого позвали.</p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Электронная почта</span>
        <input
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="input w-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Пароль</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {busy ? "Проверяю…" : "Войти"}
      </button>

      <p className="text-xs text-ink-400">
        Пароль забыли или его ещё нет — напишите тому, кто завёл объект: пользователей пока заводят вручную.
      </p>
    </form>
  );
}

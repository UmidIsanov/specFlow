"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type Invite = { email: string; role: string; project: string | null; invitedBy: string; knownUser: boolean };

export default function RegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch(`/api/auth/invite/${encodeURIComponent(token)}`);
      if (!alive) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setProblem(body.error ?? "Приглашение не найдено");
        return;
      }
      setInvite((await res.json()) as Invite);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Не получилось завести вход");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (problem) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6">
        <h1 className="text-lg font-semibold">Ссылка не работает</h1>
        <p className="mt-2 text-sm text-ink-600">{problem}</p>
        <p className="mt-2 text-sm text-ink-400">Попросите нового приглашения у того, кто ведёт объект.</p>
      </div>
    );
  }

  if (!invite) return <p className="text-sm text-ink-400">Проверяю приглашение…</p>;

  if (invite.knownUser) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6">
        <h1 className="text-lg font-semibold">У вас уже есть вход</h1>
        <p className="mt-2 text-sm text-ink-600">
          Войдите под {invite.email} — объект {invite.project ? `«${invite.project}»` : ""} появится в списке.
        </p>
        <button
          type="button"
          onClick={() => router.replace(`/login?next=%2F`)}
          className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600"
        >
          Перейти ко входу
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
      <div>
        <h1 className="text-lg font-semibold">Вход в «Позицию»</h1>
        <p className="mt-1 text-sm text-ink-600">
          {invite.invitedBy} зовёт вас на объект {invite.project ? `«${invite.project}»` : ""}
          {invite.role === "VIEWER" ? " — только посмотреть" : ""}.
        </p>
        <p className="mt-1 text-sm text-ink-400">Почта: {invite.email}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Как вас зовут</span>
        <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя и фамилия" />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Придумайте пароль</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="text-xs text-ink-400">Не короче восьми символов.</span>
      </label>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {busy ? "Завожу…" : "Войти в программу"}
      </button>
    </form>
  );
}

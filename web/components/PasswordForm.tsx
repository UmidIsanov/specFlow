"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export default function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword !== repeat) {
      setError("Новый пароль и повтор не совпали");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Не получилось сменить пароль");
        return;
      }
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
      <div>
        <h1 className="text-lg font-semibold">Смена пароля</h1>
        <p className="mt-1 text-sm text-ink-400">
          Пароль, который выдали при заведении входа, стоит сменить: он прошёл через переписку.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Текущий пароль</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="input w-full"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Новый пароль</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input w-full"
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
        />
        <span className="text-xs text-ink-400">Не короче восьми символов.</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-600">Ещё раз новый</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          className="input w-full"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {done ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Пароль сменён. На других устройствах вход придётся повторить.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {busy ? "Меняю…" : "Сменить пароль"}
      </button>
    </form>
  );
}

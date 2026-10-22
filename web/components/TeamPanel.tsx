"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { apiFetch } from "@/lib/clientApi";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  lastLoginAt: string | null;
  isYou: boolean;
};
type Invite = { id: string; email: string; role: string; expiresAt: string };
type Team = { members: Member[]; invites: Invite[]; canInvite: boolean };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "владелец",
  ENGINEER: "инженер",
  VIEWER: "наблюдатель",
};

/** Ссылка приглашения приходит с сервера без домена, пока APP_URL не задан. */
function absolute(link: string): string {
  if (/^https?:\/\//.test(link)) return link;
  if (typeof window === "undefined") return link;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${link.startsWith(base) ? "" : base}${link}`;
}

export default function TeamPanel({ projectId }: { projectId: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ENGINEER");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/projects/${projectId}/members`);
    if (res.ok) setTeam((await res.json()) as Team);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Не получилось пригласить");
        return;
      }
      setLink(absolute(body.link));
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const remove = async (path: string) => {
    await apiFetch(path, { method: "DELETE" });
    await load();
  };

  // Пока список едет, показываем саму карточку: иначе блок появляется рывком.
  if (!team)
    return (
      <Card className="p-5">
        <h2 className="font-semibold">Команда объекта</h2>
        <p className="mt-2 text-sm text-ink-400">Загружаю…</p>
      </Card>
    );

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Команда объекта</h2>

      <ul className="space-y-2">
        {team.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{m.name ?? m.email}</span>
            {m.name ? <span className="text-xs text-ink-400">{m.email}</span> : null}
            <Badge tone={m.role === "OWNER" ? "blue" : "gray"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
            {m.isYou ? <span className="text-xs text-ink-400">это вы</span> : null}
            {team.canInvite && !m.isYou && m.role !== "OWNER" ? (
              <button
                type="button"
                onClick={() => remove(`/api/projects/${projectId}/members/${m.userId}`)}
                className="ml-auto text-xs text-ink-400 hover:text-red-600 hover:underline"
              >
                убрать с объекта
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {team.invites.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
          {team.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
              <span>{i.email}</span>
              <Badge tone="amber">приглашён, ещё не вошёл</Badge>
              {team.canInvite ? (
                <button
                  type="button"
                  onClick={() => remove(`/api/projects/${projectId}/invites/${i.id}`)}
                  className="ml-auto text-xs text-ink-400 hover:text-red-600 hover:underline"
                >
                  отменить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {team.canInvite ? (
        <form onSubmit={invite} className="mt-4 space-y-2 border-t border-ink-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              placeholder="почта коллеги"
              className="input w-56"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input w-auto">
              <option value="ENGINEER">инженер — может править</option>
              <option value="VIEWER">наблюдатель — только смотрит</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              Пригласить
            </button>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          {link ? (
            <div className="space-y-1 rounded-lg bg-ink-50 p-3">
              <p className="text-sm text-ink-600">
                Почту программа пока не отправляет — перешлите ссылку сами, она живёт неделю:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-2 py-1 text-xs">{link}</code>
                <button type="button" onClick={copy} className="text-sm text-brand-600 hover:underline">
                  {copied ? "скопировано" : "скопировать"}
                </button>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}

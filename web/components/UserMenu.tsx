"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-ink-500">{name}</span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="rounded-lg border border-ink-200 px-2.5 py-1 font-medium hover:bg-ink-50 disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}

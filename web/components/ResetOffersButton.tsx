"use client";

import DangerButton from "@/components/DangerButton";
import { apiFetch } from "@/lib/clientApi";

/** Сброс анализа: убрать все загруженные КП объекта и начать заново. */
export default function ResetOffersButton({ projectId, count }: { projectId: string; count: number }) {
  return (
    <DangerButton
      size="small"
      confirm={`Удалить все загруженные КП — ${count} шт. — вместе с разбором и сравнением? Заявка останется на месте.`}
      request={() => apiFetch(`/api/projects/${projectId}/offers`, { method: "DELETE" })}
    >
      Сбросить все КП
    </DangerButton>
  );
}

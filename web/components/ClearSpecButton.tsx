"use client";

import DangerButton from "@/components/DangerButton";
import { PUBLIC_API } from "@/lib/api";

/** Убрать всю заявку объекта — например, когда загрузили не тот файл. */
export default function ClearSpecButton({ projectId, count }: { projectId: string; count: number }) {
  return (
    <DangerButton
      size="small"
      confirm={`Удалить всю заявку объекта — ${count} позиций? Отменить нельзя.`}
      request={(force) =>
        fetch(`${PUBLIC_API}/api/projects/${projectId}/spec`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        })
      }
    >
      Очистить заявку
    </DangerButton>
  );
}

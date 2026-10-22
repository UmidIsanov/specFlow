"use client";

import DangerButton from "@/components/DangerButton";
import { apiFetch } from "@/lib/clientApi";

/** Убрать одно предложение поставщика — остальные и заявка не тронуты. */
export default function DeleteOfferButton({ offerId, supplier }: { offerId: string; supplier: string }) {
  return (
    <DangerButton
      size="small"
      confirm={`Удалить КП «${supplier}» вместе с разбором? Отменить нельзя.`}
      request={() => apiFetch(`/api/offers/${offerId}`, { method: "DELETE" })}
    >
      Удалить
    </DangerButton>
  );
}

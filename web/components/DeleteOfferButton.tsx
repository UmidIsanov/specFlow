"use client";

import DangerButton from "@/components/DangerButton";
import { PUBLIC_API } from "@/lib/api";

/** Убрать одно предложение поставщика — остальные и заявка не тронуты. */
export default function DeleteOfferButton({ offerId, supplier }: { offerId: string; supplier: string }) {
  return (
    <DangerButton
      size="small"
      confirm={`Удалить КП «${supplier}» вместе с разбором? Отменить нельзя.`}
      request={() => fetch(`${PUBLIC_API}/api/offers/${offerId}`, { method: "DELETE" })}
    >
      Удалить
    </DangerButton>
  );
}

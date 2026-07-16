"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// ---------------------------------------------------------------------------
// useAction — hook padrão para chamar Server Actions a partir do cliente.
// Centraliza pending / error / notice + router.refresh(). Antes estava
// duplicado em Tarefas, Co-piloto, WhatsApp, Config etc.
// ---------------------------------------------------------------------------

export type ActionResult = { error?: string; success?: string };

export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run<T extends ActionResult>(fn: () => Promise<T>, onOk?: (result: T) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
      } else {
        setNotice(result?.success ?? null);
        onOk?.(result);
        router.refresh();
      }
    });
  }

  function reset() {
    setError(null);
    setNotice(null);
  }

  return { pending, error, notice, run, reset, setError, setNotice };
}

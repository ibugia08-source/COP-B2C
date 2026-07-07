"use client";

import { Button, EmptyState } from "@/components/ui/primitives";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EmptyState
      icon="⚠️"
      title="Algo deu errado"
      description={
        error.digest
          ? `Ocorreu um erro inesperado (ref: ${error.digest}). Tente novamente.`
          : "Ocorreu um erro inesperado. Tente novamente."
      }
      action={<Button onClick={reset}>Tentar novamente</Button>}
    />
  );
}

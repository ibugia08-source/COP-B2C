"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { toggleAutomation } from "./actions";

export function AutomationToggle({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <Alert>{error}</Alert>}
      <Button
        size="sm"
        variant={enabled ? "secondary" : "primary"}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await toggleAutomation(ruleId);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "..." : enabled ? "Desativar" : "Ativar"}
      </Button>
    </div>
  );
}

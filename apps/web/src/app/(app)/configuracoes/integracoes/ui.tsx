"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { connectGoogleDrive, disconnectGoogleDrive } from "./actions";

export function GoogleDriveControls({
  configured,
  connected,
  canManage,
}: {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setNotice(result.success ?? null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <Button variant="secondary" disabled={!canManage || pending} onClick={() => run(disconnectGoogleDrive)}>
            Desconectar
          </Button>
        ) : (
          <Button disabled={!canManage || pending} onClick={() => run(connectGoogleDrive)}>
            Conectar Google Drive
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={!connected}
          title={connected ? "Selecionar arquivo do Drive" : "Conecte o Google Drive para selecionar arquivos"}
        >
          Selecionar arquivo do Drive
        </Button>
      </div>

      {!configured && (
        <Alert tone="amber">
          Configuração pendente: as credenciais do Google (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e
          GOOGLE_REFRESH_TOKEN) ainda não foram definidas no ambiente. Enquanto isso, você já pode
          vincular documentos colando links do Google Drive manualmente.
        </Alert>
      )}
      {notice && <Alert tone="green">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

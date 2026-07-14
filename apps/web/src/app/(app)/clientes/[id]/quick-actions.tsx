"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdsStatus, Client } from "@/db/schema";
import { HEALTH_META } from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { changeClientHealth, markClientLost, toggleAdsStatus, togglePause } from "../actions";

export function ClientQuickActions({ client, canMoveStatus }: { client: Client; canMoveStatus: boolean }) {
  const router = useRouter();
  const [modal, setModal] = useState<"saude" | "perdido" | "ads" | "pausar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // campos dos modais
  const [health, setHealth] = useState(client.healthStatus);
  const [healthReason, setHealthReason] = useState("");
  const [churnReason, setChurnReason] = useState("");
  const [churnDate, setChurnDate] = useState("");
  const [pauseReason, setPauseReason] = useState("");

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setModal(null);
        router.refresh();
      }
    });
  }

  const nextAds: AdsStatus = client.adsStatus === "ATIVO" ? "PAUSADO" : "ATIVO";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" href={`/tarefas?nova=1&cliente=${client.id}`}>
        + Tarefa
      </Button>
      <Button size="sm" variant="secondary" href={`/tarefas?nova=1&tipo=CRIATIVO&cliente=${client.id}`}>
        + Criativo
      </Button>
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setModal("saude"); }}>
        Alterar saúde
      </Button>
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setModal("ads"); }}>
        {client.adsStatus === "ATIVO" ? "Pausar ads" : "Ativar ads"}
      </Button>
      {client.status !== "PERDIDO" && (
        client.isPaused ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => togglePause(client.id, false))}>
            Retomar cliente
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => { setError(null); setPauseReason(""); setModal("pausar"); }}>
            Pausar cliente
          </Button>
        )
      )}
      {canMoveStatus && client.status !== "PERDIDO" && (
        <Button size="sm" variant="danger" onClick={() => { setError(null); setModal("perdido"); }}>
          Marcar perdido
        </Button>
      )}

      {/* Saúde */}
      <Modal open={modal === "saude"} onClose={() => setModal(null)} title="Alterar saúde da conta">
        <div className="space-y-4">
          <Field label="Nova saúde">
            <Select value={health} onChange={(e) => setHealth(e.target.value as typeof health)}>
              {Object.entries(HEALTH_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={health === "CRITICO" ? "Motivo (obrigatório para CRÍTICO)" : "Motivo"}>
            <Textarea
              value={healthReason}
              onChange={(e) => setHealthReason(e.target.value)}
              placeholder="O que mudou na conta?"
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              disabled={pending}
              onClick={() => run(() => changeClientHealth(client.id, health, healthReason))}
            >
              {pending ? "Salvando..." : "Salvar saúde"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Perdido */}
      <Modal open={modal === "perdido"} onClose={() => setModal(null)} title="Marcar cliente como perdido">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Esta ação move o cliente para <strong>PERDIDO</strong> e registra o churn no histórico.
          </p>
          <Field label="Motivo do churn *">
            <Textarea
              value={churnReason}
              onChange={(e) => setChurnReason(e.target.value)}
              placeholder="Por que o cliente saiu?"
            />
          </Field>
          <Field label="Data da perda *">
            <Input type="date" value={churnDate} onChange={(e) => setChurnDate(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => markClientLost(client.id, churnReason, churnDate))}
            >
              {pending ? "Salvando..." : "Confirmar perda"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pausar */}
      <Modal open={modal === "pausar"} onClose={() => setModal(null)} title="Pausar cliente">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            O cliente fica <strong>pausado</strong> (em espera) sem sair da etapa atual da esteira. É só retomar depois.
          </p>
          <Field label="Motivo (opcional)">
            <Textarea
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Ex.: cliente pediu para pausar durante reforma."
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => run(() => togglePause(client.id, true, pauseReason))}>
              {pending ? "Salvando..." : "Pausar cliente"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Ads */}
      <ConfirmDialog
        open={modal === "ads"}
        onClose={() => setModal(null)}
        onConfirm={() => run(() => toggleAdsStatus(client.id, nextAds))}
        title={nextAds === "PAUSADO" ? "Pausar anúncios?" : "Ativar anúncios?"}
        description={`O status de anúncios do cliente passará para ${nextAds === "PAUSADO" ? "PAUSADO" : "ATIVO"}.`}
        confirmLabel={nextAds === "PAUSADO" ? "Pausar ads" : "Ativar ads"}
        pending={pending}
      />
    </div>
  );
}

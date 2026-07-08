"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  addMonitoredConversation,
  requestWhatsAppConnection,
  simulateConversationSummary,
  toggleMonitoredConversation,
  type ActionState,
} from "../actions";

type Option = { id: string; name: string };

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, onOk?: () => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setNotice(result.success ?? null);
        onOk?.();
        router.refresh();
      }
    });
  };
  return { pending, error, notice, run };
}

export function ConnectButton() {
  const { pending, error, notice, run } = useAction();
  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={() => run(() => requestWhatsAppConnection())}>
        Conectar WhatsApp
      </Button>
      {notice && <Alert tone="green">{notice}</Alert>}
      {error && <Alert tone="amber">{error}</Alert>}
    </div>
  );
}

export function AddConversationForm({ clients }: { clients: Option[] }) {
  const { pending, error, notice, run } = useAction();
  const [name, setName] = useState("");
  const [type, setType] = useState("GRUPO");
  const [clientId, setClientId] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nome do grupo/contato" className="min-w-48 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Grupo Ótica Kamyly x B2C" />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="GRUPO">Grupo</option>
            <option value="CONTATO">Contato</option>
          </Select>
        </Field>
        <Field label="Cliente vinculado">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={pending || name.trim().length < 2}
          onClick={() => run(() => addMonitoredConversation(name, type, clientId || null), () => setName(""))}
        >
          + Adicionar
        </Button>
      </div>
      {notice && <Alert tone="green">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function ToggleConversationButton({ conversationId, isActive }: { conversationId: string; isActive: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => toggleMonitoredConversation(conversationId))}>
      {pending ? "..." : isActive ? "Pausar" : "Reativar"}
    </Button>
  );
}

export function SimulateSummaryForm({
  conversations,
  clients,
}: {
  conversations: Option[];
  clients: Option[];
}) {
  const { pending, error, notice, run } = useAction();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [clientId, setClientId] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Conversa (opcional)">
          <Select value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
            <option value="">Simulação manual</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente (opcional)">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Cole o texto da conversa (voluntariamente — sem senhas/dados sensíveis)">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-40 font-mono text-xs"
          placeholder={"Cliente: Achei o valor alto esse mês...\nVocê: Entendo! Vou te mostrar os resultados...\nCliente: Pode enviar o relatório até sexta?"}
        />
      </Field>
      <Button
        disabled={pending || text.trim().length < 20}
        onClick={() => run(() => simulateConversationSummary(conversationId || null, text, clientId || null), () => setText(""))}
      >
        {pending ? "Analisando..." : "Gerar resumo"}
      </Button>
      {notice && <Alert tone="green">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { Document } from "@/db/schema";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { saveDocument, toggleArchiveDocument, type ActionState } from "./actions";

export const DOC_TYPE_LABELS: Record<string, string> = {
  WIKI: "Wiki",
  PROCESSO: "Processo",
  CONTRATO: "Contrato",
  BRIEFING: "Briefing",
  RELATORIO: "Relatório",
  PLAYBOOK: "Playbook",
  OUTRO: "Outro",
};

export function DocumentFormButton({
  document: doc,
  clients,
  defaultClientId,
  autoOpen,
}: {
  document?: Document;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const router = useRouter();
  const action = saveDocument.bind(null, doc?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.success) {
        setOpen(false);
        if (result.documentId && !doc) router.push(`/documentos/${result.documentId}`);
        else router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <>
      <Button size={doc ? "sm" : "md"} variant={doc ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {doc ? "Editar" : "+ Novo documento"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={doc ? "Editar documento" : "Novo documento"} wide>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Título *" className="sm:col-span-2">
              <Input name="title" required defaultValue={doc?.title} />
            </Field>
            <Field label="Tipo">
              <Select name="type" defaultValue={doc?.type ?? "WIKI"}>
                {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Cliente vinculado (opcional)">
            <Select name="clientId" defaultValue={doc?.clientId ?? defaultClientId ?? ""}>
              <option value="">— Nenhum —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Conteúdo (markdown)">
            <Textarea name="content" defaultValue={doc?.content ?? ""} className="min-h-64 font-mono text-xs" placeholder="# Título&#10;&#10;Conteúdo do documento..." />
          </Field>
          <p className="text-[11px] text-amber-500/80">
            🔐 Nunca cole senhas ou tokens aqui — credenciais vão para o Cofre de Acessos.
          </p>
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar documento"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ArchiveDocumentButton({ documentId, isArchived }: { documentId: string; isArchived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleArchiveDocument(documentId);
          router.refresh();
        })
      }
    >
      {pending ? "..." : isArchived ? "Restaurar" : "Arquivar"}
    </Button>
  );
}

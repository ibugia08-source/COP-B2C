"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { Document } from "@/db/schema";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { deleteDocument, saveDocument, toggleArchiveDocument, uploadDocument, type ActionState } from "./actions";

export const DOC_TYPE_LABELS: Record<string, string> = {
  WIKI: "Wiki",
  PROCESSO: "Processo",
  CONTRATO: "Contrato",
  BRIEFING: "Briefing",
  RELATORIO: "Relatório",
  PLAYBOOK: "Playbook",
  PDF: "PDF",
  DOCX: "DOCX",
  GOOGLE_DOC: "Google Docs",
  GOOGLE_SHEET: "Google Sheets",
  GOOGLE_SLIDES: "Google Slides",
  DRIVE_FOLDER: "Pasta do Drive",
  LINK_EXTERNO: "Link externo",
  IMAGEM: "Imagem",
  OUTRO: "Outro",
};

export const DOC_SOURCE_LABELS: Record<string, string> = {
  INTERNAL: "Documento interno (texto)",
  UPLOAD: "Upload de arquivo",
  GOOGLE_DRIVE: "Google Drive",
  EXTERNAL_LINK: "Link externo",
};

type Option = { id: string; name: string };

export function DocumentFormButton({
  document: doc,
  clients,
  tasks,
  assets,
  defaultClientId,
  defaultTaskId,
  defaultAssetId,
  driveConnected,
  autoOpen,
}: {
  document?: Document;
  clients: Option[];
  tasks?: Option[];
  assets?: Option[];
  defaultClientId?: string;
  defaultTaskId?: string;
  defaultAssetId?: string;
  driveConnected?: boolean;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [source, setSource] = useState<string>(doc?.sourceType ?? "INTERNAL");
  const router = useRouter();

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const src = String(formData.get("sourceType") ?? "INTERNAL");
      // Upload usa action multipart própria (apenas na criação)
      const result =
        src === "UPLOAD" && !doc
          ? await uploadDocument(prev, formData)
          : await saveDocument(doc?.id ?? null, prev, formData);
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

          <Field label="Origem">
            <Select
              name="sourceType"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={!!doc && doc.sourceType === "UPLOAD"}
            >
              {Object.entries(DOC_SOURCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>

          {source === "INTERNAL" && (
            <Field label="Conteúdo (markdown)">
              <Textarea name="content" defaultValue={doc?.content ?? ""} className="min-h-56 font-mono text-xs" placeholder="# Título&#10;&#10;Conteúdo do documento..." />
            </Field>
          )}

          {source === "EXTERNAL_LINK" && (
            <Field label="Link externo (http/https) *">
              <Input name="fileUrl" type="url" defaultValue={doc?.fileUrl ?? ""} placeholder="https://..." />
            </Field>
          )}

          {source === "GOOGLE_DRIVE" && (
            <div className="space-y-2">
              <Field label="Link do Google Drive / Docs *">
                <Input name="googleDriveUrl" type="url" defaultValue={doc?.googleDriveUrl ?? ""} placeholder="https://docs.google.com/... ou https://drive.google.com/..." />
              </Field>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!driveConnected}
                  title={driveConnected ? "Selecionar do Drive" : "Conecte o Google Drive em Configurações → Integrações"}
                >
                  Selecionar do Drive
                </Button>
                {!driveConnected && (
                  <span className="text-[11px] text-amber-500/80">
                    Drive não conectado — cole o link manualmente (Configurações → Integrações).
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                O COP guarda apenas o link e os metadados. Quem abrir o arquivo precisa ter permissão no Google Drive.
              </p>
            </div>
          )}

          {source === "UPLOAD" &&
            (doc ? (
              <p className="text-[11px] text-zinc-500">O arquivo enviado não pode ser trocado aqui — crie um novo documento para substituí-lo.</p>
            ) : (
              <Field label="Arquivo *">
                <input
                  name="file"
                  type="file"
                  required
                  className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200"
                />
              </Field>
            ))}

          <Field label="Descrição (opcional)">
            <Input name="description" defaultValue={doc?.description ?? ""} placeholder="Resumo do documento" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Cliente (opcional)">
              <Select name="clientId" defaultValue={doc?.clientId ?? defaultClientId ?? ""}>
                <option value="">— Nenhum —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tarefa (opcional)">
              <Select name="taskId" defaultValue={doc?.taskId ?? defaultTaskId ?? ""}>
                <option value="">— Nenhuma —</option>
                {(tasks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ativo digital (opcional)">
              <Select name="digitalAssetId" defaultValue={doc?.digitalAssetId ?? defaultAssetId ?? ""}>
                <option value="">— Nenhum —</option>
                {(assets ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="text-[11px] text-amber-500/80">
            🔐 Nunca cole senhas ou tokens aqui — credenciais vão para o Banco de Ativos Digitais.
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

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>Excluir</Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteDocument(documentId);
            router.push("/documentos");
          })
        }
      >
        {pending ? "..." : "Confirmar"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
    </span>
  );
}

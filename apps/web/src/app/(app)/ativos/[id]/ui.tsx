"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SECRET_TYPES } from "@/db/schema";
import { SECRET_TYPE_LABEL } from "@/lib/labels";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import {
  addAssetComment,
  addSecret,
  archiveAsset,
  changeAssetStatus,
  deleteAttachment,
  deleteSecret,
  duplicateAsset,
  markAssetChecked,
  revealSecret,
  updateSecret,
  uploadAttachment,
  type ActionState,
} from "../actions";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        onOk?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run, setError, router, startTransition };
}

// ---------------------------------------------------------------------------
// Status + checagem + arquivar + duplicar
// ---------------------------------------------------------------------------

type StatusOption = { value: string; label: string };

export function AssetHeaderControls({
  assetId,
  status,
  statusOptions,
  isArchived,
  canUpdate,
  canArchive,
  canCreate,
}: {
  assetId: string;
  status: string;
  statusOptions: StatusOption[];
  isArchived: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canCreate: boolean;
}) {
  const { pending, error, run } = useAction();
  const [statusModal, setStatusModal] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [archiveModal, setArchiveModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>(status);
  const [reason, setReason] = useState("");
  const [reviewDays, setReviewDays] = useState("7");
  const [copySecrets, setCopySecrets] = useState(false);

  const blockingReason = newStatus === "BLOQUEADA" && reason.trim().length < 3;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdate && !isArchived && (
        <>
          <Button size="sm" variant="secondary" onClick={() => { setNewStatus(status); setReason(""); setStatusModal(true); }}>
            Alterar status
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => markAssetChecked(assetId, 30))}>
            <Icon name="check" /> Registrar checagem
          </Button>
        </>
      )}
      {canCreate && (
        <Button size="sm" variant="secondary" onClick={() => { setCopySecrets(false); setDuplicateModal(true); }}>
          Duplicar
        </Button>
      )}
      {canArchive && (
        <Button size="sm" variant={isArchived ? "secondary" : "ghost"} onClick={() => setArchiveModal(true)}>
          {isArchived ? "Restaurar" : "Arquivar"}
        </Button>
      )}
      {error && <Alert>{error}</Alert>}

      <Modal open={statusModal} onClose={() => setStatusModal(false)} title="Alterar status do ativo">
        <div className="space-y-4">
          <Field label="Novo status">
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {!statusOptions.some((o) => o.value === newStatus) && <option value={newStatus}>{newStatus}</option>}
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {newStatus === "SENDO_ESQUENTADA" && (
            <Field label="Próxima revisão (dias)">
              <Input type="number" min="1" value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} />
            </Field>
          )}
          <Field label={newStatus === "BLOQUEADA" ? "Motivo do bloqueio *" : "Motivo"}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por que o status mudou?" />
          </Field>
          {blockingReason && <p className="text-[11px] text-amber-500">Bloquear exige um motivo (mínimo 3 caracteres).</p>}
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusModal(false)}>Cancelar</Button>
            <Button
              disabled={pending || blockingReason}
              onClick={() =>
                run(
                  () => changeAssetStatus(assetId, newStatus, reason, { nextReviewDays: Number(reviewDays) }),
                  () => setStatusModal(false),
                )
              }
            >
              {pending ? "Salvando..." : "Alterar status"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={duplicateModal} onClose={() => setDuplicateModal(false)} title="Duplicar ativo">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Uma cópia do ativo será criada. Por segurança, os segredos <strong>não</strong> são copiados
            automaticamente — confirme abaixo se quiser copiá-los.
          </p>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={copySecrets}
              onChange={(e) => setCopySecrets(e.target.checked)}
              className="accent-emerald-500"
            />
            Copiar também os segredos criptografados (fica registrado na auditoria)
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDuplicateModal(false)}>Cancelar</Button>
            <Button
              disabled={pending}
              onClick={() => run(() => duplicateAsset(assetId, copySecrets), () => setDuplicateModal(false))}
            >
              {pending ? "Duplicando..." : "Duplicar ativo"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={archiveModal}
        onClose={() => setArchiveModal(false)}
        onConfirm={() => run(() => archiveAsset(assetId), () => setArchiveModal(false))}
        title={isArchived ? "Restaurar ativo?" : "Arquivar ativo?"}
        description={isArchived ? "O ativo volta a aparecer nas listagens." : "O ativo sai das listagens padrão, mas nada é apagado."}
        confirmLabel={isArchived ? "Restaurar" : "Arquivar"}
        danger={!isArchived}
        pending={pending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credenciais
// ---------------------------------------------------------------------------

// Nada do valor do segredo (nem máscara) chega ao cliente antes de revelar —
// a listagem mostra apenas metadados; a máscara persistida foi removida (P0.6).
type SecretMeta = {
  id: string;
  secretType: string;
  label: string;
  lastRevealedAt: string | null;
};

function SecretRow({
  secret,
  canReveal,
  canCopy,
  canUpdate,
  canDelete,
}: {
  secret: SecretMeta;
  canReveal: boolean;
  canCopy: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { pending, error, run, setError, startTransition, router } = useAction();
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(secret.label);
  const [editValue, setEditValue] = useState("");

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }
  function hide() {
    clearHideTimer();
    setValue(null);
  }
  // segurança: o valor revelado some sozinho após 30s (anti shoulder-surfing)
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  function doReveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealSecret(secret.id, "reveal");
      if (result.error) setError(result.error);
      else {
        setValue(result.value ?? "");
        clearHideTimer();
        hideTimer.current = setTimeout(() => setValue(null), 30_000);
      }
      router.refresh(); // atualiza auditoria/lastRevealedAt
    });
  }

  function doCopy() {
    setError(null);
    startTransition(async () => {
      const result = await revealSecret(secret.id, "copy");
      if (result.error) setError(result.error);
      else {
        await navigator.clipboard.writeText(result.value ?? "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{secret.label}</p>
          <p className="text-xs text-zinc-500">
            {SECRET_TYPE_LABEL[secret.secretType] ?? secret.secretType}
            {secret.lastRevealedAt && ` · última revelação: ${new Date(secret.lastRevealedAt).toLocaleString("pt-BR")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {value !== null ? (
            <>
              <code className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-emerald-300">{value}</code>
              <button type="button" className="text-xs text-zinc-500 hover:text-white" onClick={hide}>
                ocultar
              </button>
              <span className="text-[10px] text-amber-500/80" title="Por segurança, o valor some sozinho">oculta em 30s</span>
            </>
          ) : (
            <code className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-500">••••••••</code>
          )}
          {canReveal && value === null && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={doReveal}>
              <Icon name="eye" /> Revelar
            </Button>
          )}
          {canCopy && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={doCopy}>
              {copied ? (
                <><Icon name="check" /> copiado</>
              ) : (
                <><Icon name="copy" /> Copiar</>
              )}
            </Button>
          )}
          {canUpdate && (
            <Button size="sm" variant="ghost" onClick={() => { setEditLabel(secret.label); setEditValue(""); setEditOpen(true); }}>
              Editar
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)}>
              Excluir
            </Button>
          )}
        </div>
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Editar — ${secret.label}`}>
        <div className="space-y-4">
          <Field label="Rótulo">
            <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
          </Field>
          <Field label="Novo valor (deixe vazio para manter o atual)">
            <Input type="password" autoComplete="new-password" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => run(() => updateSecret(secret.id, editLabel, editValue), () => setEditOpen(false))}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => run(() => deleteSecret(secret.id), () => setDeleteOpen(false))}
        title={`Excluir segredo "${secret.label}"?`}
        description="O valor criptografado será removido permanentemente."
        confirmLabel="Excluir"
        danger
        pending={pending}
      />
    </div>
  );
}

export function SecretsSection({
  assetId,
  secrets,
  canReveal,
  canCopy,
  canCreate,
  canUpdate,
  canDelete,
}: {
  assetId: string;
  secrets: SecretMeta[];
  canReveal: boolean;
  canCopy: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { pending, error, run } = useAction();
  const [addOpen, setAddOpen] = useState(false);
  const [type, setType] = useState("PASSWORD");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  return (
    <div className="space-y-3">
      <Alert tone="amber">
        <Icon name="lock" /> Os valores são criptografados (AES-256-GCM) e só saem do servidor via “Revelar”/“Copiar”.
        Toda revelação fica registrada na auditoria com usuário, data e IP.
      </Alert>

      {secrets.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhuma credencial cadastrada para este ativo.</p>
      )}
      {secrets.map((s) => (
        <SecretRow
          key={s.id}
          secret={s}
          canReveal={canReveal}
          canCopy={canCopy}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ))}

      {canCreate && (
        <>
          <Button size="sm" variant="secondary" onClick={() => { setLabel(""); setValue(""); setAddOpen(true); }}>
            + Adicionar segredo
          </Button>
          <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Novo segredo">
            <div className="space-y-4">
              <Field label="Tipo">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {SECRET_TYPES.map((t) => (
                    <option key={t} value={t}>{SECRET_TYPE_LABEL[t]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Rótulo *">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Senha do BM principal" />
              </Field>
              <Field label="Valor *">
                <Input type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
              {error && <Alert>{error}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button
                  disabled={pending}
                  onClick={() => run(() => addSecret(assetId, type, label, value), () => setAddOpen(false))}
                >
                  {pending ? "Criptografando..." : "Salvar criptografado"}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

export function AttachmentUpload({ assetId }: { assetId: string }) {
  const { pending, error, run } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-emerald-600 ${pending ? "opacity-60" : ""}`}>
        <Icon name="outbox" /> {pending ? "Enviando..." : "Enviar anexo"}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            run(() => uploadAttachment(assetId, fd), () => {
              if (inputRef.current) inputRef.current.value = "";
            });
          }}
        />
      </label>
      <span className="ml-2 text-[11px] text-zinc-500">imagens, PDF, DOCX, ZIP, RAR, CSV, JSON... (máx. 25MB)</span>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </div>
  );
}

export function DeleteAttachmentButton({ attachmentId, fileName }: { attachmentId: string; fileName: string }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Remover</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => run(() => deleteAttachment(attachmentId), () => setOpen(false))}
        title={`Remover anexo "${fileName}"?`}
        confirmLabel="Remover"
        danger
        pending={pending}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------

const COMMENT_TYPES = [
  ["COMENTARIO", "Comentário"],
  ["FEEDBACK", "Feedback"],
  ["ANALISE", "Análise"],
  ["ALERTA", "Alerta"],
] as const;

export function AssetCommentForm({ assetId }: { assetId: string }) {
  const { pending, error, run } = useAction();
  const [content, setContent] = useState("");
  const [type, setType] = useState("COMENTARIO");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAssetComment(assetId, content, type), () => setContent(""));
      }}
    >
      <div className="flex gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-36">
          {COMMENT_TYPES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Badge tone="zinc">diário operacional</Badge>
      </div>
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Registro do dia: análise enviada, documentos solicitados, conta reativada..." />
      {error && <Alert>{error}</Alert>}
      <Button size="sm" type="submit" disabled={pending || !content.trim()}>
        {pending ? "Salvando..." : "Registrar"}
      </Button>
    </form>
  );
}

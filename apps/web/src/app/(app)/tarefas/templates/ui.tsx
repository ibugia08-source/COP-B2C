"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { TaskTemplate } from "@/db/schema";
import { PIPELINE_STAGE_META, TASK_TYPE_META } from "@/lib/labels";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { applyTemplateToClientAction, saveTemplate, toggleTemplate, type ActionState } from "./actions";

function itemsToRaw(t?: TaskTemplate): string {
  if (!t) return "";
  return t.items
    .map((i) => [i.title, i.dueOffsetDays != null ? `D+${i.dueOffsetDays}` : null, i.role].filter(Boolean).join("; "))
    .join("\n");
}

export function TemplateEditor({
  template,
  canEdit,
}: {
  template?: TaskTemplate;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = saveTemplate.bind(null, template?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  if (!canEdit) return null;
  return (
    <>
      <Button size="sm" variant={template ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {template ? "Editar" : "+ Novo template"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={template ? `Editar — ${template.name}` : "Novo template"} wide>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome *">
              <Input name="name" required defaultValue={template?.name} />
            </Field>
            <Field label="Slug *">
              <Input name="slug" required defaultValue={template?.slug} placeholder="integracao-meta" />
            </Field>
            <Field label="Tipo de tarefa">
              <Select name="taskType" defaultValue={template?.taskType ?? "OPERACIONAL"}>
                {Object.entries(TASK_TYPE_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Etapa do pipeline (dispara automação)">
              <Select name="pipelineStage" defaultValue={template?.pipelineStage ?? ""}>
                <option value="">— Nenhuma —</option>
                {Object.entries(PIPELINE_STAGE_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descrição">
            <Input name="description" defaultValue={template?.description ?? ""} />
          </Field>
          <Field label="Itens (um por linha: Título; D+3; GESTOR)">
            <Textarea
              name="itemsRaw"
              required
              defaultValue={itemsToRaw(template)}
              className="min-h-48 font-mono text-xs"
              placeholder={"Solicitar acessos; D+1; GESTOR\nRevisar briefing; D+2; ESTRATEGISTA"}
            />
          </Field>
          <p className="text-[11px] text-zinc-500">
            Funções aceitas: GESTOR, ESTRATEGISTA, SOCIAL_MEDIA, DESIGNER. Prazo relativo: D+N.
          </p>
          {state.error && <Alert>{state.error}</Alert>}
          {state.success && <Alert tone="green">{state.success}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar template"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function TemplateRowActions({
  template,
  clients,
  canEdit,
  canApply,
}: {
  template: TaskTemplate;
  clients: { id: string; name: string }[];
  canEdit: boolean;
  canApply: boolean;
}) {
  const router = useRouter();
  const [applyOpen, setApplyOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [asChecklist, setAsChecklist] = useState(false);
  const [feedback, setFeedback] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      {canApply && (
        <Button size="sm" onClick={() => { setFeedback(null); setApplyOpen(true); }}>
          Aplicar a cliente
        </Button>
      )}
      <TemplateEditor template={template} canEdit={canEdit} />
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleTemplate(template.id);
              router.refresh();
            })
          }
        >
          {template.isActive ? "Desativar" : "Ativar"}
        </Button>
      )}

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title={`Aplicar "${template.name}"`}>
        <div className="space-y-4">
          <Field label="Cliente *">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={asChecklist}
              onChange={(e) => setAsChecklist(e.target.checked)}
              className="accent-emerald-500"
            />
            Criar como UMA tarefa com checklist (em vez de uma tarefa por item)
          </label>
          {feedback?.error && <Alert>{feedback.error}</Alert>}
          {feedback?.success && <Alert tone="green">{feedback.success}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>Fechar</Button>
            <Button
              disabled={pending || !clientId}
              onClick={() =>
                startTransition(async () => {
                  const result = await applyTemplateToClientAction(template.slug, clientId, asChecklist);
                  setFeedback(result);
                  if (result.success) router.refresh();
                })
              }
            >
              {pending ? "Aplicando..." : "Aplicar template"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function TemplateBadges({ template }: { template: TaskTemplate }) {
  return (
    <span className="space-x-1">
      <Badge tone="blue">{template.items.length} itens</Badge>
      {template.pipelineStage && (
        <Badge tone="purple">{PIPELINE_STAGE_META[template.pipelineStage]?.label}</Badge>
      )}
      {!template.isActive && <Badge tone="zinc">inativo</Badge>}
    </span>
  );
}

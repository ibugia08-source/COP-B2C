"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { FormTemplate } from "@/db/schema";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import {
  deleteTemplate,
  saveTemplate,
  submitForm,
  toggleTemplateActive,
  type ActionState,
} from "./actions";
import { FIELD_TYPES, typeHasOptions, type FieldDef, type FieldType } from "./field-types";
import { FormFieldInputs } from "./form-fields";

// ---------------------------------------------------------------------------
// Preenchimento interno (membro logado, opcionalmente vinculado a um cliente)
// ---------------------------------------------------------------------------

export function FillFormButton({
  template,
  clients,
}: {
  template: FormTemplate;
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = submitForm.bind(null, template.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.success) {
        setTimeout(() => setOpen(false), 900);
        router.refresh();
      }
      return result;
    },
    {},
  );

  const fields = template.fields as unknown as FieldDef[];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Preencher</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={template.name} wide>
        <form action={formAction} className="space-y-4">
          <Field label="Cliente vinculado (opcional)">
            <Select name="__clientId" defaultValue="">
              <option value="">— Nenhum —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <FormFieldInputs fields={fields} />
          {state.error && <Alert>{state.error}</Alert>}
          {state.success && <Alert tone="green">{state.success}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Enviando..." : "Enviar formulário"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Construtor de formulários (criar/editar template) — admin
// ---------------------------------------------------------------------------

type BuilderField = { name?: string; label: string; type: FieldType; required: boolean; optionsText: string };

function toBuilderFields(template?: FormTemplate): BuilderField[] {
  if (!template) return [{ label: "", type: "text", required: false, optionsText: "" }];
  return (template.fields as unknown as FieldDef[]).map((f) => ({
    name: f.name,
    label: f.label,
    type: f.type,
    required: !!f.required,
    optionsText: (f.options ?? []).join("\n"),
  }));
}

export function TemplateBuilderButton({ template }: { template?: FormTemplate }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [fields, setFields] = useState<BuilderField[]>(() => toBuilderFields(template));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await saveTemplate(prev, fd);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  const update = (i: number, patch: Partial<BuilderField>) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const add = () => setFields((prev) => [...prev, { label: "", type: "text", required: false, optionsText: "" }]);
  const remove = (i: number) => setFields((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) =>
    setFields((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });

  // serializa para o hidden input lido por saveTemplate
  const serialized = fields
    .filter((f) => f.label.trim())
    .map((f) => ({
      name: f.name,
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      options: typeHasOptions(f.type)
        ? f.optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
        : undefined,
    }));

  return (
    <>
      <Button
        size={template ? "sm" : "md"}
        variant={template ? "secondary" : "primary"}
        onClick={() => { setFields(toBuilderFields(template)); setOpen(true); }}
      >
        {template ? "Editar" : "+ Novo formulário"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={template ? `Editar — ${template.name}` : "Novo formulário"} wide>
        <form action={formAction} className="space-y-4">
          {template && <input type="hidden" name="id" value={template.id} />}
          <input type="hidden" name="fields" value={JSON.stringify(serialized)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome do formulário *">
              <Input name="name" required defaultValue={template?.name} placeholder="Ex.: Onboarding do cliente" />
            </Field>
            <Field label="Descrição">
              <Input name="description" defaultValue={template?.description ?? ""} placeholder="Aparece no topo do formulário" />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-zinc-500">Campos</p>
            {fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_auto]">
                  <Input placeholder="Pergunta / rótulo" value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
                  <Select value={f.type} onChange={(e) => update(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-300">
                    <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} className="accent-emerald-500" />
                    Obrigatório
                  </label>
                </div>
                {typeHasOptions(f.type) && (
                  <Textarea placeholder="Uma opção por linha" value={f.optionsText} onChange={(e) => update(i, { optionsText: e.target.value })} />
                )}
                <div className="flex items-center gap-3 text-xs">
                  <button type="button" onClick={() => move(i, -1)} className="text-zinc-500 hover:text-zinc-200" aria-label="Mover para cima">↑</button>
                  <button type="button" onClick={() => move(i, 1)} className="text-zinc-500 hover:text-zinc-200" aria-label="Mover para baixo">↓</button>
                  <button type="button" onClick={() => remove(i)} className="ml-auto text-red-400 hover:text-red-300">Remover campo</button>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={add}>+ Adicionar campo</Button>
          </div>

          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar formulário"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ações admin no card do formulário (editar, ativar/desativar, excluir, link)
// ---------------------------------------------------------------------------

export function CardAdminActions({ template, publicUrl }: { template: FormTemplate; publicUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<ActionState>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.error) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
      <TemplateBuilderButton template={template} />
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => toggleTemplateActive(template.id))}>
        {template.isActive ? "Desativar" : "Ativar"}
      </Button>
      {confirmDel ? (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deleteTemplate(template.id))}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>Cancelar</Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { setErr(null); setConfirmDel(true); }}>
          Excluir
        </Button>
      )}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(publicUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs text-zinc-400 transition hover:text-emerald-300"
      >
        {copied ? "Link copiado!" : "Copiar link público"}
      </button>
      {err && <p className="w-full text-xs text-red-500">{err}</p>}
    </div>
  );
}

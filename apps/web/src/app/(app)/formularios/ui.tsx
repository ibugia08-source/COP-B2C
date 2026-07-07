"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { FormTemplate } from "@/db/schema";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { submitForm, type ActionState } from "./actions";

type FieldDef = { name: string; label: string; type: string; required?: boolean; options?: string[] };

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
          {fields.map((f) => (
            <Field key={f.name} label={`${f.label}${f.required ? " *" : ""}`}>
              {f.type === "textarea" ? (
                <Textarea name={`f_${f.name}`} required={f.required} />
              ) : f.type === "select" ? (
                <Select name={`f_${f.name}`} required={f.required} defaultValue="">
                  <option value="">Selecione...</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : (
                <Input name={`f_${f.name}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} required={f.required} />
              )}
            </Field>
          ))}
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

"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { FormFieldInputs } from "@/app/(app)/formularios/form-fields";
import type { FieldDef } from "@/app/(app)/formularios/field-types";
import { submitPublicForm, type PublicFormState } from "./actions";

export function PublicForm({
  slug,
  name,
  description,
  fields,
}: {
  slug: string;
  name: string;
  description: string | null;
  fields: FieldDef[];
}) {
  const action = submitPublicForm.bind(null, slug);
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(action, {});

  if (state.success) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-semibold text-zinc-100">{name}</h1>
        <p className="text-emerald-400">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">{name}</h1>
        {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      </div>

      {/* honeypot anti-bot: humanos não veem, bots preenchem */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Seu nome">
          <Input name="__respName" placeholder="Nome" />
        </Field>
        <Field label="Seu e-mail">
          <Input name="__respEmail" type="email" placeholder="voce@email.com" />
        </Field>
      </div>

      <FormFieldInputs fields={fields} />

      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}

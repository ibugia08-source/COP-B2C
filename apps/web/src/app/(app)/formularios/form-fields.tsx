"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FieldDef } from "./field-types";

// Renderiza os inputs de um formulário a partir da definição de campos.
// Cada input usa name="f_<campo>" — o mesmo contrato lido por submitForm/submitPublicForm.
export function FormFieldInputs({ fields }: { fields: FieldDef[] }) {
  return (
    <>
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
          ) : f.type === "radio" ? (
            <div className="flex flex-col gap-1.5">
              {(f.options ?? []).map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                  <input type="radio" name={`f_${f.name}`} value={o} required={f.required} className="accent-emerald-500" />
                  {o}
                </label>
              ))}
            </div>
          ) : (
            <Input
              name={`f_${f.name}`}
              type={
                f.type === "number"
                  ? "number"
                  : f.type === "date"
                    ? "date"
                    : f.type === "email"
                      ? "email"
                      : f.type === "tel"
                        ? "tel"
                        : "text"
              }
              required={f.required}
            />
          )}
        </Field>
      ))}
    </>
  );
}

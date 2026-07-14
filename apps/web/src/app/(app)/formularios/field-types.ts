// Tipos e helpers compartilhados dos formulários (server + client, sem React).
// A definição de um campo é o que fica gravado no JSONB form_templates.fields.

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "radio";

export type FieldDef = {
  name: string; // chave de máquina (usada em form_submissions.data)
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // apenas para select/radio
};

export const FIELD_TYPES: { value: FieldType; label: string; hasOptions?: boolean }[] = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "email", label: "E-mail" },
  { value: "tel", label: "Telefone" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "select", label: "Lista suspensa", hasOptions: true },
  { value: "radio", label: "Múltipla escolha", hasOptions: true },
];

const FIELD_TYPE_VALUES = FIELD_TYPES.map((t) => t.value);

export function isFieldType(v: string): v is FieldType {
  return (FIELD_TYPE_VALUES as string[]).includes(v);
}

export function typeHasOptions(t: FieldType): boolean {
  return t === "select" || t === "radio";
}

/** Converte um texto livre em uma chave de máquina segura (snake_case, sem acento). */
export function slugify(input: string, fallback = "campo"): string {
  const s = input
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || fallback;
}

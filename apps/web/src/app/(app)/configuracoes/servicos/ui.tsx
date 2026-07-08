"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { AgencyService } from "@/db/schema";
import { TONE_CLASSES, type Tone } from "@/lib/labels";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { saveService, toggleFlag, toggleService, type ActionState } from "./actions";

const TONES: Tone[] = ["green", "amber", "red", "blue", "purple", "zinc", "cyan"];

export function ServiceFormButton({ service, canEdit }: { service?: AgencyService; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const action = saveService.bind(null, service?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  if (!canEdit) return null;
  return (
    <>
      <Button size={service ? "sm" : "md"} variant={service ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {service ? "Editar" : "+ Novo serviço"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={service ? `Editar — ${service.name}` : "Novo serviço da agência"}>
        <form action={formAction} className="space-y-4">
          <Field label="Nome do serviço *">
            <Input name="name" required defaultValue={service?.name} placeholder="Ex.: Tráfego pago, Landing pages" />
          </Field>
          <Field label="Descrição">
            <Input name="description" defaultValue={service?.description ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <Input name="category" defaultValue={service?.category ?? ""} placeholder="Ex.: Tráfego, Social, Criação" />
            </Field>
            <Field label="Cor">
              <Select name="color" defaultValue={service?.color ?? "blue"}>
                {TONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            Prévia da cor:
            {TONES.map((t) => (
              <span key={t} className={`inline-block h-3 w-3 rounded-full border ${TONE_CLASSES[t]}`} title={t} />
            ))}
          </div>
          {state.error && <Alert>{state.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar serviço"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ToggleServiceButton({ serviceId, isActive }: { serviceId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleService(serviceId);
          router.refresh();
        })
      }
    >
      {pending ? "..." : isActive ? "Desativar" : "Reativar"}
    </Button>
  );
}

export function FlagToggle({ flag, enabled }: { flag: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant={enabled ? "primary" : "secondary"}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await toggleFlag(flag);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "..." : enabled ? "Ligado" : "Desligado"}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}

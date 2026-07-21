"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { Goal } from "@/db/schema";
import { GOAL_STATUS_META } from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { deleteGoal, saveGoal, updateGoalProgress, type ActionState } from "./actions";

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  CLIENTES: "Clientes",
  CHURN: "Churn",
  SATISFACAO: "Satisfação",
  COMERCIAL: "Comercial",
  OPERACIONAL: "Operacional",
};
const SCOPE_LABELS: Record<string, string> = { AGENCIA: "Agência", GESTOR: "Gestor", CLIENTE: "Cliente" };

export function GoalFormButton({
  goal,
  users,
  canEdit,
}: {
  goal?: Goal;
  users: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = saveGoal.bind(null, goal?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  if (!canEdit) return null;
  return (
    <>
      <Button size={goal ? "sm" : "md"} variant={goal ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {goal ? "Editar" : "+ Nova meta"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={goal ? `Editar — ${goal.title}` : "Nova meta"} wide>
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Nome *" className="sm:col-span-2">
            <Input name="title" required defaultValue={goal?.title} />
          </Field>
          <Field label="Categoria">
            <Select name="category" defaultValue={goal?.category ?? "OPERACIONAL"}>
              {Object.entries(GOAL_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Meta *">
            <Input name="targetValue" type="number" step="0.01" required defaultValue={goal?.targetValue} />
          </Field>
          <Field label="Super meta">
            <Input name="superTargetValue" type="number" step="0.01" defaultValue={goal?.superTargetValue ?? ""} />
          </Field>
          <Field label="Mega meta">
            <Input name="megaTargetValue" type="number" step="0.01" defaultValue={goal?.megaTargetValue ?? ""} />
          </Field>
          <Field label="Valor atual">
            <Input name="currentValue" type="number" step="0.01" defaultValue={goal?.currentValue ?? 0} />
          </Field>
          <Field label="Unidade">
            <Input name="unit" defaultValue={goal?.unit ?? ""} placeholder="R$, clientes, %" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={goal?.status ?? "PLANEJADA"}>
              {Object.entries(GOAL_STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Escopo">
            <Select name="scope" defaultValue={goal?.scope ?? "AGENCIA"}>
              {Object.entries(SCOPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select name="ownerId" defaultValue={goal?.ownerId ?? ""}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Início do período">
            <Input name="periodStart" type="date" defaultValue={goal?.periodStart ?? ""} />
          </Field>
          <Field label="Fim do período">
            <Input name="periodEnd" type="date" defaultValue={goal?.periodEnd ?? ""} />
          </Field>
          <Field label="Descrição" className="sm:col-span-3">
            <Textarea name="description" defaultValue={goal?.description ?? ""} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-3">
            <input type="checkbox" name="autoProgress" defaultChecked={goal?.autoProgress} className="accent-emerald-500" />
            Progresso automático (calculado pelo sistema quando possível)
          </label>

          {state.error && <div className="sm:col-span-3"><Alert>{state.error}</Alert></div>}
          {state.success && <div className="sm:col-span-3"><Alert tone="green">{state.success}</Alert></div>}

          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar meta"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function GoalProgressControls({
  goal,
  canEdit,
  canDelete,
}: {
  goal: Goal;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(goal.currentValue));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit && !canDelete) return null;
  return (
    <div className="flex items-center gap-2">
      {canEdit && !goal.autoProgress && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateGoalProgress(goal.id, Number(value));
              if (result.error) setError(result.error);
              else router.refresh();
            });
          }}
        >
          <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 py-1 text-xs" />
          <Button size="sm" variant="secondary" type="submit" disabled={pending}>OK</Button>
        </form>
      )}
      {canDelete && (
        <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)}>Excluir</Button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            await deleteGoal(goal.id);
            setConfirmOpen(false);
            router.refresh();
          })
        }
        title={`Excluir meta "${goal.title}"?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        pending={pending}
      />
    </div>
  );
}

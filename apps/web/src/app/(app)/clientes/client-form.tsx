"use client";

import { useActionState } from "react";
import type { Client } from "@/db/schema";
import { ADS_META, AGENCY_BRAND_META, BUSINESS_MODEL_LABEL, HEALTH_META } from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { ActionState } from "./actions";

type UserOption = { id: string; name: string };

export function ClientForm({
  client,
  users,
  niches,
  action,
  submitLabel,
  defaultStage,
}: {
  client?: Client;
  users: UserOption[];
  niches: string[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  defaultStage?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  const userSelect = (name: string, value: string | null | undefined) => (
    <Select name={name} defaultValue={value ?? ""}>
      <option value="">— Não definido —</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </Select>
  );

  return (
    <form action={formAction} className="max-w-4xl space-y-6">
      {defaultStage && <input type="hidden" name="pipelineStage" value={defaultStage} />}
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="text-sm font-semibold text-zinc-300 sm:col-span-2 lg:col-span-3">Identificação</h2>
        <Field label="Nome do cliente *" htmlFor="name">
          <Input id="name" name="name" required defaultValue={client?.name} placeholder="Ex.: Clínica Sorriso Prime" />
        </Field>
        <Field label="Razão social" htmlFor="legalName">
          <Input id="legalName" name="legalName" defaultValue={client?.legalName ?? ""} />
        </Field>
        <Field label="Nome fantasia/marca" htmlFor="brandName">
          <Input id="brandName" name="brandName" defaultValue={client?.brandName ?? ""} />
        </Field>
        <Field label="Empresa (bandeira) *" htmlFor="agencyBrand">
          <Select id="agencyBrand" name="agencyBrand" defaultValue={client?.agencyBrand ?? "B2C_GESTAO"}>
            {Object.entries(AGENCY_BRAND_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Modelo de negócio *" htmlFor="businessModel">
          <Select id="businessModel" name="businessModel" defaultValue={client?.businessModel ?? "NEGOCIO_LOCAL"}>
            {Object.entries(BUSINESS_MODEL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nicho" htmlFor="niche">
          <Input id="niche" name="niche" list="niche-options" defaultValue={client?.niche ?? ""} placeholder="Ex.: Odontologia" />
          <datalist id="niche-options">
            {niches.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Cidade" htmlFor="city">
          <Input id="city" name="city" defaultValue={client?.city ?? ""} />
        </Field>
        <Field label="UF" htmlFor="state">
          <Input id="state" name="state" maxLength={2} defaultValue={client?.state ?? ""} placeholder="SP" />
        </Field>
        <Field label="Data de entrada" htmlFor="startDate">
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={client?.startDate ? client.startDate.toISOString().slice(0, 10) : ""}
          />
        </Field>
        <Field label="Instagram" htmlFor="instagramUrl">
          <Input id="instagramUrl" name="instagramUrl" type="url" defaultValue={client?.instagramUrl ?? ""} placeholder="https://instagram.com/..." />
        </Field>
        <Field label="Site" htmlFor="websiteUrl">
          <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={client?.websiteUrl ?? ""} placeholder="https://..." />
        </Field>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-3">
        <h2 className="text-sm font-semibold text-zinc-300 sm:col-span-3">Decisor</h2>
        <Field label="Nome do decisor" htmlFor="decisionMakerName">
          <Input id="decisionMakerName" name="decisionMakerName" defaultValue={client?.decisionMakerName ?? ""} />
        </Field>
        <Field label="Telefone" htmlFor="decisionMakerPhone">
          <Input id="decisionMakerPhone" name="decisionMakerPhone" defaultValue={client?.decisionMakerPhone ?? ""} />
        </Field>
        <Field label="E-mail" htmlFor="decisionMakerEmail">
          <Input id="decisionMakerEmail" name="decisionMakerEmail" type="email" defaultValue={client?.decisionMakerEmail ?? ""} />
        </Field>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-zinc-300 sm:col-span-2">Saúde e anúncios</h2>
        <p className="text-[11px] text-zinc-500 sm:col-span-2">
          O status do cliente (Ativo, Em risco, Pausado, Perdido…) é definido automaticamente
          pela etapa na esteira, pela saúde e pela pausa — não é escolhido aqui.
        </p>
        <Field label="Saúde da conta" htmlFor="healthStatus">
          <Select id="healthStatus" name="healthStatus" defaultValue={client?.healthStatus ?? "ESTAVEL"}>
            {Object.entries(HEALTH_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status dos anúncios" htmlFor="adsStatus">
          <Select id="adsStatus" name="adsStatus" defaultValue={client?.adsStatus ?? "SEM_CAMPANHA"}>
            {Object.entries(ADS_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-3">
        <h2 className="text-sm font-semibold text-zinc-300 sm:col-span-3">Responsáveis</h2>
        <Field label="Gestor 1 (responsável principal)">{userSelect("trafficManager1Id", client?.trafficManager1Id)}</Field>
        <Field label="Gestor 2">{userSelect("trafficManager2Id", client?.trafficManager2Id)}</Field>
        <Field label="Estrategista">{userSelect("strategistId", client?.strategistId)}</Field>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <Field label="Observações" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={client?.notes ?? ""}
            placeholder="Contexto importante do cliente. Obrigatório quando a saúde for CRÍTICA."
          />
        </Field>
      </section>

      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="green">{state.success}</Alert>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
        </Button>
        <Button variant="secondary" href={client ? `/clientes/${client.id}` : "/clientes"}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

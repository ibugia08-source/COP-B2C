"use client";

import { useActionState } from "react";
import type { ClientOperationalProfile } from "@/db/schema";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { saveOperationalProfile, type ActionState } from "../actions";

export function OperationalProfileForm({
  clientId,
  profile,
  services,
}: {
  clientId: string;
  profile: ClientOperationalProfile | null;
  // serviços ativos do cadastro configurável da agência (Configurações → Serviços)
  services: { id: string; name: string }[];
}) {
  const action = saveOperationalProfile.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-4">
      <Field label="Serviços utilizados">
        <div className="flex flex-wrap gap-2">
          {services.length === 0 && (
            <p className="text-xs text-zinc-500">
              Nenhum serviço cadastrado — peça a um administrador para configurar em Configurações → Serviços.
            </p>
          )}
          {services.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 has-[:checked]:border-emerald-500 has-[:checked]:text-emerald-300"
            >
              <input
                type="checkbox"
                name="platforms"
                value={s.name}
                defaultChecked={profile?.platforms.includes(s.name)}
                className="accent-emerald-500"
              />
              {s.name}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Investimento médio diário (R$)" htmlFor="averageDailyBudget">
          <Input
            id="averageDailyBudget"
            name="averageDailyBudget"
            type="number"
            step="0.01"
            min="0"
            defaultValue={profile?.averageDailyBudget ?? ""}
          />
        </Field>
        <Field label="Objetivo com tráfego" htmlFor="campaignObjective">
          <Input
            id="campaignObjective"
            name="campaignObjective"
            defaultValue={profile?.campaignObjective ?? ""}
            placeholder="Ex.: Leads para avaliação"
          />
        </Field>
      </div>

      <Field label="Tipos de campanha (separados por vírgula)" htmlFor="campaignTypes">
        <Input
          id="campaignTypes"
          name="campaignTypes"
          defaultValue={profile?.campaignTypes.join(", ") ?? ""}
          placeholder="Leads, Remarketing, Conversão"
        />
      </Field>
      <Field label="Oferta principal" htmlFor="offerDescription">
        <Textarea id="offerDescription" name="offerDescription" defaultValue={profile?.offerDescription ?? ""} />
      </Field>
      <Field label="Funil" htmlFor="funnelNotes">
        <Textarea
          id="funnelNotes"
          name="funnelNotes"
          defaultValue={profile?.funnelNotes ?? ""}
          placeholder="Como o lead percorre o funil até a venda"
        />
      </Field>
      <Field label="Regras de atendimento" htmlFor="serviceRules">
        <Textarea id="serviceRules" name="serviceRules" defaultValue={profile?.serviceRules ?? ""} />
      </Field>
      <Field label="Briefing operacional" htmlFor="briefingText">
        <Textarea id="briefingText" name="briefingText" defaultValue={profile?.briefingText ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          name="monthlyMeetingRequired"
          defaultChecked={profile?.monthlyMeetingRequired}
          className="accent-emerald-500"
        />
        Reunião mensal obrigatória
      </label>

      {state.error && <Alert>{state.error}</Alert>}
      {state.success && <Alert tone="green">{state.success}</Alert>}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar perfil operacional"}
      </Button>
    </form>
  );
}

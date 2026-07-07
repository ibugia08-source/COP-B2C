import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { automationExecutionLogs, automationRules } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { AutomationToggle } from "./ui";

const TRIGGER_LABELS: Record<string, string> = {
  CLIENT_CREATED: "Cliente criado",
  CLIENT_STAGE_CHANGED: "Etapa do pipeline alterada",
  CLIENT_HEALTH_CHANGED: "Saúde do cliente alterada",
  CLIENT_MARKED_LOST: "Cliente marcado como perdido",
  TASK_CREATED: "Tarefa criada",
  TASK_DUE_SOON: "Tarefa vencendo",
  TASK_OVERDUE: "Tarefa vencida",
  TASK_STATUS_CHANGED: "Status de tarefa alterado",
  CREATIVE_REQUEST_CREATED: "Criativo solicitado",
  CREATIVE_STATUS_CHANGED: "Status de criativo alterado",
  RECEIVABLE_OVERDUE: "Cobrança vencida",
  CREDENTIAL_CREATED: "Credencial criada",
  FORM_SUBMITTED: "Formulário enviado",
};

const EXEC_TONES: Record<string, "green" | "red" | "zinc"> = {
  SUCESSO: "green",
  ERRO: "red",
  IGNORADA: "zinc",
};

export default async function AutomacoesPage() {
  const session = await requirePermission("automations.view");
  const canUpdate = hasPermission(session, "automations.update");

  const [rules, logs] = await Promise.all([
    db.query.automationRules.findMany({ orderBy: [asc(automationRules.name)] }),
    db.query.automationExecutionLogs.findMany({
      orderBy: [desc(automationExecutionLogs.executedAt)],
      with: { rule: true },
      limit: 50,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Automações"
        description="Regras gatilho → condição → ação. Falhas de automação nunca quebram a ação principal."
      />

      {rules.length === 0 ? (
        <EmptyState icon="⚡" title="Nenhuma automação cadastrada" description="Rode o seed para criar as automações padrão." />
      ) : (
        <Table
          minWidth="800px"
          head={
            <>
              <Th>Automação</Th>
              <Th>Gatilho</Th>
              <Th>Ações</Th>
              <Th>Escopo</Th>
              <Th>Status</Th>
              {canUpdate && <Th className="text-right"></Th>}
            </>
          }
        >
          {rules.map((r) => (
            <tr key={r.id} className={`hover:bg-zinc-900/60 ${r.enabled ? "" : "opacity-50"}`}>
              <Td>
                <p className="font-medium text-zinc-100">{r.name}</p>
                {r.conditions && (
                  <p className="text-[11px] text-zinc-500">
                    condição: {Object.entries(r.conditions).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </p>
                )}
              </Td>
              <Td><Badge tone="purple">{TRIGGER_LABELS[r.triggerType] ?? r.triggerType}</Badge></Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {(r.actions ?? []).map((a, i) => (
                    <Badge key={i} tone="blue">{a.type}</Badge>
                  ))}
                </div>
              </Td>
              <Td><Badge tone={r.scope === "GLOBAL" ? "amber" : "zinc"}>{r.scope}</Badge></Td>
              <Td>
                <Badge tone={r.enabled ? "green" : "zinc"}>{r.enabled ? "ATIVA" : "INATIVA"}</Badge>
              </Td>
              {canUpdate && (
                <Td><AutomationToggle ruleId={r.id} enabled={r.enabled} /></Td>
              )}
            </tr>
          ))}
        </Table>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Histórico de execução (últimas 50)</h2>
        {logs.length === 0 ? (
          <EmptyState icon="🕐" title="Nenhuma execução registrada ainda" description="As automações registram cada execução aqui — sucesso, erro ou ignorada." />
        ) : (
          <Table
            minWidth="700px"
            head={
              <>
                <Th>Quando</Th>
                <Th>Regra</Th>
                <Th>Resultado</Th>
                <Th>Detalhe</Th>
              </>
            }
          >
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-900/60">
                <Td className="whitespace-nowrap text-zinc-400">
                  {formatDate(l.executedAt)}{" "}
                  {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(l.executedAt)}
                </Td>
                <Td className="text-zinc-200">{l.rule.name}</Td>
                <Td><Badge tone={EXEC_TONES[l.status] ?? "zinc"}>{l.status}</Badge></Td>
                <Td className="max-w-md truncate text-xs text-zinc-500">
                  {l.error ?? (l.detail ? JSON.stringify(l.detail) : "—")}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}

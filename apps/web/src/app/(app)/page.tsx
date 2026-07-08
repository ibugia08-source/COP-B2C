import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { hasPermission, requireSession } from "@/lib/auth/guard";
import { getDashboardData, type DashboardFilters } from "@/lib/dashboard";
import { resolveDashboard } from "@/lib/dashboard-config";
import { METRIC_BY_KEY, METRIC_CATALOG, type MetricKey } from "@/lib/dashboard-metrics";
import { ASSET_STATUS_META, CLIENT_STATUS_META, TASK_STATUS_META } from "@/lib/labels";
import { Card, EmptyState, StatCard, Table, Td, Th } from "@/components/ui/primitives";
import { DashboardControls } from "./dashboard-controls";
import { DashboardFilterBar } from "./dashboard-filters";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const COLS_CLASS: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
};

function BarList({
  title,
  data,
  meta,
}: {
  title: string;
  data: { label: string; value: number }[];
  meta?: Record<string, { label: string }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem dados.</p>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 8).map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 truncate text-zinc-400" title={d.label}>
                {meta?.[d.label]?.label ?? d.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-zinc-300">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const canClients = hasPermission(session, "clients.view");
  const canTasks = hasPermission(session, "tasks.view");
  const canAssets = hasPermission(session, "digital_assets.view");
  const isAdmin = session.roles.some((r) => r === "OWNER" || r === "ADMIN");

  const dash = await resolveDashboard(session);

  // filtros: URL tem prioridade; senão usa os filtros padrão salvos pelo usuário
  const filters: DashboardFilters = {
    empresa: str(sp.empresa) ?? dash.filters.empresa,
    gestor: str(sp.gestor) ?? dash.filters.gestor,
    nicho: str(sp.nicho) ?? dash.filters.nicho,
  };

  const [data, allUsers, niches] = await Promise.all([
    getDashboardData(filters, session.userId),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    db.selectDistinct({ niche: clients.niche }).from(clients),
  ]);

  // métricas que o usuário tem permissão de ver (catálogo completo filtrado)
  const availableMetrics = METRIC_CATALOG.filter(
    (m) => !m.permission || hasPermission(session, m.permission),
  ).map((m) => m.key);

  const gridClass = COLS_CLASS[dash.columns] ?? COLS_CLASS[4];

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Olá, {session.name.split(" ")[0]}. Sua visão operacional
            {dash.personalized ? " personalizada" : ""}.
          </p>
        </div>
        <DashboardControls
          visible={dash.metrics}
          columns={dash.columns}
          available={availableMetrics}
          isAdmin={isAdmin}
        />
      </header>

      <DashboardFilterBar users={allUsers} niches={niches.map((n) => n.niche).filter((n): n is string => !!n)} />

      {/* Métricas personalizadas do usuário */}
      {availableMetrics.length === 0 ? (
        <EmptyState
          icon="🔒"
          title="Sem métricas disponíveis"
          description="Seu papel não tem acesso a métricas do dashboard. Fale com um administrador."
        />
      ) : dash.metrics.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Nenhuma métrica selecionada"
          description="Use “+ Adicionar métrica” para escolher o que acompanhar aqui."
        />
      ) : (
        <div className={`mb-6 grid gap-3 ${gridClass}`}>
          {dash.metrics.map((key: MetricKey) => {
            const def = METRIC_BY_KEY[key];
            return (
              <StatCard
                key={key}
                label={def.label}
                value={data.metrics[key] ?? 0}
                tone={def.tone}
                href={def.href}
                hint={def.hint}
              />
            );
          })}
        </div>
      )}

      {/* Gráficos analíticos (permanecem fixos, sem "Clientes por nicho") */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {canClients && (
          <>
            <BarList title="Clientes por status" data={data.clients.byStatus} meta={CLIENT_STATUS_META} />
            <BarList title="Clientes por gestor" data={data.clients.byGestor} />
          </>
        )}
        {canTasks && (
          <>
            <BarList title="Tarefas abertas por responsável" data={data.tasks.byAssignee} />
            <BarList title="Tarefas por status" data={data.tasks.byStatus} meta={TASK_STATUS_META} />
          </>
        )}
        {canAssets && <BarList title="Ativos por status" data={data.assets.byStatus} meta={ASSET_STATUS_META} />}
        {canClients && <BarList title="Evolução de churn (6 meses)" data={data.churnSeries} />}
      </div>

      {canTasks && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Carga de trabalho por colaborador</h2>
          {data.workload.length === 0 ? (
            <EmptyState icon="🧑‍💼" title="Sem carga registrada" description="Atribua tarefas, clientes e ativos aos colaboradores." />
          ) : (
            <Table
              minWidth="700px"
              head={
                <>
                  <Th>Colaborador</Th>
                  <Th>Tarefas abertas</Th>
                  <Th>Atrasadas</Th>
                  <Th>Urgentes</Th>
                  <Th>Clientes</Th>
                  <Th>Criativos</Th>
                  <Th>Ativos</Th>
                </>
              }
            >
              {data.workload.map((w) => (
                <tr key={w.name} className="hover:bg-zinc-900/60">
                  <Td className="font-medium text-zinc-200">{w.name}</Td>
                  <Td>{w.open}</Td>
                  <Td className={w.overdue ? "text-red-400" : ""}>{w.overdue}</Td>
                  <Td className={w.urgent ? "text-amber-400" : ""}>{w.urgent}</Td>
                  <Td>{w.clients}</Td>
                  <Td>{w.creatives}</Td>
                  <Td>{w.assets}</Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}
    </div>
  );
}

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { hasPermission, requireSession } from "@/lib/auth/guard";
import { getDashboardData, type DashboardFilters } from "@/lib/dashboard";
import { ASSET_STATUS_META, CLIENT_STATUS_META, TASK_STATUS_META } from "@/lib/labels";
import { Card, EmptyState, StatCard, Table, Td, Th } from "@/components/ui/primitives";
import { DashboardFilterBar } from "./dashboard-filters";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

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
  const canAudit = hasPermission(session, "digital_assets.view_audit_logs");

  const filters: DashboardFilters = {
    empresa: str(sp.empresa),
    gestor: str(sp.gestor),
    nicho: str(sp.nicho),
  };

  const [data, allUsers, niches] = await Promise.all([
    getDashboardData(filters),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    db.selectDistinct({ niche: clients.niche }).from(clients),
  ]);

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Olá, {session.name.split(" ")[0]}. Visão operacional da agência.
        </p>
      </header>

      <DashboardFilterBar users={allUsers} niches={niches.map((n) => n.niche).filter((n): n is string => !!n)} />

      {canClients && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total de clientes" value={data.clients.total} href="/clientes" />
          <StatCard label="Ativos" value={data.clients.ativos} tone="text-emerald-400" href="/clientes?status=ATIVO" />
          <StatCard label="Críticos" value={data.clients.criticos} tone="text-red-400" href="/clientes?saude=CRITICO" />
          <StatCard label="Em observação" value={data.clients.observacao} tone="text-amber-400" href="/clientes?saude=OBSERVACAO" />
          <StatCard label="Perdidos no mês" value={data.clients.perdidosNoMes} tone="text-zinc-400" href="/clientes?status=PERDIDO" />
          <StatCard label="Ads pausado" value={data.clients.adsPausado} tone="text-amber-400" href="/clientes?ads=PAUSADO" hint="alerta operacional" />
        </div>
      )}

      {canTasks && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tarefas atrasadas" value={data.tasks.overdue} tone="text-red-400" href="/tarefas?visao=atrasadas" />
          <StatCard label="Tarefas sem responsável" value={data.tasks.unassigned} tone="text-amber-400" href="/tarefas?visao=sem-responsavel" />
          <StatCard label="Tarefas de criativo abertas" value={data.creatives.open} tone="text-amber-400" href="/tarefas?tipo=CRIATIVO&status=__abertas__" />
          <StatCard label="Criativos atrasados" value={data.creatives.overdue} tone="text-red-400" href="/tarefas?tipo=CRIATIVO&prazo=atrasadas" />
        </div>
      )}

      {canAssets && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
          <StatCard label="Ativos digitais" value={data.assets.total} tone="text-sky-400" href="/ativos" />
          <StatCard label="Bloqueados" value={data.assets.bloqueados} tone="text-red-400" href="/ativos?status=BLOQUEADA" />
          <StatCard label="Prontos para uso" value={data.assets.prontos} tone="text-emerald-400" href="/ativos?status=PRONTA_PARA_USO" />
          <StatCard label="Precisam de docs" value={data.assets.precisaDocumentos} tone="text-amber-400" href="/ativos?status=PRECISA_DE_DOCUMENTOS" />
          <StatCard label="Sendo esquentados" value={data.assets.esquentando} tone="text-amber-400" href="/ativos?status=SENDO_ESQUENTADA" />
          <StatCard label="Revisões pendentes" value={data.assets.revisaoPendente} tone="text-purple-400" href="/ativos?revisao=pendente" />
          {canAudit && (
            <StatCard label="Segredos revelados (7d)" value={data.assets.segredosRevelados7d} tone="text-zinc-300" hint="auditoria" />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {canClients && (
          <>
            <BarList title="Clientes por status" data={data.clients.byStatus} meta={CLIENT_STATUS_META} />
            <BarList title="Clientes por nicho" data={data.clients.byNiche} />
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

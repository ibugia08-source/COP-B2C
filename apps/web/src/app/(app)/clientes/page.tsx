import { and, asc, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  ADS_STATUSES,
  AGENCY_BRANDS,
  BUSINESS_MODELS,
  CLIENT_STATUSES,
  clients,
  HEALTH_STATUSES,
  users,
} from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { clientScopeCondition } from "@/lib/auth/ownership";
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  HEALTH_META,
} from "@/lib/labels";
import { Button, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { ClientFilters } from "./ui-filters";
import { ClientsList, type ClientRow } from "./list";
import { ModuleConfig } from "../module-config";
import { resolveOptions } from "@/lib/config-options";

type Search = Record<string, string | string[] | undefined>;

const SORTS: Record<string, SQL> = {
  nome: asc(clients.name),
  entrada: desc(clients.startDate),
  status: asc(clients.status),
  saude: asc(clients.healthStatus),
  recente: desc(clients.updatedAt),
};

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("clients.view");
  const sp = await searchParams;

  const filters: SQL[] = [];
  // escopo de ownership: quem não é OWNER/ADMIN só vê os clientes que gerencia
  const scope = clientScopeCondition(session);
  if (scope) filters.push(scope);
  const q = str(sp.q);
  if (q) {
    const pattern = `%${q}%`;
    filters.push(
      or(like(clients.name, pattern), like(clients.brandName, pattern), like(clients.legalName, pattern))!,
    );
  }
  const eqFilters = [
    [str(sp.status), clients.status],
    [str(sp.empresa), clients.agencyBrand],
    [str(sp.modelo), clients.businessModel],
    [str(sp.saude), clients.healthStatus],
    [str(sp.ads), clients.adsStatus],
    [str(sp.nicho), clients.niche],
    [str(sp.cidade), clients.city],
    [str(sp.uf), clients.state],
    [str(sp.estrategista), clients.strategistId],
    [str(sp.gestor1), clients.trafficManager1Id],
    [str(sp.gestor2), clients.trafficManager2Id],
    [str(sp.responsavel), clients.trafficManager1Id],
  ] as const;
  for (const [value, column] of eqFilters) {
    if (value) filters.push(eq(column as unknown as typeof clients.name, value));
  }

  const orderBy = SORTS[str(sp.ordenar) ?? "recente"] ?? SORTS.recente;
  const where = filters.length ? and(...filters) : undefined;

  const [rows, allUsers, niches, totals] = await Promise.all([
    db.query.clients.findMany({
      where,
      orderBy: [orderBy],
      with: { strategist: true, trafficManager1: true },
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    resolveOptions("clients", "niche", { activeOnly: true }),
    Promise.all([
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(clients).where(eq(clients.status, "ATIVO")),
      db.select({ n: count() }).from(clients).where(eq(clients.healthStatus, "OBSERVACAO")),
      db.select({ n: count() }).from(clients).where(eq(clients.healthStatus, "CRITICO")),
      db.select({ n: count() }).from(clients).where(eq(clients.status, "PERDIDO")),
      db.select({ n: count() }).from(clients).where(eq(clients.adsStatus, "PAUSADO")),
    ]),
  ]);
  const [total, ativos, observacao, criticos, perdidos, adsPausado] = totals.map((t) => t[0].n);
  const canCreate = hasPermission(session, "clients.create");
  const canUpdate = hasPermission(session, "clients.update");
  const canDelete = hasPermission(session, "clients.delete");

  // Dados e opções para a lista interativa (edição inline + seleção em massa)
  const listRows: ClientRow[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    state: c.state,
    agencyBrand: c.agencyBrand,
    niche: c.niche,
    businessModel: c.businessModel,
    status: c.status,
    healthStatus: c.healthStatus,
    adsStatus: c.adsStatus,
    gestor1Id: c.trafficManager1Id,
    gestor1Name: c.trafficManager1?.name ?? null,
    startDate: c.startDate ? c.startDate.toISOString() : null,
  }));
  const listOptions = {
    brands: AGENCY_BRANDS.map((v) => ({ value: v, label: AGENCY_BRAND_META[v]?.label ?? v })),
    models: BUSINESS_MODELS.map((v) => ({ value: v, label: BUSINESS_MODEL_LABEL[v] ?? v })),
    niches: niches.map((n) => ({ value: n.value, label: n.label })),
    statuses: CLIENT_STATUSES.filter((v) => v !== "PERDIDO").map((v) => ({ value: v, label: CLIENT_STATUS_META[v]?.label ?? v })),
    healths: HEALTH_STATUSES.filter((v) => v !== "CRITICO").map((v) => ({ value: v, label: HEALTH_META[v]?.label ?? v })),
    adsStatuses: ADS_STATUSES.map((v) => ({ value: v, label: ADS_META[v]?.label ?? v })),
    users: allUsers.map((u) => ({ value: u.id, label: u.name })),
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Carteira completa da agência — separada das tarefas internas."
        actions={
          <div className="flex items-center gap-2">
            <ModuleConfig moduleKey="clients" moduleLabel="Clientes" />
            {canCreate && <Button href="/clientes/novo">+ Novo cliente</Button>}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total de clientes" value={total} href="/clientes" />
        <StatCard label="Ativos" value={ativos} tone="text-emerald-400" href="/clientes?status=ATIVO" />
        <StatCard label="Em observação" value={observacao} tone="text-amber-400" href="/clientes?saude=OBSERVACAO" />
        <StatCard label="Críticos" value={criticos} tone="text-red-400" href="/clientes?saude=CRITICO" />
        <StatCard label="Perdidos" value={perdidos} tone="text-zinc-400" href="/clientes?status=PERDIDO" />
        <StatCard label="Ads pausado" value={adsPausado} tone="text-amber-400" href="/clientes?ads=PAUSADO" />
      </div>

      <ClientFilters
        users={allUsers}
        niches={niches.map((n) => n.value)}
        statuses={[...CLIENT_STATUSES]}
        healths={[...HEALTH_STATUSES]}
        adsStatuses={[...ADS_STATUSES]}
        brands={[...AGENCY_BRANDS]}
        models={[...BUSINESS_MODELS]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Nenhum cliente encontrado"
          description={
            filters.length
              ? "Nenhum cliente corresponde aos filtros selecionados. Limpe os filtros e tente de novo."
              : "Cadastre o primeiro cliente da carteira."
          }
          action={canCreate && <Button href="/clientes/novo">+ Novo cliente</Button>}
        />
      ) : (
        <ClientsList rows={listRows} options={listOptions} canUpdate={canUpdate} canDelete={canDelete} />
      )}
    </div>
  );
}

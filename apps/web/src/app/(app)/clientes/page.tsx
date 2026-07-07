import Link from "next/link";
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
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  formatDate,
  HEALTH_META,
} from "@/lib/labels";
import {
  Button,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import { ClientFilters } from "./ui-filters";

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
    [str(sp.responsavel), clients.mainResponsibleId],
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
      with: { strategist: true, trafficManager1: true, mainResponsible: true },
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.selectDistinct({ niche: clients.niche }).from(clients),
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

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Carteira completa da agência — separada das tarefas internas."
        actions={canCreate && <Button href="/clientes/novo">+ Novo cliente</Button>}
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
        niches={niches.map((n) => n.niche).filter((n): n is string => !!n)}
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
        <Table
          minWidth="900px"
          head={
            <>
              <Th>Cliente</Th>
              <Th>Empresa</Th>
              <Th>Nicho</Th>
              <Th>Modelo</Th>
              <Th>Status</Th>
              <Th>Saúde</Th>
              <Th>Ads</Th>
              <Th>Gestor 1</Th>
              <Th>Entrada</Th>
            </>
          }
        >
          {rows.map((c) => (
            <tr key={c.id} className="transition hover:bg-zinc-900/60">
              <Td>
                <Link href={`/clientes/${c.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                  {c.name}
                </Link>
                {c.city && (
                  <p className="text-xs text-zinc-500">
                    {c.city}
                    {c.state ? `/${c.state}` : ""}
                  </p>
                )}
              </Td>
              <Td><StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} /></Td>
              <Td className="text-zinc-400">{c.niche ?? "—"}</Td>
              <Td className="text-zinc-400">{BUSINESS_MODEL_LABEL[c.businessModel]}</Td>
              <Td><StatusBadge value={c.status} meta={CLIENT_STATUS_META} /></Td>
              <Td><StatusBadge value={c.healthStatus} meta={HEALTH_META} /></Td>
              <Td><StatusBadge value={c.adsStatus} meta={ADS_META} /></Td>
              <Td>
                {c.trafficManager1 ? (
                  <span className="flex items-center gap-1.5">
                    <UserAvatar name={c.trafficManager1.name} size="sm" />
                    <span className="text-xs text-zinc-400">{c.trafficManager1.name.split(" ")[0]}</span>
                  </span>
                ) : (
                  <span className="text-xs text-amber-500" title="Cliente sem gestor definido">sem gestor</span>
                )}
              </Td>
              <Td className="text-zinc-400">{formatDate(c.startDate)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

import Link from "next/link";
import { and, asc, eq, isNull, like, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssetGroups, digitalAssets, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { resolveOptions } from "@/lib/config-options";
import {
  ASSET_PLATFORM_LABEL,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
  formatDate,
  type Tone,
} from "@/lib/labels";
import {
  Badge,
  EmptyState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import { CalendarMonth, type CalendarItem } from "@/components/calendar-month";
import { AssetKanban, type AssetCardData, type KanbanColumn } from "./kanban";
import { AssetFilters, AssetFormButton, GroupFormButton } from "./ui";
import { ModuleConfig } from "../module-config";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const FILTER_KEYS = ["q", "cliente", "grupo", "tipo", "plataforma", "status", "responsavel", "tag", "revisao"] as const;

type AssetRow = typeof digitalAssets.$inferSelect & {
  group: { id: string; name: string };
  client: { id: string; name: string } | null;
  assignedTo: { name: string } | null;
  secrets: { id: string }[];
  attachments: { id: string }[];
};

export default async function AtivosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("digital_assets.view");
  const sp = await searchParams;
  const now = new Date();

  const canCreate = hasPermission(session, "digital_assets.create");
  const canUpdate = hasPermission(session, "digital_assets.update");
  const canManageGroups = hasPermission(session, "digital_assets.manage_groups");
  const canCreateSecrets = hasPermission(session, "digital_assets.create_secrets");

  // --- filtros combinados -------------------------------------------------
  const filters: SQL[] = [isNull(digitalAssets.archivedAt)];
  const q = str(sp.q);
  if (q) {
    const p = `%${q}%`;
    filters.push(or(like(digitalAssets.title, p), like(digitalAssets.description, p), like(digitalAssets.notes, p))!);
  }
  if (str(sp.cliente)) filters.push(eq(digitalAssets.clientId, str(sp.cliente)!));
  if (str(sp.grupo)) filters.push(eq(digitalAssets.groupId, str(sp.grupo)!));
  if (str(sp.tipo)) filters.push(eq(digitalAssets.assetType, str(sp.tipo) as never));
  if (str(sp.plataforma)) filters.push(eq(digitalAssets.platform, str(sp.plataforma) as never));
  if (str(sp.status)) filters.push(eq(digitalAssets.status, str(sp.status) as never));
  const resp = str(sp.responsavel);
  if (resp === "__none__") filters.push(isNull(digitalAssets.assignedToId));
  else if (resp) filters.push(eq(digitalAssets.assignedToId, resp));
  if (str(sp.tag)) filters.push(like(digitalAssets.tags, `%"${str(sp.tag)}"%`));
  if (str(sp.revisao) === "pendente") filters.push(lt(digitalAssets.nextReviewAt, now));

  const [assets, groups, allClients, allUsers, statusOptionsAll] = await Promise.all([
    db.query.digitalAssets.findMany({
      where: and(...filters),
      with: {
        group: { columns: { id: true, name: true } },
        client: { columns: { id: true, name: true } },
        assignedTo: { columns: { name: true } },
        secrets: { columns: { id: true } },
        attachments: { columns: { id: true } },
      },
      orderBy: [asc(digitalAssets.title)],
      limit: 500,
    }) as Promise<AssetRow[]>,
    db.query.digitalAssetGroups.findMany({
      where: eq(digitalAssetGroups.status, "ATIVO"),
      orderBy: [asc(digitalAssetGroups.order), asc(digitalAssetGroups.name)],
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    resolveOptions("digital_assets", "status"),
  ]);

  // meta de status (built-in + colunas custom) e colunas ativas do Kanban
  const statusMeta: Record<string, { label: string; tone: Tone }> = { ...ASSET_STATUS_META };
  for (const o of statusOptionsAll) statusMeta[o.value] = { label: o.label, tone: o.color };
  const statusActive = statusOptionsAll.filter((o) => o.isActive);
  const statusColumns: KanbanColumn[] = statusActive
    .filter((o) => o.value !== "ARQUIVADA")
    .map((o) => ({ value: o.value, label: o.label, color: o.color }));
  const groupColumns: KanbanColumn[] = groups.map((g) => ({ value: g.id, label: g.name, color: "zinc" as Tone }));
  const defaultStatus =
    statusColumns.find((c) => statusActive.find((o) => o.value === c.value)?.isDefault)?.value ??
    statusColumns[0]?.value ?? "NAO_INFORMADO";

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));
  const cards: AssetCardData[] = assets.map((a) => ({
    id: a.id,
    title: a.title,
    assetType: a.assetType,
    platform: a.platform,
    status: a.status,
    groupId: a.groupId,
    groupName: a.group.name,
    clientName: a.client?.name ?? null,
    assignedName: a.assignedTo?.name ?? null,
    secretCount: a.secrets.length,
    attachmentCount: a.attachments.length,
    reviewPending: !!a.nextReviewAt && a.nextReviewAt < now,
    nextReview: a.nextReviewAt ? a.nextReviewAt.toISOString() : null,
  }));

  // --- visões e URLs --------------------------------------------------------
  const visao = str(sp.visao) ?? "kanban";
  const agrupar = str(sp.agrupar) === "grupo" ? "grupo" : "status";
  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `/ativos?${s}` : "/ativos";
  };
  const activeFilterCount = FILTER_KEYS.filter((k) => str(sp[k])).length;
  const showFilters = str(sp.filtros) === "1" || activeFilterCount > 0;

  // --- calendário/revisões: resumo + itens do mês ---------------------------
  const mesParam = str(sp.mes);
  const [calYear, calMonth] = /^\d{4}-\d{2}$/.test(mesParam ?? "")
    ? [Number(mesParam!.slice(0, 4)), Number(mesParam!.slice(5, 7)) - 1]
    : [now.getFullYear(), now.getMonth()];
  const overdueReviews = assets.filter((a) => a.nextReviewAt && a.nextReviewAt < now);
  const blocked = assets.filter((a) => a.status === "BLOQUEADA");
  const needDocs = assets.filter((a) => a.status === "PRECISA_DE_DOCUMENTOS");
  const calendarItems: CalendarItem[] = assets
    .filter((a): a is AssetRow & { nextReviewAt: Date } => !!a.nextReviewAt)
    .map((a) => ({
      kind: "task",
      id: a.id,
      title: `${a.client?.name ? `${a.client.name} — ` : ""}${a.title}`,
      href: `/ativos/${a.id}`,
      date: a.nextReviewAt,
      done: a.status === "ARQUIVADA",
    }));

  const viewBtn = (k: string, label: string) => (
    <Link
      key={k}
      href={buildHref({ visao: k === "kanban" ? null : k })}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        visao === k ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Banco de Ativos Digitais"
        description="CRM de contas, perfis, acessos e ativos digitais da operação. Segredos ficam criptografados e nunca aparecem nos cards."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleConfig moduleKey="digital_assets" moduleLabel="Banco de Ativos Digitais" buttonLabel="Colunas" />
            <Link
              href={buildHref({ filtros: showFilters && activeFilterCount === 0 ? null : "1" })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                activeFilterCount > 0
                  ? "border-emerald-700 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Link>
            <span className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              {viewBtn("kanban", "Kanban")}
              {viewBtn("lista", "Lista")}
              {viewBtn("calendario", "Revisões")}
            </span>
            <GroupFormButton clients={allClients} canManage={canManageGroups} />
            {canCreate && (
              <AssetFormButton
                groups={groupOptions}
                clients={allClients}
                users={allUsers}
                defaultClientId={str(sp.cliente)}
                defaultStatus={defaultStatus}
                autoOpen={str(sp.novo) === "1"}
                canCreateSecrets={canCreateSecrets}
              />
            )}
          </div>
        }
      />

      {visao === "kanban" && (
        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
          Agrupar por:
          <Link href={buildHref({ agrupar: null })} className={agrupar === "status" ? "text-emerald-300" : "hover:text-zinc-200"}>Status</Link>
          <span>·</span>
          <Link href={buildHref({ agrupar: "grupo" })} className={agrupar === "grupo" ? "text-emerald-300" : "hover:text-zinc-200"}>Grupo/cliente</Link>
        </div>
      )}

      {showFilters && <AssetFilters clients={allClients} groups={groupOptions} users={allUsers} />}

      {visao === "calendario" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="Revisões vencidas" count={overdueReviews.length} tone="amber" href={buildHref({ visao: null, revisao: "pendente" })} />
            <SummaryCard label="Bloqueados" count={blocked.length} tone="red" href={buildHref({ visao: null, status: "BLOQUEADA" })} />
            <SummaryCard label="Precisam de documentos" count={needDocs.length} tone="blue" href={buildHref({ visao: null, status: "PRECISA_DE_DOCUMENTOS" })} />
          </div>
          <CalendarMonth
            year={calYear}
            month={calMonth}
            buildHref={buildHref}
            items={calendarItems}
            taskLegend="revisão de ativo"
            meetingLegend="—"
            emptyLabel="Nenhuma revisão agendada neste mês"
          />
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon="🗄️"
          title="Nenhum ativo encontrado"
          description="Crie um grupo e cadastre o primeiro ativo, ou ajuste os filtros."
        />
      ) : visao === "lista" ? (
        <Table
          minWidth="960px"
          head={
            <>
              <Th>Ativo</Th>
              <Th>Grupo</Th>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th>Plataforma</Th>
              <Th>Status</Th>
              <Th>Responsável</Th>
              <Th>Revisão</Th>
              <Th>Indicadores</Th>
            </>
          }
        >
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-zinc-900/60">
              <Td>
                <Link href={`/ativos/${a.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                  {a.title}
                </Link>
              </Td>
              <Td className="text-zinc-400">{a.group.name}</Td>
              <Td className="text-zinc-400">
                {a.client ? (
                  <Link href={`/clientes/${a.client.id}`} className="hover:text-emerald-300">{a.client.name}</Link>
                ) : "—"}
              </Td>
              <Td className="text-zinc-400">{ASSET_TYPE_LABEL[a.assetType]}</Td>
              <Td className="text-zinc-400">{ASSET_PLATFORM_LABEL[a.platform]}</Td>
              <Td><StatusBadge value={a.status} meta={statusMeta} /></Td>
              <Td>{a.assignedTo ? <UserAvatar name={a.assignedTo.name} size="sm" /> : <span className="text-amber-500">—</span>}</Td>
              <Td className={a.nextReviewAt && a.nextReviewAt < now ? "text-amber-400" : "text-zinc-400"}>
                {formatDate(a.nextReviewAt)}
              </Td>
              <Td>
                <span className="space-x-1">
                  {a.secrets.length > 0 && <Badge tone="purple">🔐 {a.secrets.length}</Badge>}
                  {a.attachments.length > 0 && <Badge tone="blue">📎 {a.attachments.length}</Badge>}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <AssetKanban
          assets={cards}
          mode={agrupar === "grupo" ? "group" : "status"}
          columns={agrupar === "status" ? statusColumns : groupColumns}
          canUpdate={canUpdate}
          canCreate={canCreate}
          quickAddGroupId={str(sp.grupo) ?? groupOptions[0]?.id}
          quickAddStatus={defaultStatus}
          quickAddClientId={str(sp.cliente)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, count, tone, href }: { label: string; count: number; tone: Tone; href: string }) {
  const color =
    tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-sky-400";
  return (
    <Link href={href} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-600">
      <p className={`text-2xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </Link>
  );
}

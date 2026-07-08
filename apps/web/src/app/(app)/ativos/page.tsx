import Link from "next/link";
import { and, asc, eq, isNull, like, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssetGroups, digitalAssets, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import {
  ASSET_PLATFORM_LABEL,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
  formatDate,
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
import { AssetFilters, AssetFormButton, GroupFormButton } from "./ui";
import { ModuleConfig } from "../module-config";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

type AssetRow = typeof digitalAssets.$inferSelect & {
  group: { id: string; name: string };
  client: { id: string; name: string } | null;
  assignedTo: { name: string } | null;
  secrets: { id: string }[];
  attachments: { id: string }[];
};

function AssetCard({ asset, now }: { asset: AssetRow; now: Date }) {
  const reviewPending = asset.nextReviewAt && asset.nextReviewAt < now;
  return (
    <Link
      href={`/ativos/${asset.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition hover:border-zinc-600"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight text-zinc-100">{asset.title}</p>
        {asset.assignedTo && <UserAvatar name={asset.assignedTo.name} size="sm" />}
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        {ASSET_TYPE_LABEL[asset.assetType]} · {ASSET_PLATFORM_LABEL[asset.platform]}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusBadge value={asset.status} meta={ASSET_STATUS_META} />
        {asset.secrets.length > 0 && <Badge tone="purple">🔐 {asset.secrets.length}</Badge>}
        {asset.attachments.length > 0 && <Badge tone="blue">📎 {asset.attachments.length}</Badge>}
        {reviewPending && <Badge tone="amber">⏰ revisar</Badge>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span className="truncate">{asset.client?.name ?? asset.group.name}</span>
        <span title="Última verificação">{asset.lastCheckedAt ? `✓ ${formatDate(asset.lastCheckedAt)}` : ""}</span>
      </div>
    </Link>
  );
}

export default async function AtivosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("digital_assets.view");
  const sp = await searchParams;
  const now = new Date();

  const canCreate = hasPermission(session, "digital_assets.create");
  const canManageGroups = hasPermission(session, "digital_assets.manage_groups");
  const canCreateSecrets = hasPermission(session, "digital_assets.create_secrets");

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
  if (str(sp.responsavel)) filters.push(eq(digitalAssets.assignedToId, str(sp.responsavel)!));
  if (str(sp.tag)) filters.push(like(digitalAssets.tags, `%"${str(sp.tag)}"%`));
  if (str(sp.revisao) === "pendente") filters.push(lt(digitalAssets.nextReviewAt, now));

  const [assets, groups, allClients, allUsers] = await Promise.all([
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
  ]);

  const visao = str(sp.visao) ?? "grupos";
  const viewTab = (key: string, label: string) => (
    <Link
      key={key}
      href={`/ativos${key === "grupos" ? "" : `?visao=${key}`}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        visao === key ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div>
      <PageHeader
        title="Banco de Ativos Digitais"
        description="Central de contas, perfis, acessos, contas de anúncio e ativos digitais da operação."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleConfig moduleKey="digital_assets" moduleLabel="Banco de Ativos Digitais" />
            <GroupFormButton clients={allClients} canManage={canManageGroups} />
            {canCreate && (
              <AssetFormButton
                groups={groupOptions}
                clients={allClients}
                users={allUsers}
                defaultClientId={str(sp.cliente)}
                autoOpen={str(sp.novo) === "1"}
                canCreateSecrets={canCreateSecrets}
              />
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {viewTab("grupos", "Kanban por grupo")}
        {viewTab("status", "Kanban por status")}
        {viewTab("lista", "Lista")}
        {viewTab("cliente", "Por cliente")}
      </div>

      <AssetFilters clients={allClients} groups={groupOptions} users={allUsers} />

      {assets.length === 0 ? (
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
              <Td><StatusBadge value={a.status} meta={ASSET_STATUS_META} /></Td>
              <Td>{a.assignedTo ? <UserAvatar name={a.assignedTo.name} size="sm" /> : "—"}</Td>
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
      ) : visao === "status" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Object.entries(ASSET_STATUS_META)
            .filter(([s]) => s !== "ARQUIVADA")
            .map(([status, meta]) => {
              const items = assets.filter((a) => a.status === status);
              return (
                <div key={status} className="w-64 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                    <span className="text-xs font-semibold text-zinc-300">{meta.label}</span>
                    <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{items.length}</span>
                  </div>
                  <div className="flex min-h-24 flex-col gap-2 p-2">
                    {items.map((a) => <AssetCard key={a.id} asset={a} now={now} />)}
                    {items.length === 0 && <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>}
                  </div>
                </div>
              );
            })}
        </div>
      ) : visao === "cliente" ? (
        <div className="space-y-6">
          {[
            ...allClients.filter((c) => assets.some((a) => a.clientId === c.id)).map((c) => ({
              key: c.id,
              label: c.name,
              items: assets.filter((a) => a.clientId === c.id),
            })),
            {
              key: "__interno__",
              label: "Internos da agência",
              items: assets.filter((a) => !a.clientId),
            },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.key}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-300">
                  {g.label} <span className="text-xs font-normal text-zinc-500">({g.items.length})</span>
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.items.map((a) => <AssetCard key={a.id} asset={a} now={now} />)}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {groups
            .filter((g) => !str(sp.grupo) || g.id === str(sp.grupo))
            .map((g) => {
              const items = assets.filter((a) => a.groupId === g.id);
              if (items.length === 0 && (str(sp.q) || str(sp.status) || str(sp.tipo))) return null;
              return (
                <div key={g.id} className="w-64 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                    <span className="truncate text-xs font-semibold text-zinc-300" title={g.name}>{g.name}</span>
                    <span className="flex items-center gap-1">
                      <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{items.length}</span>
                      <GroupFormButton group={g} clients={allClients} canManage={canManageGroups} />
                    </span>
                  </div>
                  <div className="flex min-h-24 flex-col gap-2 p-2">
                    {items.map((a) => <AssetCard key={a.id} asset={a} now={now} />)}
                    {items.length === 0 && <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

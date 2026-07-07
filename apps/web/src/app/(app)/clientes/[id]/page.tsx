import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import {
  ADS_META,
  AGENCY_BRAND_META,
  ASSET_PLATFORM_LABEL,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  CREATIVE_STATUS_META,
  formatDate,
  formatMoney,
  HEALTH_META,
  PIPELINE_STAGE_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
} from "@/lib/labels";
import { getClientTimeline } from "@/lib/timeline";
import { Tabs } from "@/components/ui/overlay";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import { ClientQuickActions } from "./quick-actions";
import { OperationalProfileForm } from "./profile-form";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800/60 py-2 text-sm last:border-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{children}</span>
    </div>
  );
}

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("clients.view");
  const { id } = await params;

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, id),
    with: {
      strategist: true,
      trafficManager1: true,
      trafficManager2: true,
      mainResponsible: true,
      operationalProfile: true,
      contacts: true,
      meetings: { orderBy: (m, { desc }) => [desc(m.meetingDate)] },
      tasks: { orderBy: (t, { desc }) => [desc(t.updatedAt)], with: { assignedTo: true } },
      creativeRequests: { orderBy: (c, { desc }) => [desc(c.createdAt)] },
      digitalAssets: {
        orderBy: (a, { asc }) => [asc(a.title)],
        with: { group: true, assignedTo: true },
      },
      documents: { orderBy: (d, { desc }) => [desc(d.updatedAt)] },
    },
  });
  if (!client) notFound();

  const canAssets = hasPermission(session, "digital_assets.view");
  const canCreateAsset = hasPermission(session, "digital_assets.create");
  const canUpdate = hasPermission(session, "clients.update");
  const canMoveStatus = hasPermission(session, "clients.moveStatus");
  const timeline = await getClientTimeline(client.id);

  // Pendências (regras de negócio)
  const pendencias: string[] = [];
  if (client.status === "ATIVO" && !client.trafficManager1Id && !client.mainResponsibleId) {
    pendencias.push("Cliente ativo sem gestor/responsável principal definido.");
  }
  if (client.status === "ATIVO" && !client.operationalProfile?.briefingText) {
    pendencias.push("Cliente ativo sem briefing operacional preenchido.");
  }
  if (client.adsStatus === "PAUSADO" && client.status === "ATIVO") {
    pendencias.push("Anúncios pausados — verificar motivo.");
  }

  const openTasks = client.tasks.filter((t) => t.status !== "CONCLUIDA" && t.status !== "CANCELADA");

  const visaoGeral = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Dados principais</h3>
        <InfoRow label="Razão social">{client.legalName ?? "—"}</InfoRow>
        <InfoRow label="Marca">{client.brandName ?? "—"}</InfoRow>
        <InfoRow label="Empresa"><StatusBadge value={client.agencyBrand} meta={AGENCY_BRAND_META} /></InfoRow>
        <InfoRow label="Modelo">{BUSINESS_MODEL_LABEL[client.businessModel]}</InfoRow>
        <InfoRow label="Nicho">{client.niche ?? "—"}</InfoRow>
        <InfoRow label="Cidade">{client.city ? `${client.city}${client.state ? `/${client.state}` : ""}` : "—"}</InfoRow>
        <InfoRow label="Instagram">
          {client.instagramUrl ? (
            <a href={client.instagramUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
              abrir ↗
            </a>
          ) : "—"}
        </InfoRow>
        <InfoRow label="Site">
          {client.websiteUrl ? (
            <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
              abrir ↗
            </a>
          ) : "—"}
        </InfoRow>
        <InfoRow label="Entrada">{formatDate(client.startDate)}</InfoRow>
        {client.status === "PERDIDO" && (
          <>
            <InfoRow label="Perda">{formatDate(client.churnDate)}</InfoRow>
            <InfoRow label="Motivo do churn">{client.churnReason ?? "—"}</InfoRow>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Decisor e contato</h3>
          <InfoRow label="Decisor">{client.decisionMakerName ?? "—"}</InfoRow>
          <InfoRow label="Telefone">{client.decisionMakerPhone ?? "—"}</InfoRow>
          <InfoRow label="E-mail">{client.decisionMakerEmail ?? "—"}</InfoRow>
          {client.contacts.map((c) => (
            <InfoRow key={c.id} label={c.role ?? "Contato"}>
              {c.name} {c.phone ? `· ${c.phone}` : ""}
            </InfoRow>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Responsáveis</h3>
          <InfoRow label="Estrategista">{client.strategist?.name ?? "—"}</InfoRow>
          <InfoRow label="Gestor 1">{client.trafficManager1?.name ?? "—"}</InfoRow>
          <InfoRow label="Gestor 2">{client.trafficManager2?.name ?? "—"}</InfoRow>
          <InfoRow label="Responsável principal">{client.mainResponsible?.name ?? "—"}</InfoRow>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Resumo operacional</h3>
          <InfoRow label="Etapa do pipeline"><StatusBadge value={client.pipelineStage} meta={PIPELINE_STAGE_META} /></InfoRow>
          <InfoRow label="Tarefas em aberto">{openTasks.length}</InfoRow>
          <InfoRow label="Plataformas">{client.operationalProfile?.platforms.join(", ") || "—"}</InfoRow>
          <InfoRow label="Verba diária média">{client.operationalProfile?.averageDailyBudget != null ? formatMoney(client.operationalProfile.averageDailyBudget) : "—"}</InfoRow>
        </div>
        {client.notes && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">Observações</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{client.notes}</p>
          </div>
        )}
      </div>
    </div>
  );

  const operacao = canUpdate ? (
    <OperationalProfileForm clientId={client.id} profile={client.operationalProfile ?? null} />
  ) : (
    <EmptyState icon="🔒" title="Sem permissão para editar o perfil operacional" />
  );

  const tarefas = client.tasks.length ? (
    <Table
      head={
        <>
          <Th>Tarefa</Th>
          <Th>Tipo</Th>
          <Th>Status</Th>
          <Th>Responsável</Th>
          <Th>Prazo</Th>
        </>
      }
    >
      {client.tasks.map((t) => (
        <tr key={t.id} className="hover:bg-zinc-900/60">
          <Td>
            <Link href={`/tarefas/${t.id}`} className="text-zinc-100 hover:text-emerald-300">
              {t.title}
            </Link>
          </Td>
          <Td><StatusBadge value={t.type} meta={TASK_TYPE_META} /></Td>
          <Td><StatusBadge value={t.status} meta={TASK_STATUS_META} /></Td>
          <Td>{t.assignedTo ? <span className="flex items-center gap-1.5"><UserAvatar name={t.assignedTo.name} size="sm" />{t.assignedTo.name.split(" ")[0]}</span> : <span className="text-amber-500">—</span>}</Td>
          <Td className={t.dueDate && !t.completedAt && t.dueDate < new Date() ? "text-red-400" : "text-zinc-400"}>
            {formatDate(t.dueDate)}
          </Td>
        </tr>
      ))}
    </Table>
  ) : (
    <EmptyState
      icon="☑"
      title="Nenhuma tarefa para este cliente"
      action={<Button size="sm" href={`/tarefas?nova=1&cliente=${client.id}`}>+ Nova tarefa</Button>}
    />
  );

  const criativos = client.creativeRequests.length ? (
    <Table
      head={<><Th>Criativo</Th><Th>Status</Th><Th>Prazo</Th></>}
    >
      {client.creativeRequests.map((c) => (
        <tr key={c.id} className="hover:bg-zinc-900/60">
          <Td>
            <Link href={`/criativos/${c.id}`} className="text-zinc-100 hover:text-emerald-300">{c.title}</Link>
          </Td>
          <Td><StatusBadge value={c.status} meta={CREATIVE_STATUS_META} /></Td>
          <Td className="text-zinc-400">{formatDate(c.dueDate)}</Td>
        </tr>
      ))}
    </Table>
  ) : (
    <EmptyState
      icon="🎨"
      title="Nenhum criativo solicitado"
      action={<Button size="sm" href={`/criativos?novo=1&cliente=${client.id}`}>+ Solicitar criativo</Button>}
    />
  );

  const now = new Date();
  const ativosDigitais = !canAssets ? (
    <EmptyState icon="🔒" title="Acesso restrito" description="Você não tem permissão para ver os ativos digitais deste cliente." />
  ) : client.digitalAssets.length ? (
    <div>
      {canCreateAsset && (
        <div className="mb-3">
          <Button size="sm" href={`/ativos?novo=1&cliente=${client.id}`}>+ Novo ativo para este cliente</Button>
        </div>
      )}
      <Table
        minWidth="760px"
        head={
          <>
            <Th>Ativo</Th>
            <Th>Tipo</Th>
            <Th>Plataforma</Th>
            <Th>Status</Th>
            <Th>Responsável</Th>
            <Th>Próxima revisão</Th>
          </>
        }
      >
        {client.digitalAssets.map((a) => (
          <tr key={a.id} className="hover:bg-zinc-900/60">
            <Td>
              <Link href={`/ativos/${a.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                {a.title}
              </Link>
              <p className="text-xs text-zinc-500">{a.group.name}</p>
            </Td>
            <Td className="text-zinc-400">{ASSET_TYPE_LABEL[a.assetType]}</Td>
            <Td className="text-zinc-400">{ASSET_PLATFORM_LABEL[a.platform]}</Td>
            <Td><StatusBadge value={a.status} meta={ASSET_STATUS_META} /></Td>
            <Td>{a.assignedTo ? <span className="flex items-center gap-1.5"><UserAvatar name={a.assignedTo.name} size="sm" />{a.assignedTo.name.split(" ")[0]}</span> : "—"}</Td>
            <Td className={a.nextReviewAt && a.nextReviewAt < now ? "text-purple-400" : "text-zinc-400"}>
              {formatDate(a.nextReviewAt)}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  ) : (
    <EmptyState
      icon="🗄️"
      title="Nenhum ativo digital cadastrado"
      action={canCreateAsset && <Button size="sm" href={`/ativos?novo=1&cliente=${client.id}`}>+ Novo ativo para este cliente</Button>}
    />
  );

  const documentos = client.documents.length ? (
    <div className="space-y-2">
      {client.documents.map((d) => (
        <Link
          key={d.id}
          href={`/documentos/${d.id}`}
          className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition hover:border-zinc-600"
        >
          <p className="text-sm font-medium">{d.title}</p>
          <p className="text-xs text-zinc-500">{d.type} · atualizado em {formatDate(d.updatedAt)}</p>
        </Link>
      ))}
    </div>
  ) : (
    <EmptyState icon="📄" title="Nenhum documento vinculado" action={<Button size="sm" href={`/documentos?novo=1&cliente=${client.id}`}>+ Novo documento</Button>} />
  );

  const reunioes = client.meetings.length ? (
    <div className="space-y-2">
      {client.meetings.map((m) => (
        <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{m.title}</p>
            <span className="text-xs text-zinc-500">{formatDate(m.meetingDate)}</span>
          </div>
          {m.summary && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{m.summary}</p>}
        </div>
      ))}
    </div>
  ) : (
    <EmptyState icon="🗓️" title="Nenhuma reunião registrada" description="Use a ação rápida “Registrar reunião” no topo da página." />
  );

  const historico = timeline.length ? (
    <ol className="relative space-y-4 border-l border-zinc-800 pl-5">
      {timeline.map((item, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs">
            {item.icon}
          </span>
          <p className="text-sm text-zinc-200">
            {item.title}
            <span className="ml-2 text-xs text-zinc-500">{formatDate(item.date)}</span>
          </p>
          {item.detail && <p className="text-xs text-zinc-400">{item.detail}</p>}
        </li>
      ))}
    </ol>
  ) : (
    <EmptyState icon="🕐" title="Sem eventos no histórico ainda" />
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <StatusBadge value={client.status} meta={CLIENT_STATUS_META} />
            <StatusBadge value={client.healthStatus} meta={HEALTH_META} />
            <StatusBadge value={client.adsStatus} meta={ADS_META} />
            <StatusBadge value={client.agencyBrand} meta={AGENCY_BRAND_META} />
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {client.niche ?? "Sem nicho"} · {BUSINESS_MODEL_LABEL[client.businessModel]}
            {client.city ? ` · ${client.city}/${client.state ?? ""}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate && (
            <Button variant="secondary" size="sm" href={`/clientes/${client.id}/editar`}>
              Editar ficha
            </Button>
          )}
        </div>
      </div>

      {pendencias.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendencias.map((p) => (
            <Alert key={p} tone="amber">⚠️ {p}</Alert>
          ))}
        </div>
      )}

      {canUpdate && (
        <div className="mb-6">
          <ClientQuickActions client={client} canMoveStatus={canMoveStatus} />
        </div>
      )}

      <Tabs
        tabs={[
          { key: "visao", label: "Visão Geral", content: visaoGeral },
          { key: "operacao", label: "Operação", content: operacao },
          { key: "tarefas", label: "Tarefas", content: tarefas, badge: openTasks.length },
          { key: "criativos", label: "Criativos", content: criativos, badge: client.creativeRequests.filter((c) => !["PUBLICADO", "CANCELADO", "APROVADO"].includes(c.status)).length },
          { key: "ativos", label: "Ativos Digitais", content: ativosDigitais, badge: client.digitalAssets.length },
          { key: "documentos", label: "Documentos", content: documentos },
          { key: "reunioes", label: "Reuniões", content: reunioes },
          { key: "historico", label: "Histórico", content: historico },
        ]}
      />
      <div className="mt-6 text-xs text-zinc-600">
        <Badge tone="zinc">ID {client.id.slice(0, 8)}</Badge>
      </div>
    </div>
  );
}

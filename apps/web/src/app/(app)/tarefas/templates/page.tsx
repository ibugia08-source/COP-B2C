import { asc } from "drizzle-orm";
import { db } from "@/db";
import { clients, taskTemplates } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { TASK_TYPE_META } from "@/lib/labels";
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { TemplateBadges, TemplateEditor, TemplateRowActions } from "./ui";

export default async function TemplatesPage() {
  const session = await requirePermission("tasks.view");
  const canEdit = hasPermission(session, "automations.update");
  const canApply = hasPermission(session, "tasks.create");

  const [templates, allClients] = await Promise.all([
    db.query.taskTemplates.findMany({ orderBy: [asc(taskTemplates.name)] }),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .orderBy(asc(clients.name)),
  ]);

  return (
    <div>
      <PageHeader
        title="Templates operacionais"
        description="Checklists e conjuntos de tarefas padrão — aplicáveis manualmente ou por automação de etapa."
        actions={<TemplateEditor canEdit={canEdit} />}
      />

      {templates.length === 0 ? (
        <EmptyState icon="📋" title="Nenhum template cadastrado" />
      ) : (
        <Table
          minWidth="760px"
          head={
            <>
              <Th>Template</Th>
              <Th>Tipo</Th>
              <Th>Configuração</Th>
              <Th className="text-right">Ações</Th>
            </>
          }
        >
          {templates.map((t) => (
            <tr key={t.id} className={`hover:bg-zinc-900/60 ${t.isActive ? "" : "opacity-50"}`}>
              <Td>
                <p className="font-medium text-zinc-100">{t.name}</p>
                <p className="text-xs text-zinc-500">{t.slug}{t.description ? ` — ${t.description}` : ""}</p>
              </Td>
              <Td><StatusBadge value={t.taskType} meta={TASK_TYPE_META} /></Td>
              <Td><TemplateBadges template={t} /></Td>
              <Td>
                <TemplateRowActions template={t} clients={allClients} canEdit={canEdit} canApply={canApply && t.isActive} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

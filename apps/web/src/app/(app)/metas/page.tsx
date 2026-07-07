import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { formatDate, GOAL_STATUS_META } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { GOAL_CATEGORY_LABELS, GoalFormButton, GoalProgressControls } from "./ui";

function GoalBar({ current, target, superT, mega }: { current: number; target: number; superT: number | null; mega: number | null }) {
  const maxRef = Math.max(target, superT ?? 0, mega ?? 0, current, 1);
  const pct = (v: number) => Math.min(100, (v / maxRef) * 100);
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct(current)}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-zinc-300" style={{ left: `${pct(target)}%` }} title="Meta" />
      {superT != null && <div className="absolute top-0 h-full w-0.5 bg-amber-400" style={{ left: `${pct(superT)}%` }} title="Super meta" />}
      {mega != null && <div className="absolute top-0 h-full w-0.5 bg-purple-400" style={{ left: `${pct(mega)}%` }} title="Mega meta" />}
    </div>
  );
}

export default async function MetasPage() {
  const session = await requirePermission("goals.view");
  const canCreate = hasPermission(session, "goals.create");
  const canUpdate = hasPermission(session, "goals.update");
  const canDelete = hasPermission(session, "goals.delete");

  const [rows, allUsers] = await Promise.all([
    db.query.goals.findMany({ with: { owner: true }, orderBy: [desc(goals.createdAt)] }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
  ]);

  return (
    <div>
      <PageHeader
        title="Metas"
        description="Meta, super meta e mega meta — por agência, gestor ou cliente."
        actions={<GoalFormButton users={allUsers} canEdit={canCreate} />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Nenhuma meta cadastrada"
          description="Crie a primeira meta do período para acompanhar o progresso da agência."
          action={<GoalFormButton users={allUsers} canEdit={canCreate} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((g) => {
            const pctOfTarget = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
            const fmt = (v: number) => (g.unit === "R$" ? `R$ ${v.toLocaleString("pt-BR")}` : `${v.toLocaleString("pt-BR")}${g.unit ? ` ${g.unit}` : ""}`);
            return (
              <Card key={g.id} className="p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{g.title}</h3>
                    <StatusBadge value={g.status} meta={GOAL_STATUS_META} />
                    <Badge tone="blue">{GOAL_CATEGORY_LABELS[g.category]}</Badge>
                    {g.autoProgress && <Badge tone="purple">auto</Badge>}
                  </div>
                  <GoalFormButton goal={g} users={allUsers} canEdit={canUpdate} />
                </div>
                <GoalBar current={g.currentValue} target={g.targetValue} superT={g.superTargetValue} mega={g.megaTargetValue} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>
                    <strong className="text-zinc-200">{fmt(g.currentValue)}</strong> de {fmt(g.targetValue)} ({pctOfTarget}%)
                    {g.superTargetValue != null && <> · super {fmt(g.superTargetValue)}</>}
                    {g.megaTargetValue != null && <> · mega {fmt(g.megaTargetValue)}</>}
                  </span>
                  <span>
                    {g.owner?.name ?? "Sem responsável"}
                    {g.periodEnd && <> · até {formatDate(g.periodEnd)}</>}
                  </span>
                </div>
                <div className="mt-3">
                  <GoalProgressControls goal={g} canEdit={canUpdate} canDelete={canDelete} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

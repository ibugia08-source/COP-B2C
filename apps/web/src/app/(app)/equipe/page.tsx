import { db } from "@/db";
import type { RoleName } from "@/db/schema";
import { hasPermission, requireAdmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/primitives";
import { MemberForm, MemberRow, PendingRow } from "./ui";

export default async function EquipePage() {
  // Módulo Equipe é restrito a OWNER/ADMIN (verificação de papel no servidor).
  const session = await requireAdmin();
  const canCreate = hasPermission(session, "team.create");
  const canUpdate = hasPermission(session, "team.update");
  const canDeactivate = hasPermission(session, "team.deactivate");
  const canApprove = hasPermission(session, "team.approve");
  const canDelete = hasPermission(session, "team.delete");

  const allUsers = await db.query.users.findMany({
    with: {
      teamMember: true,
      userRoles: { with: { role: true } },
    },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  const pending = allUsers.filter((u) => u.status === "PENDENTE");
  const members = allUsers.filter((u) => u.status !== "PENDENTE");

  return (
    <div>
      <PageHeader
        title="Equipe & Acessos"
        description="Colaboradores, níveis de acesso e aprovação de novos cadastros."
      />

      {canApprove && pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
            Aguardando aprovação
            <span className="rounded-full bg-amber-950 px-2 py-0.5 text-xs">{pending.length}</span>
          </h2>
          <div className="space-y-2">
            {pending.map((u) => (
              <PendingRow key={u.id} user={{ id: u.id, email: u.email, name: u.name }} />
            ))}
          </div>
        </section>
      )}

      {canCreate && <MemberForm />}

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          Nenhum colaborador cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Nível de acesso</th>
                <th className="px-4 py-3">Status</th>
                {(canUpdate || canDeactivate || canDelete) && <th className="px-4 py-3 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={{
                    id: member.id,
                    name: member.name,
                    email: member.email,
                    status: member.status,
                    isActive: member.isActive,
                    position: member.teamMember?.position ?? null,
                    phone: member.teamMember?.phone ?? null,
                    roles: member.userRoles.map((ur) => ur.role.name as RoleName),
                    isSelf: member.id === session.userId,
                  }}
                  canUpdate={canUpdate}
                  canDeactivate={canDeactivate}
                  canDelete={canDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

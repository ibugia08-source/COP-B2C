import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { resolveOptions } from "@/lib/config-options";
import { PageHeader } from "@/components/ui/primitives";
import { updateClient } from "../../actions";
import { ClientForm } from "../../client-form";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients.update");
  const { id } = await params;

  const [client, allUsers, niches] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, id) }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    resolveOptions("clients", "niche", { activeOnly: true }),
  ]);
  if (!client) notFound();

  const action = updateClient.bind(null, client.id);

  return (
    <div>
      <PageHeader title={`Editar — ${client.name}`} />
      <ClientForm
        client={client}
        users={allUsers}
        niches={niches.map((n) => n.value)}
        action={action}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}

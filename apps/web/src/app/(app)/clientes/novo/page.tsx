import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { resolveOptions } from "@/lib/config-options";
import { PageHeader } from "@/components/ui/primitives";
import { createClient } from "../actions";
import { ClientForm } from "../client-form";

export default async function NovoClientePage() {
  await requirePermission("clients.create");
  const [allUsers, niches] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    resolveOptions("clients", "niche", { activeOnly: true }),
  ]);

  return (
    <div>
      <PageHeader title="Novo cliente" description="Cadastro completo da ficha do cliente." />
      <ClientForm
        users={allUsers}
        niches={niches.map((n) => n.value)}
        action={createClient}
        submitLabel="Cadastrar cliente"
      />
    </div>
  );
}

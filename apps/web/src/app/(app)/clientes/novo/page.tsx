import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui/primitives";
import { createClient } from "../actions";
import { ClientForm } from "../client-form";

export default async function NovoClientePage() {
  await requirePermission("clients.create");
  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true));

  return (
    <div>
      <PageHeader title="Novo cliente" description="Cadastro completo da ficha do cliente." />
      <ClientForm users={allUsers} action={createClient} submitLabel="Cadastrar cliente" />
    </div>
  );
}

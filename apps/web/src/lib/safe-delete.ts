import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Exclusão definitiva segura por integridade referencial.
 *
 * Antes de remover a linha de `referencedTable`, anula (SET NULL) todas as
 * colunas de outras tabelas que referenciam `referencedTable.id` por FK
 * RESTRITIVA (NO ACTION/RESTRICT) — preservando o histórico operacional sem
 * violar integridade. FKs CASCADE e SET NULL são resolvidas pelo próprio banco.
 *
 * Tudo em uma transação: se qualquer passo falhar (ex.: FK restritiva em coluna
 * NOT NULL), nada é excluído e o erro sobe para o chamador tratar.
 */
export async function cascadeSafeDelete(referencedTable: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = ${referencedTable} AND ccu.column_name = 'id'
        AND rc.delete_rule NOT IN ('CASCADE', 'SET NULL')
    `);
    const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
      table_name: string;
      column_name: string;
    }[];
    for (const r of rows) {
      // não mexe na própria tabela (auto-referência) para não zerar antes do delete
      if (r.table_name === referencedTable) continue;
      await tx.execute(
        sql`UPDATE ${sql.identifier(r.table_name)} SET ${sql.identifier(r.column_name)} = NULL WHERE ${sql.identifier(r.column_name)} = ${id}`,
      );
    }
    await tx.execute(sql`DELETE FROM ${sql.identifier(referencedTable)} WHERE id = ${id}`);
  });
}

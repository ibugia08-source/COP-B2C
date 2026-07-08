import { getSession } from "@/lib/auth/session";
import { BUILTIN_GROUPS, resolveOptions, type ModuleKey } from "@/lib/config-options";
import { ConfigDrawerButton, type DrawerGroup } from "./config-drawer";

/**
 * Botão de engrenagem (admin/owner) que abre o drawer de configuração das
 * taxonomias do módulo. Renderiza nada para usuários comuns.
 */
export async function ModuleConfig({
  moduleKey,
  moduleLabel,
  buttonLabel,
}: {
  moduleKey: ModuleKey;
  moduleLabel: string;
  buttonLabel?: string;
}) {
  const session = await getSession();
  if (!session) return null;
  const isAdmin = session.roles.some((r) => r === "OWNER" || r === "ADMIN");
  if (!isAdmin) return null;

  const builtinGroups = BUILTIN_GROUPS.filter((g) => g.moduleKey === moduleKey);
  const groups: DrawerGroup[] = await Promise.all(
    builtinGroups.map(async (bg) => {
      const options = await resolveOptions(bg.moduleKey, bg.groupKey);
      return {
        moduleKey: bg.moduleKey,
        groupKey: bg.groupKey,
        name: bg.name,
        isSystem: bg.isSystem,
        options: options.map((o) => ({
          id: o.id,
          value: o.value,
          label: o.label,
          color: o.color,
          isActive: o.isActive,
          isDefault: o.isDefault,
          isSystem: o.isSystem,
        })),
      };
    }),
  );

  return <ConfigDrawerButton moduleLabel={moduleLabel} buttonLabel={buttonLabel} groups={groups} />;
}

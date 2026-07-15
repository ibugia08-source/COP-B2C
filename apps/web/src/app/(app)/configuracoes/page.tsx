import Link from "next/link";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { ROLE_NAMES } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

export default async function ConfiguracoesPage() {
  const session = await requirePermission("settings.view");
  const canUpdate = hasPermission(session, "settings.update");

  return (
    <div>
      <PageHeader title="Configurações" description="Parâmetros do sistema, permissões e ferramentas administrativas." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/configuracoes/servicos" className="block">
          <Card className="p-5 transition hover:border-zinc-600">
            <p className="text-2xl"><Icon name="module" /></p>
            <h3 className="mt-2 font-semibold">Serviços & Módulos</h3>
            <p className="mt-1 text-sm text-zinc-400">Serviços da agência e módulos opcionais (Co-piloto, Google).</p>
          </Card>
        </Link>
        <Link href="/equipe" className="block">
          <Card className="p-5 transition hover:border-zinc-600">
            <p className="text-2xl"><Icon name="team" /></p>
            <h3 className="mt-2 font-semibold">Equipe e papéis</h3>
            <p className="mt-1 text-sm text-zinc-400">Cadastre colaboradores e defina papéis de acesso.</p>
          </Card>
        </Link>
        <Link href="/automacoes" className="block">
          <Card className="p-5 transition hover:border-zinc-600">
            <p className="text-2xl"><Icon name="automations" /></p>
            <h3 className="mt-2 font-semibold">Automações</h3>
            <p className="mt-1 text-sm text-zinc-400">Ative/desative regras e veja o histórico de execução.</p>
          </Card>
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Matriz de permissões por papel</h2>
        {!canUpdate && (
          <p className="mb-3 text-xs text-zinc-500">Somente leitura — apenas OWNER altera configurações críticas.</p>
        )}
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900 uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Permissão</th>
                {ROLE_NAMES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center" title={r}>
                    {r.slice(0, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {PERMISSION_KEYS.map((key) => (
                <tr key={key} className="hover:bg-zinc-900/60">
                  <td className="px-3 py-1.5 font-mono text-zinc-300">{key}</td>
                  {ROLE_NAMES.map((role) => (
                    <td key={role} className="px-2 py-1.5 text-center">
                      {ROLE_PERMISSIONS[role]?.includes(key) ? (
                        <span className="text-emerald-400"><Icon name="check" /></span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

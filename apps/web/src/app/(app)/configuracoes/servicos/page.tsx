import { asc } from "drizzle-orm";
import { db } from "@/db";
import { agencyServices } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { FLAG_LABELS, getFeatureFlags, type FeatureFlags } from "@/lib/settings";
import { TONE_CLASSES, type Tone } from "@/lib/labels";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { FlagToggle, ServiceFormButton, ToggleServiceButton } from "./ui";

export default async function ServicosPage() {
  const session = await requirePermission("settings.view");
  const canEdit = hasPermission(session, "settings.update");

  const [services, flags] = await Promise.all([
    db.query.agencyServices.findMany({
      orderBy: [asc(agencyServices.order), asc(agencyServices.name)],
    }),
    getFeatureFlags(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Serviços & Módulos"
        description="Cadastro de serviços da agência (usados na ficha do cliente) e módulos opcionais do sistema."
        actions={<ServiceFormButton canEdit={canEdit} />}
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Serviços da agência</h2>
        {services.length === 0 ? (
          <EmptyState icon="module" title="Nenhum serviço cadastrado" description="Cadastre os serviços que a agência presta — eles aparecem na aba Operação da ficha do cliente." />
        ) : (
          <Table
            minWidth="560px"
            head={<><Th>Serviço</Th><Th>Categoria</Th><Th>Status</Th><Th className="text-right">Ações</Th></>}
          >
            {services.map((s) => (
              <tr key={s.id} className={`hover:bg-zinc-900/60 ${s.isActive ? "" : "opacity-50"}`}>
                <Td>
                  <p className="flex items-center gap-2 font-medium text-zinc-100">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full border ${TONE_CLASSES[(s.color as Tone) ?? "blue"] ?? ""}`} />
                    {s.name}
                  </p>
                  {s.description && <p className="text-xs text-zinc-500">{s.description}</p>}
                </Td>
                <Td className="text-zinc-400">{s.category ?? "—"}</Td>
                <Td>
                  <Badge tone={s.isActive ? "green" : "zinc"}>{s.isActive ? "ATIVO" : "INATIVO"}</Badge>
                </Td>
                <Td className="text-right">
                  {canEdit && (
                    <span className="inline-flex items-center gap-2">
                      <ServiceFormButton service={s} canEdit={canEdit} />
                      <ToggleServiceButton serviceId={s.id} isActive={s.isActive} />
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-[11px] text-zinc-500">
          Desativar um serviço apenas o esconde de novos cadastros — clientes que já o usam não são alterados.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Módulos opcionais (feature flags)</h2>
        <div className="space-y-2">
          {(Object.keys(FLAG_LABELS) as (keyof FeatureFlags)[]).map((key) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{FLAG_LABELS[key].label}</p>
                <p className="text-xs text-zinc-500">{FLAG_LABELS[key].description}</p>
              </div>
              {canEdit ? (
                <FlagToggle flag={key} enabled={flags[key]} />
              ) : (
                <Badge tone={flags[key] ? "green" : "zinc"}>{flags[key] ? "Ligado" : "Desligado"}</Badge>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Módulos em preparação: ligar a flag ainda não ativa a integração — a estrutura chega nas próximas fases sem travar o sistema.
        </p>
      </section>
    </div>
  );
}

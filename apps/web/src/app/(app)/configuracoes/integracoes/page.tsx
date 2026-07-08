import Link from "next/link";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { getGoogleDriveStatus } from "@/lib/google-drive";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { GoogleDriveControls } from "./ui";

export default async function IntegracoesPage() {
  const session = await requirePermission("settings.view");
  const canManage = hasPermission(session, "settings.update");
  const drive = await getGoogleDriveStatus();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Integrações"
        description="Conexões com serviços externos. O sistema funciona normalmente mesmo sem elas."
      />

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📁</span>
            <div>
              <h2 className="font-semibold">Google Drive</h2>
              <p className="text-xs text-zinc-500">
                Vincule documentos do Drive (Docs, Sheets, Slides, pastas) aos registros do COP B2C.
              </p>
            </div>
          </div>
          <Badge tone={drive.connected ? "green" : "zinc"}>
            {drive.connected ? "Conectado" : "Não conectado"}
          </Badge>
        </div>

        <GoogleDriveControls configured={drive.configured} connected={drive.connected} canManage={canManage} />

        <div className="mt-4 space-y-1 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
          <p>• As permissões internas do COP B2C não substituem as permissões do próprio Google Drive.</p>
          <p>• Um arquivo do Drive só abre para quem tiver acesso a ele no Google — o COP guarda apenas o link e os metadados.</p>
          <p>• Nunca salve senhas ou tokens aqui — credenciais ficam no Banco de Ativos Digitais.</p>
        </div>
      </Card>

      <p className="mt-4 text-sm text-zinc-500">
        <Link href="/configuracoes" className="text-emerald-400 hover:underline">← Voltar para Configurações</Link>
      </p>
    </div>
  );
}

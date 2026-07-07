"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ASSET_STATUS_META, ASSET_TYPE_LABEL } from "@/lib/labels";
import { Alert, Badge, Button, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import {
  confirmTrelloImport,
  previewTrelloImport,
  type ImportReport,
  type SerializablePreview,
} from "./actions";

export function TrelloImportWizard({ canConfirm }: { canConfirm: boolean }) {
  const router = useRouter();
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SerializablePreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File) {
    setError(null);
    setReport(null);
    setPreview(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setJsonText(text);
      startTransition(async () => {
        const result = await previewTrelloImport(text);
        if (result.error) setError(result.error);
        else setPreview(result.preview ?? null);
      });
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-10 text-center transition hover:border-emerald-600">
        <span className="text-2xl">📥</span>
        <span className="text-sm text-zinc-300">
          {fileName ? `Arquivo: ${fileName}` : "Clique para escolher o JSON exportado do Trello"}
        </span>
        <span className="text-xs text-zinc-500">
          No Trello: Menu do quadro → Imprimir e exportar → Exportar como JSON
        </span>
        <input
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>

      {pending && !preview && !report && <Alert tone="amber">Processando arquivo...</Alert>}
      {error && <Alert>{error}</Alert>}

      {preview && !report && (
        <div className="space-y-4">
          <Alert tone="amber">
            🔐 As credenciais encontradas nas descrições serão <strong>criptografadas na importação</strong> e
            nunca aparecem nesta prévia. Cartões com conteúdo não estruturado serão marcados como “precisa revisar”.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{preview.groups.length} grupos (listas)</Badge>
            <Badge tone="green">{preview.cards.length} ativos (cartões)</Badge>
            <Badge tone="purple">{preview.totalSecrets} segredos detectados</Badge>
            <Badge tone="amber">{preview.needsReviewCount} para revisar</Badge>
            {preview.skipped.length > 0 && <Badge tone="zinc">{preview.skipped.length} pulados</Badge>}
          </div>

          <Table
            minWidth="800px"
            head={
              <>
                <Th>Ativo</Th>
                <Th>Grupo</Th>
                <Th>Tipo detectado</Th>
                <Th>Status</Th>
                <Th>Conteúdo</Th>
              </>
            }
          >
            {preview.cards.slice(0, 60).map((c, i) => (
              <tr key={i} className="hover:bg-zinc-900/60">
                <Td className="text-zinc-200">
                  {c.title}
                  {c.needsReview && <Badge tone="amber"> revisar</Badge>}
                </Td>
                <Td className="text-zinc-400">{c.groupName}</Td>
                <Td className="text-zinc-400">{ASSET_TYPE_LABEL[c.assetType] ?? c.assetType}</Td>
                <Td><StatusBadge value={c.status} meta={ASSET_STATUS_META} /></Td>
                <Td className="text-xs text-zinc-500">
                  {c.secretCount > 0 && `🔐 ${c.secretCount} `}
                  {c.commentCount > 0 && `💬 ${c.commentCount} `}
                  {c.attachmentCount > 0 && `📎 ${c.attachmentCount}`}
                </Td>
              </tr>
            ))}
          </Table>
          {preview.cards.length > 60 && (
            <p className="text-xs text-zinc-500">Mostrando 60 de {preview.cards.length} cartões na prévia.</p>
          )}

          {canConfirm ? (
            <Button
              disabled={pending || preview.cards.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await confirmTrelloImport(jsonText!, fileName);
                  if (result.error) setError(result.error);
                  else {
                    setReport(result);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Importando e criptografando..." : `Importar ${preview.cards.length} ativos`}
            </Button>
          ) : (
            <Alert tone="amber">Você pode ver a prévia, mas apenas OWNER pode confirmar a importação.</Alert>
          )}
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <Alert tone="green">
            ✅ Importação concluída: {report.groups} grupos novos · {report.assets} ativos · {report.secrets} segredos
            criptografados · {report.comments} comentários.
          </Alert>
          {report.skipped && report.skipped.length > 0 && (
            <Table minWidth="500px" head={<><Th>Item</Th><Th>Motivo</Th></>}>
              {report.skipped.slice(0, 50).map((s, i) => (
                <tr key={i}>
                  <Td className="text-zinc-200">{s.name}</Td>
                  <Td className="text-xs text-zinc-400">{s.reason}</Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="text-xs text-zinc-500">
            📎 Anexos do Trello não são baixados automaticamente — os links ficaram registrados nos comentários de
            cada ativo para download manual e re-upload seguro.
          </p>
          <Button variant="secondary" href="/ativos">Abrir Banco de Ativos Digitais →</Button>
        </div>
      )}
    </div>
  );
}

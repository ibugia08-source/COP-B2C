"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ImportPreview } from "@/lib/import/clickup";
import { Alert, Badge, Button, Table, Td, Th } from "@/components/ui/primitives";
import { confirmClickupImport, previewClickupImport, type ImportReport } from "./actions";

export function ImportWizard({ canConfirm }: { canConfirm: boolean }) {
  const router = useRouter();
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
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
      setCsvText(text);
      startTransition(async () => {
        const result = await previewClickupImport(text);
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
          {fileName ? `Arquivo: ${fileName}` : "Clique para escolher o CSV exportado do ClickUp"}
        </span>
        <span className="text-xs text-zinc-500">Exporte a lista TRÁFEGO PAGO como CSV (List view → Export)</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>

      {pending && <Alert tone="amber">Processando arquivo...</Alert>}
      {error && <Alert>{error}</Alert>}

      {preview && !report && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{preview.clients} clientes prontos</Badge>
            <Badge tone="amber">{preview.tasks} linhas de tarefas (não importadas aqui)</Badge>
            <Badge tone="red">{preview.invalid} linhas com problema</Badge>
            {preview.unmappedHeaders.length > 0 && (
              <Badge tone="zinc">colunas ignoradas: {preview.unmappedHeaders.join(", ")}</Badge>
            )}
          </div>

          <Table
            minWidth="800px"
            head={
              <>
                <Th>Linha</Th>
                <Th>Nome</Th>
                <Th>Status ClickUp</Th>
                <Th>Vira</Th>
                <Th>Problema</Th>
              </>
            }
          >
            {preview.rows.slice(0, 50).map((r) => (
              <tr key={r.line} className="hover:bg-zinc-900/60">
                <Td className="text-zinc-500">{r.line}</Td>
                <Td className="text-zinc-200">{r.name || "—"}</Td>
                <Td className="text-zinc-400">{r.clickupStatus || "—"}</Td>
                <Td>
                  {r.kind === "client" ? (
                    <Badge tone="green">Cliente · {r.client?.status} · {r.client?.pipelineStage}</Badge>
                  ) : r.kind === "task" ? (
                    <Badge tone="amber">Tarefa (pular)</Badge>
                  ) : (
                    <Badge tone="red">Inválida</Badge>
                  )}
                </Td>
                <Td className="max-w-xs truncate text-xs text-zinc-500">{r.problem ?? "—"}</Td>
              </tr>
            ))}
          </Table>
          {preview.rows.length > 50 && (
            <p className="text-xs text-zinc-500">Mostrando 50 de {preview.rows.length} linhas na prévia.</p>
          )}

          {canConfirm ? (
            <Button
              disabled={pending || preview.clients === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await confirmClickupImport(csvText!, fileName);
                  if (result.error) setError(result.error);
                  else {
                    setReport(result);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Importando..." : `Confirmar importação de ${preview.clients} clientes`}
            </Button>
          ) : (
            <Alert tone="amber">Você pode visualizar a prévia, mas apenas OWNER pode confirmar a importação.</Alert>
          )}
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <Alert tone="green">
            ✅ Importação concluída: {report.imported} importados · {report.skipped} ignorados · {report.errors?.length ?? 0} com aviso/erro.
          </Alert>
          {report.errors && report.errors.length > 0 && (
            <Table minWidth="600px" head={<><Th>Linha</Th><Th>Nome</Th><Th>Problema</Th></>}>
              {report.errors.map((e, i) => (
                <tr key={i}>
                  <Td className="text-zinc-500">{e.line}</Td>
                  <Td className="text-zinc-200">{e.name}</Td>
                  <Td className="text-xs text-zinc-400">{e.problem}</Td>
                </tr>
              ))}
            </Table>
          )}
          <Button variant="secondary" href="/clientes">Ver clientes importados →</Button>
        </div>
      )}
    </div>
  );
}

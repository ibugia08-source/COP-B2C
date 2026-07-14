import { redirect } from "next/navigation";

type Search = Record<string, string | string[] | undefined>;

// A carteira de clientes foi unificada na tela de Operação (Kanban em cima, lista embaixo).
// As subrotas /clientes/[id], /clientes/novo e /clientes/[id]/editar seguem existindo;
// apenas o índice /clientes redireciona para /operacao, preservando os filtros na URL.
export default async function ClientesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) qs.set(k, v);
  const s = qs.toString();
  redirect(s ? `/operacao?${s}` : "/operacao");
}

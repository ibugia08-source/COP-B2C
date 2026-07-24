"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Voltar" que PRESERVA o estado da tela anterior (filtros, busca, ordenação,
 * página do calendário…).
 *
 * Um <Link href="/tarefas"> fixo descartava a querystring: quem tinha filtro
 * aplicado, abria uma tarefa e voltava, perdia o filtro. Aqui usamos o
 * histórico do navegador, que restaura a URL exata de onde o usuário veio.
 *
 * `href` é o destino de fallback (acesso direto pela URL, sem histórico) e
 * mantém o link navegável/acessível (abrir em nova aba, etc.).
 */
export function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // só intercepta o clique simples: ctrl/cmd/meio abrem em nova aba
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </Link>
  );
}

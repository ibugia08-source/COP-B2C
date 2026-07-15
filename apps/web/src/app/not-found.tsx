import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl"><Icon name="copilot" /></p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-zinc-400">O endereço que você tentou abrir não existe no COP B2C.</p>
      <Link
        href="/"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Voltar ao Dashboard
      </Link>
    </main>
  );
}

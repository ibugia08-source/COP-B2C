import Link from "next/link";

export default function AcessoNegadoPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-full border border-amber-900 bg-amber-950/40 p-4 text-3xl">🔒</div>
      <h1 className="mt-4 text-xl font-semibold">Acesso negado</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-400">
        Seu papel atual não tem permissão para acessar esta área. Se você acredita que deveria
        ter acesso, fale com um administrador do COP B2C.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { login, signup, type LoginState, type SignupState } from "@/lib/auth/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-500";

function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-300">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoFocus autoComplete="email" placeholder="voce@b2cgestao.com.br" className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-300">
          Senha
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className={inputClass} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signup, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="su-email" className="mb-1 block text-sm font-medium text-zinc-300">
          E-mail
        </label>
        <input id="su-email" name="email" type="email" required autoComplete="email" placeholder="voce@b2cgestao.com.br" className={inputClass} />
      </div>
      <div>
        <label htmlFor="su-password" className="mb-1 block text-sm font-medium text-zinc-300">
          Senha
        </label>
        <input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className={inputClass} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-300">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Novos acessos passam por aprovação de um administrador antes do primeiro login.
      </p>
    </form>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            COP <span className="text-emerald-400">B2C</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Central Operacional da B2C Gestão</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === "login" ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === "signup" ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              Criar conta
            </button>
          </div>

          {tab === "login" ? <LoginForm /> : <SignupForm />}
        </div>
      </div>
    </main>
  );
}

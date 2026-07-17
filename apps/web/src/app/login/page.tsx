"use client";

import { useActionState, useState } from "react";
import { login, signup, type LoginState, type SignupState } from "@/lib/auth/actions";
import { Input, Label, Logo, buttonClass } from "@/components/ui/primitives";

// ---------------------------------------------------------------------------
// Painel de marca (esquerda): frase de impacto sobre o azul da marca.
// Tipografia com contraste de peso — leve nas conjunções, forte nos termos-chave.
// ---------------------------------------------------------------------------
function BrandPanel() {
  return (
    <aside className="relative isolate flex flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-8 py-12 text-white sm:px-10 lg:px-14 lg:py-16">
      {/* Brilho e vinheta suaves para dar profundidade ao fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            "radial-gradient(60% 55% at 82% 6%, rgba(255,255,255,0.22), transparent 60%)",
            "radial-gradient(55% 55% at 4% 100%, rgba(3,18,55,0.40), transparent 60%)",
          ].join(", "),
        }}
      />
      {/* Grade fina, esmaecida nas bordas — textura de "console" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(78% 78% at 50% 42%, #000, transparent)",
          WebkitMaskImage: "radial-gradient(78% 78% at 50% 42%, #000, transparent)",
        }}
      />

      {/* Topo: wordmark em branco (apenas desktop — no mobile o logo fica acima do formulário) */}
      <span
        aria-hidden
        className="brand-logo hidden h-5 lg:inline-block"
        style={{ background: "#ffffff" }}
      />

      {/* Meio: frase de impacto */}
      <div className="max-w-md py-10 lg:py-0">
        <h1 className="text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
          <span className="block font-light text-white/90">Bem-vindo ao</span>
          <span className="block font-bold">centro de comando</span>
          <span className="block font-light text-white/90">
            da <span className="font-bold text-white">B2C</span>.
          </span>
        </h1>
        <p className="mt-6 max-w-sm text-base leading-relaxed text-white/80">
          Clientes, tarefas, metas e ativos — toda a operação da B2C Gestão
          reunida em um só lugar, com o acesso certo para cada pessoa.
        </p>
      </div>

      {/* Rodapé: linha de confiança */}
      <p className="text-sm text-white/70">Acesso restrito à equipe · b2cgestao.com.br</p>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Formulários (comportamento inalterado — server actions login/signup)
// ---------------------------------------------------------------------------
function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required autoFocus autoComplete="email" placeholder="voce@b2cgestao.com.br" />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} mt-1 w-full py-2.5`}>
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
        <Label htmlFor="su-email">E-mail</Label>
        <Input id="su-email" name="email" type="email" required autoComplete="email" placeholder="voce@b2cgestao.com.br" />
      </div>
      <div>
        <Label htmlFor="su-password">Senha</Label>
        <Input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
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
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} mt-1 w-full py-2.5`}>
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Novos acessos passam por aprovação de um administrador antes do primeiro login.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Página: split-screen (marca à esquerda, formulário à direita)
// ---------------------------------------------------------------------------
export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <section className="flex items-center justify-center bg-zinc-950 px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* Logo da marca substitui a antiga escrita "COP B2C" */}
          <div className="mb-8">
            <Logo className="h-8" />
            <p className="mt-3 text-sm text-zinc-400">Central Operacional da B2C Gestão</p>
          </div>

          {/* Alternador Entrar / Criar conta */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              aria-pressed={tab === "login"}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                tab === "login"
                  ? "bg-zinc-900 font-semibold text-emerald-700 shadow-soft"
                  : "font-medium text-zinc-500 hover:text-zinc-100"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              aria-pressed={tab === "signup"}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                tab === "signup"
                  ? "bg-zinc-900 font-semibold text-emerald-700 shadow-soft"
                  : "font-medium text-zinc-500 hover:text-zinc-100"
              }`}
            >
              Criar conta
            </button>
          </div>

          {tab === "login" ? <LoginForm /> : <SignupForm />}
        </div>
      </section>
    </main>
  );
}

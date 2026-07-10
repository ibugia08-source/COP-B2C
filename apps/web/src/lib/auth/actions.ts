"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { notifyRole } from "@/lib/notify";
import { hashPassword, verifyPassword } from "./password";
import { clearSessionCookie, setSessionCookie } from "./session";
import { getSession } from "./session-server";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export type LoginState = { error?: string };
export type SignupState = { error?: string; success?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
    with: { userRoles: { with: { role: true } } },
  });

  const invalid = { error: "E-mail ou senha incorretos." };
  if (!user) return invalid;
  if (!verifyPassword(parsed.data.password, user.passwordHash)) {
    await logActivity({
      userId: user.id,
      action: "auth.loginFailed",
      entityType: "user",
      entityId: user.id,
    });
    return invalid;
  }
  // Só contas ATIVAS entram — status controla o acesso.
  if (user.status === "PENDENTE") {
    return { error: "Sua conta ainda aguarda aprovação de um administrador." };
  }
  if (user.status === "REJEITADO") {
    return { error: "Seu acesso foi recusado. Fale com um administrador." };
  }
  if (user.status === "INATIVO" || !user.isActive) {
    return { error: "Usuário desativado. Fale com um administrador." };
  }

  // Token mínimo: papéis/nome/e-mail são reconsultados do banco a cada request.
  await setSessionCookie({ userId: user.id, sv: user.sessionVersion });
  await logActivity({
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  redirect("/");
}

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
});

/**
 * Auto-cadastro público: cria a conta como PENDENTE (sem papéis e sem sessão).
 * Um administrador precisa aprovar e definir o nível de acesso dentro do sistema.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (existing) {
    // resposta neutra para não revelar quais e-mails já existem
    return {
      success:
        "Se ainda não houver conta com este e-mail, ela será criada e ficará aguardando aprovação de um administrador.",
    };
  }

  // nome provisório derivado do e-mail — o admin ajusta na aprovação
  const provisionalName = parsed.data.email.split("@")[0].replace(/[._-]+/g, " ").trim() || parsed.data.email;

  const [user] = await db
    .insert(users)
    .values({
      name: provisionalName,
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      status: "PENDENTE",
      isActive: false,
      signupSource: "SELF_SIGNUP",
    })
    .returning();

  await logActivity({
    userId: user.id,
    action: "auth.signupRequested",
    entityType: "user",
    entityId: user.id,
    metadata: { email: user.email },
  });
  // avisa quem pode aprovar
  await notifyRole("OWNER", {
    title: "Novo acesso aguardando aprovação",
    body: `${user.email} solicitou acesso ao COP B2C.`,
    type: "SISTEMA",
    entityType: "user",
    entityId: user.id,
  });
  await notifyRole("ADMIN", {
    title: "Novo acesso aguardando aprovação",
    body: `${user.email} solicitou acesso ao COP B2C.`,
    type: "SISTEMA",
    entityType: "user",
    entityId: user.id,
  });

  return {
    success:
      "Conta criada! Seu acesso está aguardando aprovação de um administrador. Você poderá entrar assim que for liberado.",
  };
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logActivity({
      userId: session.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: session.userId,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}

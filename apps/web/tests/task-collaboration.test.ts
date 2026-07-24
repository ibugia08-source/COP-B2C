import { describe, expect, it } from "vitest";
import { denyTaskWrite, isTaskOwner } from "@/lib/auth/ownership";
import { can } from "@/lib/auth/access";
import { cargoDefaultPermissions } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * REGRA DE COLABORAÇÃO (2026-07-24): edição de tarefas é compartilhada — quem
 * tem a permissão do módulo edita qualquer tarefa. Estes testes fixam a regra
 * no seu ponto único (denyTaskWrite) e os LIMITES que continuam valendo.
 * Se alguém reintroduzir o gate de ownership, estes testes quebram.
 */

function makeSession(userId: string, cargo: NonNullable<SessionPayload["cargo"]>): SessionPayload {
  return {
    userId,
    name: `Usuário ${userId}`,
    email: `${userId}@teste.dev`,
    cargo,
    permissions: [...cargoDefaultPermissions(cargo)],
  };
}

describe("edição compartilhada de tarefas (denyTaskWrite)", () => {
  it("usuário A edita tarefa criada/atribuída a B: não há negação por ownership", async () => {
    const userA = makeSession("user-a", "GESTOR_TRAFEGO");
    // a tarefa pertence a OUTRO usuário — antes disso negava; agora não nega
    expect(await denyTaskWrite(userA, "tarefa-de-b", "updateTask")).toBeNull();
    expect(await denyTaskWrite(userA, "tarefa-de-b", "changeTaskStatus")).toBeNull();
    expect(await denyTaskWrite(userA, "tarefa-de-b", "reorderTaskOnBoard")).toBeNull();
    expect(await denyTaskWrite(userA, "tarefa-de-b", "assignTask", "tasks.assign")).toBeNull();
    expect(await denyTaskWrite(userA, "tarefa-de-b", "bulkDeleteTasks", "tasks.delete")).toBeNull();
  });

  it("vale para qualquer cargo com acesso ao módulo, não só administradores", async () => {
    for (const cargo of ["GESTOR_TRAFEGO", "COMERCIAL", "DIRETOR_CRIATIVO"] as const) {
      const s = makeSession(`user-${cargo}`, cargo);
      expect(await denyTaskWrite(s, "qualquer-tarefa", "updateTask")).toBeNull();
    }
  });
});

describe("limites que CONTINUAM valendo", () => {
  it("permissão do módulo ainda é exigida (checkPermission usa can): cargo sem tasks.update segue bloqueado", () => {
    // A regra compartilhada NÃO abre o módulo para quem não tem a permissão —
    // o gate de módulo é o checkPermission de cada action, que consulta `can`.
    const semPermissao: SessionPayload = {
      userId: "user-x",
      name: "Sem Acesso",
      email: "x@teste.dev",
      cargo: null,
      permissions: [], // nenhum acesso concedido
    };
    expect(can(semPermissao, "tasks.update")).toBe(false);
    expect(can(semPermissao, "tasks.delete")).toBe(false);
    expect(can(semPermissao, "tasks.complete")).toBe(false);
  });

  it("cargos operacionais têm tasks.update por padrão (a colaboração é utilizável)", () => {
    for (const cargo of ["ADMINISTRADOR_GERAL", "GESTOR_TRAFEGO", "DIRETOR_CRIATIVO"] as const) {
      const s = makeSession(`user-${cargo}`, cargo);
      expect(can(s, "tasks.update")).toBe(true);
    }
  });
});

describe("isTaskOwner segue existindo como CONCEITO de vínculo (filtro 'atreladas a mim')", () => {
  const base = { assignedToId: null, createdById: null, assigneeIds: [] as string[], client: null };

  it("continua identificando vínculo (não autoriza mais escrita, só classifica)", () => {
    expect(isTaskOwner("u1", { ...base, assignedToId: "u1" })).toBe(true);
    expect(isTaskOwner("u1", { ...base, assignedToId: "u2" })).toBe(false);
  });
});

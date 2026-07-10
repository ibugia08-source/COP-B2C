import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from "@/lib/auth/permissions";
import {
  assetOwnershipCheck,
  clientOwnershipCheck,
  taskOwnershipCheck,
} from "@/lib/auth/ownership";
import { ROLE_NAMES } from "@/db/schema";

describe("matriz de permissões", () => {
  it("OWNER tem todas as permissões", () => {
    for (const key of PERMISSION_KEYS) {
      expect(roleHasPermission(["OWNER"], key)).toBe(true);
    }
  });

  it("ADMIN tem tudo exceto settings.update", () => {
    expect(roleHasPermission(["ADMIN"], "settings.update")).toBe(false);
    expect(roleHasPermission(["ADMIN"], "settings.view")).toBe(true);
    expect(roleHasPermission(["ADMIN"], "digital_assets.reveal_secrets")).toBe(true);
    expect(roleHasPermission(["ADMIN"], "digital_assets.view_audit_logs")).toBe(true);
  });

  it("módulo Equipe é exclusivo de administradores (OWNER/ADMIN)", () => {
    expect(roleHasPermission(["OWNER"], "team.view")).toBe(true);
    expect(roleHasPermission(["ADMIN"], "team.view")).toBe(true);
    expect(roleHasPermission(["OWNER"], "team.approve")).toBe(true);
    expect(roleHasPermission(["ADMIN"], "team.approve")).toBe(true);
    for (const role of ["GESTOR_OPERACIONAL", "GESTOR_TRAFEGO", "SOCIAL_MEDIA", "DESIGNER", "COMERCIAL"] as const) {
      expect(roleHasPermission([role], "team.view")).toBe(false);
      expect(roleHasPermission([role], "team.create")).toBe(false);
      expect(roleHasPermission([role], "team.approve")).toBe(false);
    }
  });

  it("não existe mais nenhuma permissão financeira nem papel FINANCEIRO", () => {
    expect(PERMISSION_KEYS.some((k) => k.startsWith("finance."))).toBe(false);
    expect(PERMISSION_KEYS.some((k) => k.startsWith("vault."))).toBe(false);
    expect((ROLE_NAMES as readonly string[]).includes("FINANCEIRO")).toBe(false);
  });

  it("GESTOR_OPERACIONAL gerencia ativos e grupos mas NÃO revela segredos", () => {
    expect(roleHasPermission(["GESTOR_OPERACIONAL"], "digital_assets.view")).toBe(true);
    expect(roleHasPermission(["GESTOR_OPERACIONAL"], "digital_assets.create")).toBe(true);
    expect(roleHasPermission(["GESTOR_OPERACIONAL"], "digital_assets.manage_groups")).toBe(true);
    expect(roleHasPermission(["GESTOR_OPERACIONAL"], "digital_assets.reveal_secrets")).toBe(false);
    expect(roleHasPermission(["GESTOR_OPERACIONAL"], "digital_assets.copy_secrets")).toBe(false);
  });

  it("GESTOR_TRAFEGO revela e copia segredos", () => {
    expect(roleHasPermission(["GESTOR_TRAFEGO"], "digital_assets.reveal_secrets")).toBe(true);
    expect(roleHasPermission(["GESTOR_TRAFEGO"], "digital_assets.copy_secrets")).toBe(true);
    expect(roleHasPermission(["GESTOR_TRAFEGO"], "digital_assets.view_audit_logs")).toBe(false);
  });

  it("SOCIAL_MEDIA revela segredos mas não copia nem gerencia grupos", () => {
    expect(roleHasPermission(["SOCIAL_MEDIA"], "digital_assets.reveal_secrets")).toBe(true);
    expect(roleHasPermission(["SOCIAL_MEDIA"], "digital_assets.copy_secrets")).toBe(false);
    expect(roleHasPermission(["SOCIAL_MEDIA"], "digital_assets.manage_groups")).toBe(false);
  });

  it("DESIGNER só vê ativos e baixa anexos — sem metadados de segredos", () => {
    expect(roleHasPermission(["DESIGNER"], "digital_assets.view")).toBe(true);
    expect(roleHasPermission(["DESIGNER"], "digital_assets.download_attachments")).toBe(true);
    expect(roleHasPermission(["DESIGNER"], "digital_assets.view_secrets_metadata")).toBe(false);
    expect(roleHasPermission(["DESIGNER"], "digital_assets.reveal_secrets")).toBe(false);
    expect(roleHasPermission(["DESIGNER"], "clients.view")).toBe(false);
  });

  it("COMERCIAL vê ativos básicos sem segredos", () => {
    expect(roleHasPermission(["COMERCIAL"], "digital_assets.view")).toBe(true);
    expect(roleHasPermission(["COMERCIAL"], "digital_assets.view_secrets_metadata")).toBe(false);
    expect(roleHasPermission(["COMERCIAL"], "digital_assets.reveal_secrets")).toBe(false);
  });

  it("CLIENTE_CONVIDADO não acessa nada do Banco de Ativos", () => {
    for (const key of PERMISSION_KEYS) {
      expect(roleHasPermission(["CLIENTE_CONVIDADO"], key)).toBe(false);
    }
  });

  it("múltiplos papéis somam permissões", () => {
    expect(roleHasPermission(["DESIGNER", "GESTOR_TRAFEGO"], "digital_assets.reveal_secrets")).toBe(true);
  });

  it("todos os papéis declarados têm entrada na matriz e só referenciam permissões existentes", () => {
    const valid = new Set<string>(PERMISSION_KEYS);
    for (const role of ROLE_NAMES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      for (const key of ROLE_PERMISSIONS[role]) expect(valid.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Escopo de ownership (P0.2): além do RBAC, operar exige ser responsável
// ---------------------------------------------------------------------------

const CLIENT = {
  strategistId: "u-estrategista",
  trafficManager1Id: "u-gestor1",
  trafficManager2Id: "u-gestor2",
  mainResponsibleId: "u-principal",
};

describe("ownership de clientes (clientOwnershipCheck)", () => {
  it("OWNER e ADMIN acessam qualquer cliente, mesmo sem serem responsáveis", () => {
    expect(clientOwnershipCheck(["OWNER"], "u-qualquer", CLIENT)).toBe(true);
    expect(clientOwnershipCheck(["ADMIN"], "u-qualquer", CLIENT)).toBe(true);
  });

  it("cada um dos 4 responsáveis acessa; um terceiro não", () => {
    for (const role of ["GESTOR_TRAFEGO", "GESTOR_OPERACIONAL", "SOCIAL_MEDIA", "COMERCIAL"] as const) {
      expect(clientOwnershipCheck([role], "u-estrategista", CLIENT)).toBe(true);
      expect(clientOwnershipCheck([role], "u-gestor1", CLIENT)).toBe(true);
      expect(clientOwnershipCheck([role], "u-gestor2", CLIENT)).toBe(true);
      expect(clientOwnershipCheck([role], "u-principal", CLIENT)).toBe(true);
      expect(clientOwnershipCheck([role], "u-intruso", CLIENT)).toBe(false);
    }
  });

  it("cliente inexistente ou sem responsáveis nega para não-admin", () => {
    expect(clientOwnershipCheck(["GESTOR_TRAFEGO"], "u1", null)).toBe(false);
    expect(
      clientOwnershipCheck(["GESTOR_TRAFEGO"], "u1", {
        strategistId: null,
        trafficManager1Id: null,
        trafficManager2Id: null,
        mainResponsibleId: null,
      }),
    ).toBe(false);
  });
});

describe("ownership de ativos digitais (assetOwnershipCheck)", () => {
  it("ativo de cliente: responsável acessa, terceiro não", () => {
    const asset = { clientId: "c1", client: CLIENT };
    expect(assetOwnershipCheck(["GESTOR_TRAFEGO"], "u-gestor1", asset)).toBe(true);
    expect(assetOwnershipCheck(["SOCIAL_MEDIA"], "u-principal", asset)).toBe(true);
    expect(assetOwnershipCheck(["GESTOR_TRAFEGO"], "u-intruso", asset)).toBe(false);
    expect(assetOwnershipCheck(["SOCIAL_MEDIA"], "u-intruso", asset)).toBe(false);
  });

  it("ativo interno (sem cliente): só OWNER/ADMIN/GESTOR_OPERACIONAL", () => {
    const internal = { clientId: null, client: null };
    expect(assetOwnershipCheck(["OWNER"], "u1", internal)).toBe(true);
    expect(assetOwnershipCheck(["ADMIN"], "u1", internal)).toBe(true);
    expect(assetOwnershipCheck(["GESTOR_OPERACIONAL"], "u1", internal)).toBe(true);
    expect(assetOwnershipCheck(["GESTOR_TRAFEGO"], "u1", internal)).toBe(false);
    expect(assetOwnershipCheck(["SOCIAL_MEDIA"], "u1", internal)).toBe(false);
    expect(assetOwnershipCheck(["DESIGNER"], "u1", internal)).toBe(false);
  });

  it("OWNER/ADMIN acessam qualquer ativo; ativo inexistente nega", () => {
    expect(assetOwnershipCheck(["ADMIN"], "u1", { clientId: "c1", client: CLIENT })).toBe(true);
    expect(assetOwnershipCheck(["GESTOR_TRAFEGO"], "u1", null)).toBe(false);
  });
});

describe("ownership de tarefas (taskOwnershipCheck)", () => {
  const base = { assignedToId: null, createdById: null, assigneeIds: [] as string[], client: null };

  it("responsável, adicional e criador escrevem", () => {
    expect(taskOwnershipCheck(["DESIGNER"], "u1", { ...base, assignedToId: "u1" })).toBe(true);
    expect(taskOwnershipCheck(["DESIGNER"], "u1", { ...base, createdById: "u1" })).toBe(true);
    expect(taskOwnershipCheck(["DESIGNER"], "u1", { ...base, assigneeIds: ["u2", "u1"] })).toBe(true);
  });

  it("responsável pelo cliente da tarefa escreve; terceiro não", () => {
    expect(taskOwnershipCheck(["GESTOR_TRAFEGO"], "u-gestor1", { ...base, client: CLIENT })).toBe(true);
    expect(
      taskOwnershipCheck(["GESTOR_TRAFEGO"], "u-intruso", { ...base, assignedToId: "u2", client: CLIENT }),
    ).toBe(false);
  });

  it("tarefa interna sem dono é colaborativa; com dono, só o dono/admins", () => {
    expect(taskOwnershipCheck(["SOCIAL_MEDIA"], "u1", base)).toBe(true);
    expect(taskOwnershipCheck(["SOCIAL_MEDIA"], "u1", { ...base, assignedToId: "u2" })).toBe(false);
    expect(taskOwnershipCheck(["ADMIN"], "u1", { ...base, assignedToId: "u2" })).toBe(true);
  });
});

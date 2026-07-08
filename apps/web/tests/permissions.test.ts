import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from "@/lib/auth/permissions";
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

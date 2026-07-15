import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_GRANT,
  allVariantOf,
  baseOfAll,
  CARGO_DEFAULT_PERMISSIONS,
  cargoDefaultPermissions,
  effectivePermissions,
  PERMISSION_KEYS,
} from "@/lib/auth/permissions";
import { isAssetOwner, isClientOwner, isTaskOwner } from "@/lib/auth/ownership";
import { CARGO_NAMES } from "@/db/schema";

describe("catálogo e pacotes padrão por cargo", () => {
  it("todo cargo tem pacote e só referencia chaves existentes", () => {
    const valid = new Set<string>(PERMISSION_KEYS);
    for (const cargo of CARGO_NAMES) {
      expect(CARGO_DEFAULT_PERMISSIONS[cargo]).toBeDefined();
      for (const key of CARGO_DEFAULT_PERMISSIONS[cargo]) expect(valid.has(key)).toBe(true);
    }
  });

  it("ADMINISTRADOR_GERAL tem todas as permissões", () => {
    for (const key of PERMISSION_KEYS) {
      expect(CARGO_DEFAULT_PERMISSIONS.ADMINISTRADOR_GERAL.includes(key)).toBe(true);
    }
  });

  it("base universal: todos os cargos veem clientes/tarefas e criam/atribuem tarefas", () => {
    for (const cargo of CARGO_NAMES) {
      const perms = new Set(cargoDefaultPermissions(cargo));
      for (const key of ["clients.view", "tasks.view", "tasks.create", "tasks.assign"] as const) {
        expect(perms.has(key)).toBe(true);
      }
    }
  });

  it("GESTOR_TRAFEGO revela e copia segredos, inclusive restritos", () => {
    const p = new Set(cargoDefaultPermissions("GESTOR_TRAFEGO"));
    expect(p.has("digital_assets.reveal_secrets")).toBe(true);
    expect(p.has("digital_assets.copy_secrets")).toBe(true);
    expect(p.has("digital_assets.reveal_restricted_secrets")).toBe(true);
  });

  it("SOCIAL_MEDIA revela segredos comuns mas NÃO os restritos (tokens/API/2FA)", () => {
    const p = new Set(cargoDefaultPermissions("SOCIAL_MEDIA"));
    expect(p.has("digital_assets.reveal_secrets")).toBe(true);
    expect(p.has("digital_assets.reveal_restricted_secrets")).toBe(false);
    expect(p.has("digital_assets.copy_secrets")).toBe(false);
  });

  it("DIRETOR_CRIATIVO gerencia QUALQUER tarefa do time (variantes _all)", () => {
    const p = new Set(cargoDefaultPermissions("DIRETOR_CRIATIVO"));
    expect(p.has("tasks.update_all")).toBe(true);
    expect(p.has("tasks.complete_all")).toBe(true);
    // sem segredos por padrão
    expect(p.has("digital_assets.reveal_secrets")).toBe(false);
  });

  it("COMERCIAL cadastra clientes; DESIGNER é enxuto", () => {
    expect(cargoDefaultPermissions("COMERCIAL")).toContain("clients.create");
    const designer = new Set(cargoDefaultPermissions("DESIGNER"));
    expect(designer.has("digital_assets.download_attachments")).toBe(true);
    expect(designer.has("clients.create")).toBe(false);
    expect(designer.has("digital_assets.reveal_secrets")).toBe(false);
  });

  it("nenhum cargo (exceto Admin Geral) tem team.* ou settings.* por padrão", () => {
    for (const cargo of CARGO_NAMES) {
      if (cargo === "ADMINISTRADOR_GERAL") continue;
      const p = new Set(cargoDefaultPermissions(cargo));
      for (const key of PERMISSION_KEYS) {
        if (key.startsWith("team.") || key.startsWith("settings.")) {
          expect(p.has(key)).toBe(false);
        }
      }
    }
  });
});

describe("permissões efetivas (cargo ∪ extras, grant-only)", () => {
  it("extras adicionam ao pacote do cargo", () => {
    const eff = new Set(effectivePermissions("DESIGNER", ["clients.update_all"]));
    expect(eff.has("clients.update_all")).toBe(true);
    // mantém o padrão do cargo
    expect(eff.has("tasks.view")).toBe(true);
  });

  it("chaves extras inexistentes são ignoradas", () => {
    const eff = effectivePermissions("DESIGNER", ["nao.existe", "finance.tudo"]);
    expect(eff.some((k) => (k as string) === "nao.existe")).toBe(false);
  });

  it("cargo nulo sem extras = nenhuma permissão", () => {
    expect(effectivePermissions(null)).toEqual([]);
  });
});

describe("escopo próprio × amplo", () => {
  it("baseOfAll e allVariantOf são inversos quando a variante existe", () => {
    expect(allVariantOf("tasks.update")).toBe("tasks.update_all");
    expect(baseOfAll("tasks.update_all")).toBe("tasks.update");
    expect(allVariantOf("tasks.view")).toBeNull(); // sem variante ampla
    expect(baseOfAll("tasks.view")).toBeNull();
  });
});

describe("teto de delegação (ADMIN_ONLY_GRANT)", () => {
  it("inclui as chaves sensíveis", () => {
    for (const key of [
      "team.grant_permissions",
      "team.change_role",
      "settings.update",
      "integrations.manage",
      "digital_assets.create_secrets",
      "digital_assets.reveal_restricted_secrets",
    ] as const) {
      expect(ADMIN_ONLY_GRANT.has(key)).toBe(true);
    }
  });

  it("não inclui permissões operacionais comuns", () => {
    for (const key of ["tasks.create", "clients.view", "digital_assets.view"] as const) {
      expect(ADMIN_ONLY_GRANT.has(key)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Ownership: agora membership PURA (elevação por _all/Admin fica no resolvedor)
// ---------------------------------------------------------------------------

const CLIENT = {
  strategistId: "u-estrategista",
  trafficManager1Id: "u-gestor1",
  trafficManager2Id: "u-gestor2",
};

describe("isClientOwner (membership)", () => {
  it("cada um dos 3 responsáveis é dono; um terceiro não", () => {
    expect(isClientOwner("u-estrategista", CLIENT)).toBe(true);
    expect(isClientOwner("u-gestor1", CLIENT)).toBe(true);
    expect(isClientOwner("u-gestor2", CLIENT)).toBe(true);
    expect(isClientOwner("u-intruso", CLIENT)).toBe(false);
  });

  it("cliente nulo/sem responsáveis nega", () => {
    expect(isClientOwner("u1", null)).toBe(false);
    expect(
      isClientOwner("u1", { strategistId: null, trafficManager1Id: null, trafficManager2Id: null }),
    ).toBe(false);
  });
});

describe("isAssetOwner (membership)", () => {
  it("ativo de cliente: responsável é dono, terceiro não", () => {
    const asset = { clientId: "c1", client: CLIENT };
    expect(isAssetOwner("u-gestor1", asset)).toBe(true);
    expect(isAssetOwner("u-intruso", asset)).toBe(false);
  });

  it("ativo interno (sem cliente) não tem dono — elevação fica no resolvedor", () => {
    expect(isAssetOwner("u1", { clientId: null, client: null })).toBe(false);
  });
});

describe("isTaskOwner (membership)", () => {
  const base = { assignedToId: null, createdById: null, assigneeIds: [] as string[], client: null };

  it("responsável, adicional e criador são donos", () => {
    expect(isTaskOwner("u1", { ...base, assignedToId: "u1" })).toBe(true);
    expect(isTaskOwner("u1", { ...base, createdById: "u1" })).toBe(true);
    expect(isTaskOwner("u1", { ...base, assigneeIds: ["u2", "u1"] })).toBe(true);
  });

  it("responsável pelo cliente da tarefa é dono; terceiro não", () => {
    expect(isTaskOwner("u-gestor1", { ...base, client: CLIENT })).toBe(true);
    expect(isTaskOwner("u-intruso", { ...base, assignedToId: "u2", client: CLIENT })).toBe(false);
  });

  it("tarefa interna sem dono é colaborativa; com dono, só o dono", () => {
    expect(isTaskOwner("u1", base)).toBe(true);
    expect(isTaskOwner("u1", { ...base, assignedToId: "u2" })).toBe(false);
  });
});

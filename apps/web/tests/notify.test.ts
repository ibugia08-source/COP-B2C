import { describe, expect, it } from "vitest";
import { isNotifiableUser } from "@/lib/notify";

// P1.2 — notifyRole não pode notificar usuários INATIVO/PENDENTE/REJEITADO.
// A query filtra no SQL (isActive + status ATIVO) e o predicado abaixo é a
// mesma regra aplicada em memória (dupla barreira).

describe("isNotifiableUser", () => {
  it("aceita apenas usuário ativo com status ATIVO", () => {
    expect(isNotifiableUser({ isActive: true, status: "ATIVO" })).toBe(true);
  });

  it("rejeita INATIVO, PENDENTE e REJEITADO", () => {
    expect(isNotifiableUser({ isActive: false, status: "INATIVO" })).toBe(false);
    expect(isNotifiableUser({ isActive: false, status: "PENDENTE" })).toBe(false);
    expect(isNotifiableUser({ isActive: false, status: "REJEITADO" })).toBe(false);
  });

  it("rejeita combinações inconsistentes (flag e status divergentes)", () => {
    expect(isNotifiableUser({ isActive: true, status: "PENDENTE" })).toBe(false);
    expect(isNotifiableUser({ isActive: false, status: "ATIVO" })).toBe(false);
  });
});

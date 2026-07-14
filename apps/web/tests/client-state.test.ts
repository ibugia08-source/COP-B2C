import { describe, expect, it } from "vitest";
import { deriveClientStatus } from "@/lib/clients/state";

describe("deriveClientStatus — precedência PERDIDO > PAUSADO > EM_RISCO > etapa", () => {
  it("etapa CLIENTE_PERDIDO sempre vence, mesmo pausado ou crítico", () => {
    expect(deriveClientStatus({ pipelineStage: "CLIENTE_PERDIDO", healthStatus: "CRITICO", isPaused: true })).toBe("PERDIDO");
  });

  it("pausado vence saúde e etapa (exceto perdido)", () => {
    expect(deriveClientStatus({ pipelineStage: "BASE_DE_CLIENTES", healthStatus: "CRITICO", isPaused: true })).toBe("PAUSADO");
    expect(deriveClientStatus({ pipelineStage: "INTEGRACAO_META", healthStatus: "ESTAVEL", isPaused: true })).toBe("PAUSADO");
  });

  it("saúde crítica (não pausado, não perdido) vira EM_RISCO", () => {
    expect(deriveClientStatus({ pipelineStage: "BASE_DE_CLIENTES", healthStatus: "CRITICO", isPaused: false })).toBe("EM_RISCO");
  });

  it("Base de clientes saudável é ATIVO", () => {
    expect(deriveClientStatus({ pipelineStage: "BASE_DE_CLIENTES", healthStatus: "ESTAVEL", isPaused: false })).toBe("ATIVO");
    expect(deriveClientStatus({ pipelineStage: "BASE_DE_CLIENTES", healthStatus: "OBSERVACAO", isPaused: false })).toBe("ATIVO");
  });

  it("etapas de implantação mapeiam para IMPLANTACAO; novo cliente para ONBOARDING", () => {
    expect(deriveClientStatus({ pipelineStage: "NOVO_CLIENTE", healthStatus: "ESTAVEL", isPaused: false })).toBe("ONBOARDING");
    for (const stage of ["CRIACAO_DE_GRUPO", "INTEGRACAO_META", "INTEGRACAO_GOOGLE", "CRM"]) {
      expect(deriveClientStatus({ pipelineStage: stage, healthStatus: "ESTAVEL", isPaused: false })).toBe("IMPLANTACAO");
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildPreview, parseCsv } from "@/lib/import/clickup";

const CSV = `Task Name;Status;EMPRESA;ESTRATEGISTA;GESTOR 1;MODELO DE NEGÓCIO;NICHO;STATUS DE SAÚDE;OBSERVAÇÃO;Tags
Barbearia Alfa;BASE DE CLIENTES;B2C Gestão;Gabriela;Tiago;Negócio Local;Barbearia;Estável;;ads ativo
Loja Beta;INTEGRAÇÃO META;Life Ads;Gabriela;Marina;E-commerce;Moda;Observação;Pixel quebrado;ads pausado
Restaurante Gama;CLIENTES PERDIDOS;B2C Gestão;;Tiago;Negócio Local;Alimentação;Crítico;Cancelou;
Checar campanhas;TAREFA DIÁRIA;;;;;;;;
;BASE DE CLIENTES;;;;;;;;
Cliente Estranho;STATUS INVENTADO;;;;;;;;`;

describe("parseCsv", () => {
  it("faz parse com ; e aspas", () => {
    const rows = parseCsv('a;b;"c;com;separador"\n1;2;3');
    expect(rows).toEqual([["a", "b", "c;com;separador"], ["1", "2", "3"]]);
  });
  it("suporta vírgula como separador", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("buildPreview (mapeamento ClickUp)", () => {
  const preview = buildPreview(CSV);
  if ("error" in preview) throw new Error(preview.error);

  it("classifica clientes, tarefas e inválidas", () => {
    expect(preview.clients).toBe(3);
    expect(preview.tasks).toBe(1);
    expect(preview.invalid).toBe(2); // sem nome + status inventado
  });

  it("BASE DE CLIENTES vira cliente ATIVO com ads ativo", () => {
    const row = preview.rows.find((r) => r.name === "Barbearia Alfa")!;
    expect(row.kind).toBe("client");
    expect(row.client?.status).toBe("ATIVO");
    expect(row.client?.pipelineStage).toBe("BASE_DE_CLIENTES");
    expect(row.client?.adsStatus).toBe("ATIVO");
    expect(row.client?.healthStatus).toBe("ESTAVEL");
    expect(row.client?.agencyBrand).toBe("B2C_GESTAO");
  });

  it("INTEGRAÇÃO META vira IMPLANTACAO na etapa certa, Life Ads e e-commerce", () => {
    const row = preview.rows.find((r) => r.name === "Loja Beta")!;
    expect(row.client?.status).toBe("IMPLANTACAO");
    expect(row.client?.pipelineStage).toBe("INTEGRACAO_META");
    expect(row.client?.agencyBrand).toBe("LIFE_ADS");
    expect(row.client?.businessModel).toBe("ECOMMERCE");
    expect(row.client?.adsStatus).toBe("PAUSADO");
    expect(row.client?.healthStatus).toBe("OBSERVACAO");
  });

  it("CLIENTES PERDIDOS marca churn", () => {
    const row = preview.rows.find((r) => r.name === "Restaurante Gama")!;
    expect(row.client?.status).toBe("PERDIDO");
    expect(row.client?.churn).toBe(true);
  });

  it("TAREFA DIÁRIA não vira cliente", () => {
    const row = preview.rows.find((r) => r.name === "Checar campanhas")!;
    expect(row.kind).toBe("task");
  });

  it("status desconhecido vira inválida com problema descrito", () => {
    const row = preview.rows.find((r) => r.name === "Cliente Estranho")!;
    expect(row.kind).toBe("invalid");
    expect(row.problem).toContain("STATUS INVENTADO");
  });

  it("recusa CSV sem coluna de nome", () => {
    const bad = buildPreview("Coluna1;Coluna2\nx;y");
    expect("error" in bad && bad.error).toContain("nome do cliente");
  });
});

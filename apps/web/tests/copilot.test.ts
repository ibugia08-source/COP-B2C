import { describe, expect, it } from "vitest";
import { summarizeConversation } from "@/lib/copilot/summarize";

describe("summarizeConversation (escuta simulada do Co-piloto)", () => {
  it("identifica objeções, dúvidas e pendências", () => {
    const digest = summarizeConversation(
      [
        "Cliente: Achei o valor muito caro esse mês, não vejo resultado.",
        "Você: Entendo! Vou te mostrar os números da campanha.",
        "Cliente: Pode enviar o relatório até sexta?",
        "Cliente: Como funciona a otimização de vocês?",
      ].join("\n"),
    );
    expect(digest.objections.length).toBeGreaterThan(0);
    expect(digest.doubts.length).toBeGreaterThan(0);
    expect(digest.pendingActions.length).toBeGreaterThan(0);
    expect(digest.priority).toBe("ALTA"); // há objeção
    expect(digest.summary).toContain("objeção");
  });

  it("classifica sentimento negativo quando há sinais de cancelamento", () => {
    const digest = summarizeConversation(
      "Cliente: Estou muito insatisfeito, quero cancelar o contrato.\nCliente: Isso é urgente.",
    );
    expect(digest.sentiment).toBe("NEGATIVO");
    expect(digest.priority).toBe("URGENTE");
  });

  it("classifica sentimento positivo sem objeções", () => {
    const digest = summarizeConversation(
      "Cliente: Ficou excelente, parabéns pelo trabalho!\nCliente: Vamos em frente com o plano do próximo mês, obrigado.",
    );
    expect(digest.sentiment).toBe("POSITIVO");
    expect(digest.objections).toHaveLength(0);
  });

  it("não quebra com texto neutro e curto", () => {
    const digest = summarizeConversation("Bom dia! Segue o material combinado para revisão.");
    expect(digest.sentiment).toBe("NEUTRO");
    expect(digest.summary.length).toBeGreaterThan(10);
  });

  it("remove timestamps comuns de exportação do WhatsApp", () => {
    const digest = summarizeConversation(
      "[10:32, 05/07/2026] Cliente: O anúncio está com problema sério?\n[10:35, 05/07/2026] Você: Vou verificar agora.",
    );
    expect(digest.doubts[0]).not.toContain("10:32");
  });
});

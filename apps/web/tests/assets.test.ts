import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { parseCardDescription, parseTrelloExport } from "@/lib/import/trello";

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = "a".repeat(64);
});

describe("maskSecret", () => {
  it("nunca contém o valor completo", () => {
    const value = "senha-super-secreta-123";
    const masked = maskSecret(value);
    expect(masked).not.toContain(value);
    expect(masked).toContain("•");
  });
  it("valores curtos viram máscara total", () => {
    expect(maskSecret("abc")).toBe("••••••");
    expect(maskSecret("1234567")).toBe("••••••");
  });
  it("valores longos mostram só 2 primeiros e 2 últimos caracteres", () => {
    const masked = maskSecret("abcdefghij");
    expect(masked.startsWith("ab")).toBe(true);
    expect(masked.endsWith("ij")).toBe(true);
    expect(masked).not.toContain("cdefgh");
  });
});

describe("parser de descrição do Trello", () => {
  it("extrai segredos estruturados", () => {
    const { secrets, fields, notes } = parseCardDescription(
      "Login: usuario@teste.com\nSenha: minhaSenha123\nSenha do email: outraSenha\nE-mail de recuperação: rec@teste.com\nLink: https://exemplo.com\nID: 999",
    );
    expect(secrets).toHaveLength(4);
    expect(secrets.find((s) => s.type === "USERNAME")?.value).toBe("usuario@teste.com");
    expect(secrets.find((s) => s.type === "PASSWORD")?.value).toBe("minhaSenha123");
    expect(secrets.find((s) => s.type === "EMAIL_PASSWORD")?.value).toBe("outraSenha");
    expect(secrets.find((s) => s.type === "RECOVERY_EMAIL")?.value).toBe("rec@teste.com");
    expect(fields.loginUrl).toBe("https://exemplo.com");
    expect(fields.externalId).toBe("999");
    expect(notes).toBeNull();
  });

  it("conteúdo não estruturado com menção a senha vira notes + precisa revisar", () => {
    const { secrets, notes, needsReview } = parseCardDescription(
      "a senha está com o cliente, pedir por whatsapp",
    );
    expect(secrets).toHaveLength(0);
    expect(notes).toContain("whatsapp");
    expect(needsReview).toBe(true);
  });
});

describe("parser do export JSON do Trello", () => {
  const board = JSON.stringify({
    name: "Quadro Teste",
    lists: [
      { id: "l1", name: "Cliente X", closed: false },
      { id: "l2", name: "B2C Gestão", closed: false },
      { id: "l3", name: "Antiga", closed: true },
    ],
    members: [{ id: "m1", fullName: "Tiago" }],
    cards: [
      {
        id: "c1",
        name: "Instagram Cliente X",
        idList: "l1",
        closed: false,
        labels: [{ name: "SENDO ESQUENTADA" }],
        desc: "Usuário: @clientex\nSenha: s3nha!",
        idMembers: ["m1"],
      },
      { id: "c2", name: "Card arquivado", idList: "l1", closed: true, labels: [], desc: "" },
      {
        id: "c3",
        name: "Conta TikTok 01",
        idList: "l2",
        closed: false,
        labels: [{ name: "BLOQUEADA" }],
        desc: "sem acesso, verificar com suporte",
      },
    ],
    actions: [
      {
        type: "commentCard",
        date: "2026-05-01T10:00:00.000Z",
        data: { card: { id: "c1" }, text: "Perfil aquecendo bem" },
        memberCreator: { fullName: "Tiago" },
      },
    ],
  });

  const preview = parseTrelloExport(board);
  if ("error" in preview) throw new Error(preview.error);

  it("listas viram grupos com tipo detectado", () => {
    expect(preview.groups).toHaveLength(2); // lista fechada fica de fora
    expect(preview.groups.find((g) => g.name === "B2C Gestão")?.type).toBe("INTERNO");
    expect(preview.groups.find((g) => g.name === "Cliente X")?.type).toBe("CLIENTE");
  });

  it("cartões viram ativos com status da etiqueta e tipo detectado", () => {
    expect(preview.cards).toHaveLength(2);
    const insta = preview.cards.find((c) => c.title === "Instagram Cliente X")!;
    expect(insta.status).toBe("SENDO_ESQUENTADA");
    expect(insta.assetType).toBe("INSTAGRAM_ACCOUNT");
    expect(insta.secrets).toHaveLength(2);
    expect(insta.comments).toHaveLength(1);
    const tiktok = preview.cards.find((c) => c.title === "Conta TikTok 01")!;
    expect(tiktok.status).toBe("BLOQUEADA");
    expect(tiktok.assetType).toBe("TIKTOK_ACCOUNT");
    expect(tiktok.needsReview).toBe(true);
  });

  it("cartões arquivados são pulados com motivo", () => {
    expect(preview.skipped.some((s) => s.name === "Card arquivado")).toBe(true);
  });

  it("segredos do parse sobrevivem ao ciclo criptografa→descriptografa", () => {
    const insta = preview.cards.find((c) => c.title === "Instagram Cliente X")!;
    for (const s of insta.secrets) {
      expect(decryptSecret(encryptSecret(s.value))).toBe(s.value);
    }
  });

  it("rejeita JSON que não é export do Trello", () => {
    const bad = parseTrelloExport('{"foo": 1}');
    expect("error" in bad).toBe(true);
  });
});

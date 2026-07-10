import { beforeEach, describe, expect, it, vi } from "vitest";

// P1.4 — motor de automações: operadores de condição, validação de enum e
// transação por regra (falha na 2ª ação => nada da 1ª persiste, log ERRO).

// --- mock do banco ----------------------------------------------------------
// Transação simulada: escritas vão para uma lista pendente; só entram em
// `state.committedWrites` se o callback não lançar (como um rollback real).
type Write = { table: string; kind: "insert" | "update"; values: unknown };

const state = vi.hoisted(() => {
  const holder = {
    rules: [] as unknown[],
    committedWrites: [] as { table: string; kind: string; values: unknown }[],
    executionLogs: [] as { status: string; error?: string; detail?: unknown }[],
  };

  function tableName(table: object): string {
    // drizzle guarda o nome em um symbol — procura por ele
    for (const sym of Object.getOwnPropertySymbols(table)) {
      const value = (table as Record<symbol, unknown>)[sym];
      if (sym.description?.includes("Name") && typeof value === "string") return value;
    }
    return "unknown";
  }

  function makeExecutor(sink: typeof holder.committedWrites) {
    return {
      insert: (table: object) => ({
        values: (values: Record<string, unknown>) => {
          const name = tableName(table);
          if (name === "automation_execution_logs") {
            // lê holder.executionLogs no momento do push (beforeEach reatribui)
            holder.executionLogs.push(values as (typeof holder.executionLogs)[number]);
            return Promise.resolve();
          }
          sink.push({ table: name, kind: "insert", values });
          return { returning: async () => [{ id: "novo-id", ...values }] };
        },
      }),
      update: (table: object) => ({
        set: (values: unknown) => ({
          where: async () => {
            sink.push({ table: tableName(table), kind: "update", values });
          },
        }),
      }),
    };
  }

  // mesma identidade de objeto: makeExecutor fecha sobre holder e os testes
  // leem/reatribuem as MESMAS propriedades via `state`
  return Object.assign(holder, { makeExecutor });
});

vi.mock("@/db", () => {
  const db = {
    query: { automationRules: { findMany: async () => state.rules } },
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const pending: Write[] = [];
      await fn(state.makeExecutor(pending)); // se lançar, pending é descartado (rollback)
      state.committedWrites.push(...pending);
    },
    insert: (table: object) => state.makeExecutor(state.committedWrites).insert(table),
    update: (table: object) => state.makeExecutor(state.committedWrites).update(table),
  };
  return { db };
});

vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/notify", () => ({ notifyRole: async () => {}, notifyUser: async () => {} }));
vi.mock("@/lib/templates", () => ({ applyTemplateToClient: async () => ({ createdTasks: 0, checklistItems: 0 }) }));

import { emitEvent, evaluateConditions, validateAutomationFieldValue } from "@/lib/automations/engine";

beforeEach(() => {
  state.rules = [];
  state.committedWrites = [];
  state.executionLogs = [];
});

describe("evaluateConditions", () => {
  const payload = { toStage: "BASE_DE_CLIENTES", extra: { nivel: 3 }, count: 10 };

  it("objeto plano legado = igualdade rasa (retrocompatível)", () => {
    expect(evaluateConditions({ toStage: "BASE_DE_CLIENTES" }, payload)).toBe(true);
    expect(evaluateConditions({ toStage: "OUTRA" }, payload)).toBe(false);
    expect(evaluateConditions(null, payload)).toBe(true);
  });

  it("operador in", () => {
    expect(
      evaluateConditions({ op: "in", field: "toStage", value: ["A", "BASE_DE_CLIENTES"] }, payload),
    ).toBe(true);
    expect(evaluateConditions({ op: "in", field: "toStage", value: ["A", "B"] }, payload)).toBe(false);
  });

  it("operadores de comparação e caminho pontilhado", () => {
    expect(evaluateConditions({ op: "gt", field: "count", value: 5 }, payload)).toBe(true);
    expect(evaluateConditions({ op: "lte", field: "count", value: 9 }, payload)).toBe(false);
    expect(evaluateConditions({ op: "eq", field: "extra.nivel", value: 3 }, payload)).toBe(true);
    expect(evaluateConditions({ op: "ne", field: "extra.nivel", value: 3 }, payload)).toBe(false);
  });

  it("array de regras exige que todas casem", () => {
    expect(
      evaluateConditions(
        [
          { op: "eq", field: "toStage", value: "BASE_DE_CLIENTES" },
          { op: "gte", field: "count", value: 10 },
        ],
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [
          { op: "eq", field: "toStage", value: "BASE_DE_CLIENTES" },
          { op: "gt", field: "count", value: 99 },
        ],
        payload,
      ),
    ).toBe(false);
  });
});

describe("validateAutomationFieldValue", () => {
  it("aceita valores dentro do enum", () => {
    expect(validateAutomationFieldValue("client", "healthStatus", "CRITICO").ok).toBe(true);
    expect(validateAutomationFieldValue("client", "status", "EM_RISCO").ok).toBe(true);
    expect(validateAutomationFieldValue("task", "priority", "URGENTE").ok).toBe(true);
  });

  it("rejeita valor fora do enum e campo fora da whitelist", () => {
    expect(validateAutomationFieldValue("client", "status", "STATUS_FALSO").ok).toBe(false);
    expect(validateAutomationFieldValue("task", "status", 123).ok).toBe(false);
    expect(validateAutomationFieldValue("client", "passwordHash", "x").ok).toBe(false);
  });
});

describe("emitEvent — transação por regra", () => {
  it("2ª ação falha → nenhuma escrita persiste e o log é ERRO", async () => {
    state.rules = [
      {
        id: "r1",
        enabled: true,
        conditions: null,
        actions: [
          { type: "UPDATE_CLIENT_FIELD", params: { field: "adsStatus", value: "PAUSADO" } },
          { type: "ACAO_INEXISTENTE", params: {} },
        ],
      },
    ];
    await emitEvent("CLIENT_CREATED", { clientId: "c1" });
    expect(state.committedWrites).toHaveLength(0); // rollback: update da 1ª ação não persistiu
    expect(state.executionLogs).toHaveLength(1);
    expect(state.executionLogs[0].status).toBe("ERRO");
    expect(state.executionLogs[0].error).toMatch(/ACAO_INEXISTENTE/);
  });

  it("UPDATE_CLIENT_FIELD com valor fora do enum → ERRO e cliente intocado", async () => {
    state.rules = [
      {
        id: "r2",
        enabled: true,
        conditions: null,
        actions: [{ type: "UPDATE_CLIENT_FIELD", params: { field: "status", value: "INVALIDO" } }],
      },
    ];
    await emitEvent("CLIENT_CREATED", { clientId: "c1" });
    expect(state.committedWrites).toHaveLength(0);
    expect(state.executionLogs[0].status).toBe("ERRO");
    expect(state.executionLogs[0].error).toMatch(/Valor inválido/);
  });

  it("condição com operador in casa e as ações persistem (SUCESSO)", async () => {
    state.rules = [
      {
        id: "r3",
        enabled: true,
        conditions: { op: "in", field: "toStage", value: ["A", "B"] },
        actions: [{ type: "UPDATE_CLIENT_FIELD", params: { field: "adsStatus", value: "ATIVO" } }],
      },
    ];
    await emitEvent("CLIENT_STAGE_CHANGED", { clientId: "c1", toStage: "B" });
    expect(state.committedWrites).toHaveLength(1);
    expect(state.committedWrites[0]).toMatchObject({ table: "clients", kind: "update" });
    expect(state.executionLogs[0].status).toBe("SUCESSO");
  });

  it("condição não atendida → IGNORADA sem escrever nada", async () => {
    state.rules = [
      {
        id: "r4",
        enabled: true,
        conditions: { op: "in", field: "toStage", value: ["A"] },
        actions: [{ type: "UPDATE_CLIENT_FIELD", params: { field: "adsStatus", value: "ATIVO" } }],
      },
    ];
    await emitEvent("CLIENT_STAGE_CHANGED", { clientId: "c1", toStage: "Z" });
    expect(state.committedWrites).toHaveLength(0);
    expect(state.executionLogs[0].status).toBe("IGNORADA");
  });
});

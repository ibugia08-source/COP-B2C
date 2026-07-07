import {
  ADS_STATUSES,
  BUSINESS_MODELS,
  type AdsStatus,
  type ClientStatus,
  type HealthStatus,
  type PipelineStage,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Parser CSV simples (suporta aspas, ; ou , como separador)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const sep = text.split("\n")[0]?.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Mapeamento ClickUp → COP
// ---------------------------------------------------------------------------

// Status do ClickUp que na verdade são LISTAS DE TAREFAS, não clientes
const TASK_LIKE_STATUSES = [
  "TAREFAS SEMANAIS",
  "TAREFAS SOCIAL MEDIA",
  "PROJETOS ATIVOS",
  "TAREFA DIÁRIA",
  "TAREFA DIARIA",
];

const STATUS_MAP: Record<string, { status: ClientStatus; stage: PipelineStage }> = {
  "CRIAÇÃO DE GRUPO": { status: "IMPLANTACAO", stage: "CRIACAO_DE_GRUPO" },
  "CRIACAO DE GRUPO": { status: "IMPLANTACAO", stage: "CRIACAO_DE_GRUPO" },
  "INTEGRAÇÃO META": { status: "IMPLANTACAO", stage: "INTEGRACAO_META" },
  "INTEGRACAO META": { status: "IMPLANTACAO", stage: "INTEGRACAO_META" },
  "INTEGRAÇÃO GOOGLE": { status: "IMPLANTACAO", stage: "INTEGRACAO_GOOGLE" },
  "INTEGRACAO GOOGLE": { status: "IMPLANTACAO", stage: "INTEGRACAO_GOOGLE" },
  "PESQUISA DE MERCADO": { status: "IMPLANTACAO", stage: "PESQUISA_DE_MERCADO" },
  "DIAGNÓSTICO ESTRATÉGICO": { status: "IMPLANTACAO", stage: "DIAGNOSTICO_ESTRATEGICO" },
  "DIAGNOSTICO ESTRATEGICO": { status: "IMPLANTACAO", stage: "DIAGNOSTICO_ESTRATEGICO" },
  "ESTUDO DE FUNIL": { status: "IMPLANTACAO", stage: "ESTUDO_DE_FUNIL" },
  "INTEGRAÇÃO SOCIAL MEDIA": { status: "IMPLANTACAO", stage: "INTEGRACAO_SOCIAL_MEDIA" },
  "INTEGRACAO SOCIAL MEDIA": { status: "IMPLANTACAO", stage: "INTEGRACAO_SOCIAL_MEDIA" },
  "CLIENTE OCULTO": { status: "ATIVO", stage: "BASE_DE_CLIENTES" },
  "CRM": { status: "IMPLANTACAO", stage: "CRM" },
  "BASE DE CLIENTES": { status: "ATIVO", stage: "BASE_DE_CLIENTES" },
  "CLIENTES PERDIDOS": { status: "PERDIDO", stage: "CLIENTE_PERDIDO" },
};

const HEALTH_MAP: Record<string, HealthStatus> = {
  "ESTÁVEL": "ESTAVEL",
  "ESTAVEL": "ESTAVEL",
  "OBSERVAÇÃO": "OBSERVACAO",
  "OBSERVACAO": "OBSERVACAO",
  "CRÍTICO": "CRITICO",
  "CRITICO": "CRITICO",
};

const MODEL_MAP: Record<string, (typeof BUSINESS_MODELS)[number]> = {
  "ECOMMERCE": "ECOMMERCE",
  "E-COMMERCE": "ECOMMERCE",
  "NEGÓCIO LOCAL": "NEGOCIO_LOCAL",
  "NEGOCIO LOCAL": "NEGOCIO_LOCAL",
};

// nomes de coluna aceitos (case-insensitive) → campo interno
export const COLUMN_ALIASES: Record<string, string> = {
  "task name": "name",
  "nome": "name",
  "cliente": "name",
  "status": "clickupStatus",
  "empresa": "empresa",
  "estrategista": "estrategista",
  "gestor 1": "gestor1",
  "gestor1": "gestor1",
  "gestor 2": "gestor2",
  "gestor2": "gestor2",
  "responsável 1": "responsavel1",
  "responsavel 1": "responsavel1",
  "modelo de negócio": "modelo",
  "modelo de negocio": "modelo",
  "nicho": "nicho",
  "status de saúde": "saude",
  "status de saude": "saude",
  "observação": "observacao",
  "observacao": "observacao",
  "prazo": "prazo",
  "tags": "tags",
  "cidade": "cidade",
  "uf": "uf",
  "estado": "uf",
};

export type ParsedRow = {
  line: number;
  name: string;
  clickupStatus: string;
  raw: Record<string, string>;
  // resultado do mapeamento
  kind: "client" | "task" | "invalid";
  problem?: string;
  client?: {
    name: string;
    agencyBrand: "B2C_GESTAO" | "LIFE_ADS";
    businessModel: (typeof BUSINESS_MODELS)[number];
    niche: string | null;
    city: string | null;
    state: string | null;
    status: ClientStatus;
    pipelineStage: PipelineStage;
    healthStatus: HealthStatus;
    adsStatus: AdsStatus;
    notes: string | null;
    // nomes de responsáveis a resolver por e-mail/nome de usuário na confirmação
    estrategista: string | null;
    gestor1: string | null;
    gestor2: string | null;
    responsavel1: string | null;
    churn: boolean;
  };
};

export type ImportPreview = {
  headers: string[];
  unmappedHeaders: string[];
  rows: ParsedRow[];
  clients: number;
  tasks: number;
  invalid: number;
};

export function buildPreview(csvText: string): ImportPreview | { error: string } {
  const grid = parseCsv(csvText);
  if (grid.length < 2) return { error: "CSV vazio ou sem linhas de dados." };

  const headers = grid[0].map((h) => h.trim());
  const fieldByIndex = headers.map((h) => COLUMN_ALIASES[h.toLowerCase()] ?? null);
  const unmappedHeaders = headers.filter((_, i) => !fieldByIndex[i]);
  if (!fieldByIndex.includes("name")) {
    return { error: `Não encontrei a coluna do nome do cliente. Colunas aceitas: "Task Name", "Nome" ou "Cliente". Colunas do arquivo: ${headers.join(", ")}` };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const raw: Record<string, string> = {};
    grid[i].forEach((cell, idx) => {
      const field = fieldByIndex[idx];
      if (field) raw[field] = cell.trim();
    });

    const name = raw.name ?? "";
    const clickupStatus = (raw.clickupStatus ?? "").toUpperCase().trim();
    const base = { line: i + 1, name, clickupStatus, raw };

    if (!name) {
      rows.push({ ...base, kind: "invalid", problem: "Linha sem nome" });
      continue;
    }
    if (TASK_LIKE_STATUSES.includes(clickupStatus)) {
      rows.push({ ...base, kind: "task", problem: `Status "${clickupStatus}" é lista de tarefas, não cliente — reorganize no módulo Tarefas` });
      continue;
    }
    const statusInfo = STATUS_MAP[clickupStatus];
    if (clickupStatus && !statusInfo) {
      rows.push({ ...base, kind: "invalid", problem: `Status desconhecido: "${clickupStatus}"` });
      continue;
    }

    const tags = (raw.tags ?? "").toLowerCase();
    const adsStatus: AdsStatus = tags.includes("ads ativo")
      ? "ATIVO"
      : tags.includes("ads pausado")
        ? "PAUSADO"
        : "SEM_CAMPANHA";
    void ADS_STATUSES;

    rows.push({
      ...base,
      kind: "client",
      client: {
        name,
        agencyBrand: (raw.empresa ?? "").toUpperCase().includes("LIFE") ? "LIFE_ADS" : "B2C_GESTAO",
        businessModel: MODEL_MAP[(raw.modelo ?? "").toUpperCase()] ?? "OUTROS",
        niche: raw.nicho || null,
        city: raw.cidade || null,
        state: raw.uf || null,
        status: statusInfo?.status ?? "LEAD",
        pipelineStage: statusInfo?.stage ?? "NOVO_CLIENTE",
        healthStatus: HEALTH_MAP[(raw.saude ?? "").toUpperCase()] ?? "ESTAVEL",
        adsStatus,
        notes: raw.observacao || null,
        estrategista: raw.estrategista || null,
        gestor1: raw.gestor1 || null,
        gestor2: raw.gestor2 || null,
        responsavel1: raw.responsavel1 || null,
        churn: statusInfo?.status === "PERDIDO",
      },
    });
  }

  return {
    headers,
    unmappedHeaders,
    rows,
    clients: rows.filter((r) => r.kind === "client").length,
    tasks: rows.filter((r) => r.kind === "task").length,
    invalid: rows.filter((r) => r.kind === "invalid").length,
  };
}

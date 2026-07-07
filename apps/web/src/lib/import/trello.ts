import type { AssetPlatform, AssetStatus, AssetType, SecretType } from "@/db/schema";

// ---------------------------------------------------------------------------
// Parser do export JSON do Trello (quadro BANCO DE DADOS DE CONTAS E PERFIS)
// Lista → DigitalAssetGroup · Cartão → DigitalAsset · Etiqueta → status
// Descrição → segredos estruturados · Comentários → DigitalAssetComment
// ---------------------------------------------------------------------------

type TrelloExport = {
  lists?: { id: string; name: string; closed?: boolean }[];
  cards?: {
    id: string;
    name: string;
    desc?: string;
    idList: string;
    closed?: boolean;
    labels?: { name?: string }[];
    attachments?: { name?: string; url?: string }[];
    idMembers?: string[];
  }[];
  members?: { id: string; fullName?: string }[];
  actions?: {
    type: string;
    date?: string;
    data?: { card?: { id: string }; text?: string };
    memberCreator?: { fullName?: string };
  }[];
};

// Etiquetas do Trello → status único do COP (as duas "BLOQUEADA" viram uma só)
const LABEL_TO_STATUS: Record<string, AssetStatus> = {
  "ATIVA": "ATIVA",
  "PRONTA PARA USO": "PRONTA_PARA_USO",
  "ANÁLISE SOLICITADA": "ANALISE_SOLICITADA",
  "ANALISE SOLICITADA": "ANALISE_SOLICITADA",
  "BLOQUEADA": "BLOQUEADA",
  "PRECISA DE DOCUMENTOS": "PRECISA_DE_DOCUMENTOS",
  "NÃO INFORMADO": "NAO_INFORMADO",
  "NAO INFORMADO": "NAO_INFORMADO",
  "SENDO ESQUENTADA": "SENDO_ESQUENTADA",
};

// Padrões de linha da descrição → tipo de segredo ou campo do ativo
const SECRET_PATTERNS: { pattern: RegExp; type: SecretType; label: string }[] = [
  { pattern: /^senha\s+do\s+e-?mail\s*[:=]\s*(.+)$/i, type: "EMAIL_PASSWORD", label: "Senha do e-mail" },
  { pattern: /^e-?mail\s+de\s+recupera[çc][aã]o\s*[:=]\s*(.+)$/i, type: "RECOVERY_EMAIL", label: "E-mail de recuperação" },
  { pattern: /^senha\s*[:=]\s*(.+)$/i, type: "PASSWORD", label: "Senha" },
  { pattern: /^login\s*[:=]\s*(.+)$/i, type: "USERNAME", label: "Login" },
  { pattern: /^usu[aá]rio\s*[:=]\s*(.+)$/i, type: "USERNAME", label: "Usuário" },
  { pattern: /^e-?mail\s*[:=]\s*(.+)$/i, type: "EMAIL", label: "E-mail" },
  { pattern: /^token\s*[:=]\s*(.+)$/i, type: "TOKEN", label: "Token" },
];

const FIELD_PATTERNS: { pattern: RegExp; field: "loginUrl" | "externalId" | "profileId" }[] = [
  { pattern: /^link\s*[:=]\s*(.+)$/i, field: "loginUrl" },
  { pattern: /^perfil\s*[:=]\s*(.+)$/i, field: "profileId" },
  { pattern: /^id\s*[:=]\s*(.+)$/i, field: "externalId" },
];

function guessTypeAndPlatform(cardName: string, listName: string): { assetType: AssetType; platform: AssetPlatform } {
  const text = `${cardName} ${listName}`.toLowerCase();
  if (text.includes("tik tok") || text.includes("tiktok")) return { assetType: "TIKTOK_ACCOUNT", platform: "TIKTOK" };
  if (text.includes("dolphin")) return { assetType: "ANTIDETECT_PROFILE", platform: "DOLPHIN_ANTY" };
  if (text.includes("business manager") || /\bbm\b/.test(text)) return { assetType: "META_BUSINESS_MANAGER", platform: "META" };
  if (text.includes("conta de an") || text.includes("ad account")) return { assetType: "META_AD_ACCOUNT", platform: "META" };
  if (text.includes("instagram") || text.includes("insta ")) return { assetType: "INSTAGRAM_ACCOUNT", platform: "INSTAGRAM" };
  if (text.includes("facebook") || /\bfb\b/.test(text)) return { assetType: "FACEBOOK_ACCOUNT", platform: "FACEBOOK" };
  if (text.includes("google ads")) return { assetType: "GOOGLE_ADS", platform: "GOOGLE" };
  if (text.includes("google") || text.includes("gmail")) return { assetType: "GOOGLE_ACCOUNT", platform: "GOOGLE" };
  if (text.includes("whatsapp") || text.includes("whats")) return { assetType: "WHATSAPP_BUSINESS", platform: "WHATSAPP" };
  if (text.includes("wordpress") || text.includes("wp-admin")) return { assetType: "WORDPRESS", platform: "WORDPRESS" };
  if (text.includes("hospedagem") || text.includes("hosting")) return { assetType: "HOSTING", platform: "OUTRA" };
  if (text.includes("dom[íi]nio") || text.includes("dominio")) return { assetType: "DOMAIN", platform: "OUTRA" };
  if (text.includes("e-mail") || text.includes("email") || text.includes("@")) return { assetType: "EMAIL_ACCOUNT", platform: "OUTRA" };
  if (text.includes("perfil") || text.includes("backup")) return { assetType: "BROWSER_PROFILE_BACKUP", platform: "OUTRA" };
  return { assetType: "OTHER", platform: "OUTRA" };
}

export type ParsedTrelloSecret = { type: SecretType; label: string; value: string };

export type ParsedTrelloCard = {
  trelloId: string;
  title: string;
  groupName: string;
  status: AssetStatus;
  assetType: AssetType;
  platform: AssetPlatform;
  loginUrl: string | null;
  profileId: string | null;
  externalId: string | null;
  secrets: ParsedTrelloSecret[];
  notes: string | null;
  needsReview: boolean;
  comments: { author: string | null; text: string; date: string | null }[];
  attachmentLinks: { name: string; url: string }[];
  memberNames: string[];
};

export type ParsedTrelloGroup = {
  name: string;
  type: "CLIENTE" | "INTERNO" | "PLATAFORMA" | "OPERACAO" | "OUTRO";
  status: "ATIVO" | "PAUSADO" | "ARQUIVADO";
};

export type TrelloPreview = {
  boardName?: string;
  groups: ParsedTrelloGroup[];
  cards: ParsedTrelloCard[];
  totalSecrets: number;
  needsReviewCount: number;
  skipped: { name: string; reason: string }[];
};

const INTERNAL_LIST_HINTS = ["b2c", "interno", "recursos", "contas do", "dolphin", "agência", "agencia"];

/** Parse da descrição do cartão: separa segredos, campos e sobras (notes). */
export function parseCardDescription(desc: string): {
  secrets: ParsedTrelloSecret[];
  fields: Partial<Record<"loginUrl" | "externalId" | "profileId", string>>;
  notes: string | null;
  needsReview: boolean;
} {
  const secrets: ParsedTrelloSecret[] = [];
  const fields: Partial<Record<"loginUrl" | "externalId" | "profileId", string>> = {};
  const leftovers: string[] = [];

  for (const rawLine of desc.split("\n")) {
    const line = rawLine.replace(/^\*+|\*+$/g, "").trim();
    if (!line) continue;
    let matched = false;
    for (const { pattern, type, label } of SECRET_PATTERNS) {
      const m = line.match(pattern);
      if (m && m[1].trim()) {
        secrets.push({ type, label, value: m[1].trim() });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    for (const { pattern, field } of FIELD_PATTERNS) {
      const m = line.match(pattern);
      if (m && m[1].trim() && !fields[field]) {
        fields[field] = m[1].trim();
        matched = true;
        break;
      }
    }
    if (!matched) leftovers.push(line);
  }

  // se sobrou conteúdo que parece conter credencial não estruturada, marcar revisão
  const leftoverText = leftovers.join("\n");
  const needsReview =
    leftovers.length > 0 &&
    (secrets.length === 0 || /senha|password|token|acesso/i.test(leftoverText));

  return {
    secrets,
    fields,
    notes: leftoverText || null,
    needsReview,
  };
}

export function parseTrelloExport(jsonText: string): TrelloPreview | { error: string } {
  let data: TrelloExport & { name?: string };
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { error: "JSON inválido. Exporte o quadro do Trello em Menu → Imprimir e exportar → Exportar como JSON." };
  }
  if (!Array.isArray(data.lists) || !Array.isArray(data.cards)) {
    return { error: "Este JSON não parece ser um export de quadro do Trello (faltam lists/cards)." };
  }

  const memberById = new Map((data.members ?? []).map((m) => [m.id, m.fullName ?? ""]));
  const listById = new Map(data.lists.map((l) => [l.id, l]));

  const groups: ParsedTrelloGroup[] = data.lists
    .filter((l) => !l.closed)
    .map((l) => {
      const lower = l.name.toLowerCase();
      const isInternal = INTERNAL_LIST_HINTS.some((h) => lower.includes(h));
      return {
        name: l.name.trim(),
        type: isInternal ? ("INTERNO" as const) : ("CLIENTE" as const),
        status: lower.includes("pausad") ? ("PAUSADO" as const) : ("ATIVO" as const),
      };
    });

  const commentsByCard = new Map<string, { author: string | null; text: string; date: string | null }[]>();
  for (const action of data.actions ?? []) {
    if (action.type !== "commentCard" || !action.data?.card?.id || !action.data.text) continue;
    const list = commentsByCard.get(action.data.card.id) ?? [];
    list.push({
      author: action.memberCreator?.fullName ?? null,
      text: action.data.text,
      date: action.date ?? null,
    });
    commentsByCard.set(action.data.card.id, list);
  }

  const cards: ParsedTrelloCard[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let totalSecrets = 0;

  for (const card of data.cards) {
    if (card.closed) {
      skipped.push({ name: card.name, reason: "cartão arquivado no Trello" });
      continue;
    }
    const list = listById.get(card.idList);
    if (!list || list.closed) {
      skipped.push({ name: card.name, reason: "lista arquivada/inexistente" });
      continue;
    }

    const labelNames = (card.labels ?? []).map((l) => (l.name ?? "").toUpperCase().trim());
    let status: AssetStatus = "NAO_INFORMADO";
    for (const label of labelNames) {
      const mapped = LABEL_TO_STATUS[label];
      if (mapped) {
        status = mapped;
        break;
      }
    }
    if (list.name.toLowerCase().includes("pausad")) status = "PAUSADA";

    const { secrets, fields, notes, needsReview } = parseCardDescription(card.desc ?? "");
    totalSecrets += secrets.length;
    const { assetType, platform } = guessTypeAndPlatform(card.name, list.name);

    cards.push({
      trelloId: card.id,
      title: card.name.trim(),
      groupName: list.name.trim(),
      status,
      assetType,
      platform,
      loginUrl: fields.loginUrl ?? null,
      profileId: fields.profileId ?? null,
      externalId: fields.externalId ?? null,
      secrets,
      notes,
      needsReview,
      comments: commentsByCard.get(card.id) ?? [],
      attachmentLinks: (card.attachments ?? [])
        .filter((a) => a.url)
        .map((a) => ({ name: a.name ?? "anexo", url: a.url! })),
      memberNames: (card.idMembers ?? []).map((id) => memberById.get(id)).filter((n): n is string => !!n),
    });
  }

  return {
    boardName: data.name,
    groups,
    cards,
    totalSecrets,
    needsReviewCount: cards.filter((c) => c.needsReview).length,
    skipped,
  };
}

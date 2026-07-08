import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyServices, appSettings } from "@/db/schema";

// ---------------------------------------------------------------------------
// Feature flags — módulos opcionais desligados por padrão. Só OWNER altera.
// ---------------------------------------------------------------------------

export type FeatureFlags = {
  copiloto: boolean;
  google_drive: boolean;
  google_meet: boolean;
};

export const DEFAULT_FLAGS: FeatureFlags = {
  copiloto: false,
  google_drive: false,
  google_meet: false,
};

export const FLAG_LABELS: Record<keyof FeatureFlags, { label: string; description: string }> = {
  copiloto: {
    label: "Co-piloto (IA)",
    description: "Assistente com IA para gestores, com futura integração WhatsApp. Em preparação.",
  },
  google_drive: {
    label: "Google Drive em Documentos",
    description: "Vincular arquivos do Drive aos documentos. Em preparação.",
  },
  google_meet: {
    label: "Google Meet em Reuniões",
    description: "Gerar link de Meet ao registrar reuniões. Em preparação.",
  },
};

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "feature_flags"),
  });
  return { ...DEFAULT_FLAGS, ...((row?.value as Partial<FeatureFlags>) ?? {}) };
}

export async function setFeatureFlag(
  flag: keyof FeatureFlags,
  enabled: boolean,
  updatedById: string,
): Promise<void> {
  const current = await getFeatureFlags();
  const next = { ...current, [flag]: enabled };
  await db
    .insert(appSettings)
    .values({ key: "feature_flags", value: next, updatedById })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedById, updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Serviços da agência (cadastro configurável)
// ---------------------------------------------------------------------------

export async function getActiveServices(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: agencyServices.id, name: agencyServices.name })
    .from(agencyServices)
    .where(eq(agencyServices.isActive, true))
    .orderBy(asc(agencyServices.order), asc(agencyServices.name));
}

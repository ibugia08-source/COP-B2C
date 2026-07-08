"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyServices } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { setFeatureFlag, type FeatureFlags } from "@/lib/settings";

export type ActionState = { error?: string; success?: string };

const TONES = ["green", "amber", "red", "blue", "purple", "zinc", "cyan"];

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Nome do serviço muito curto").max(60, "Nome muito longo"),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  color: z.string().trim().optional(),
});

export async function saveService(
  serviceId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const color = parsed.data.color && TONES.includes(parsed.data.color) ? parsed.data.color : "blue";

  const duplicate = await db.query.agencyServices.findFirst({
    where: eq(agencyServices.name, parsed.data.name),
  });
  if (duplicate && duplicate.id !== serviceId) {
    return { error: "Já existe um serviço com este nome." };
  }

  if (serviceId) {
    await db
      .update(agencyServices)
      .set({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        category: parsed.data.category ?? null,
        color,
      })
      .where(eq(agencyServices.id, serviceId));
  } else {
    const count = await db.$count(agencyServices);
    await db.insert(agencyServices).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      color,
      order: count,
    });
  }

  await logActivity({
    userId: auth.session.userId,
    action: serviceId ? "settings.serviceUpdated" : "settings.serviceCreated",
    entityType: "agencyService",
    entityId: serviceId,
    metadata: { name: parsed.data.name },
  });
  revalidatePath("/configuracoes/servicos");
  return { success: serviceId ? "Serviço atualizado." : "Serviço criado." };
}

export async function toggleService(serviceId: string): Promise<ActionState> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };
  const service = await db.query.agencyServices.findFirst({
    where: eq(agencyServices.id, serviceId),
  });
  if (!service) return { error: "Serviço não encontrado." };
  await db
    .update(agencyServices)
    .set({ isActive: !service.isActive })
    .where(eq(agencyServices.id, serviceId));
  await logActivity({
    userId: auth.session.userId,
    action: service.isActive ? "settings.serviceDeactivated" : "settings.serviceActivated",
    entityType: "agencyService",
    entityId: serviceId,
    metadata: { name: service.name },
  });
  revalidatePath("/configuracoes/servicos");
  return { success: service.isActive ? "Serviço desativado." : "Serviço reativado." };
}

const FLAG_KEYS = ["copiloto", "google_drive", "google_meet"] as const;

export async function toggleFlag(flag: string): Promise<ActionState> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };
  if (!FLAG_KEYS.includes(flag as never)) return { error: "Flag desconhecida." };

  const { getFeatureFlags } = await import("@/lib/settings");
  const current = await getFeatureFlags();
  const key = flag as keyof FeatureFlags;
  await setFeatureFlag(key, !current[key], auth.session.userId);
  await logActivity({
    userId: auth.session.userId,
    action: "settings.featureFlagToggled",
    entityType: "appSetting",
    metadata: { flag, enabled: !current[key] },
  });
  revalidatePath("/configuracoes/servicos");
  revalidatePath("/configuracoes");
  return { success: "Configuração atualizada." };
}

"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { isGoogleConfigured } from "@/lib/google-drive";
import { setFeatureFlag } from "@/lib/settings";

export type ActionState = { error?: string; success?: string };

/**
 * "Conectar" o Google Drive = ligar a flag da integração. Só faz efeito quando
 * as credenciais OAuth existem no ambiente; caso contrário, orienta a configurar.
 */
export async function connectGoogleDrive(): Promise<ActionState> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };
  if (!isGoogleConfigured()) {
    return {
      error:
        "Credenciais do Google ausentes. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN no ambiente (veja docs/DEPLOY.md) e tente novamente. Enquanto isso, links do Drive podem ser colados manualmente nos documentos.",
    };
  }
  await setFeatureFlag("google_drive", true, auth.session.userId);
  await logActivity({ userId: auth.session.userId, action: "integration.googleDriveConnected", entityType: "integration" });
  revalidatePath("/configuracoes/integracoes");
  return { success: "Google Drive conectado." };
}

export async function disconnectGoogleDrive(): Promise<ActionState> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };
  await setFeatureFlag("google_drive", false, auth.session.userId);
  await logActivity({ userId: auth.session.userId, action: "integration.googleDriveDisconnected", entityType: "integration" });
  revalidatePath("/configuracoes/integracoes");
  return { success: "Google Drive desconectado." };
}

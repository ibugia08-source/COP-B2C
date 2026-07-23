/**
 * Foto de perfil do usuário.
 *
 * `users.avatar_url` guarda uma KEY de storage (ex.: `avatars/<hash>__nome.png`),
 * NÃO uma URL pública. A imagem é servida pela rota autenticada
 * `/equipe/avatar/[id]` (ver `app/(app)/equipe/avatar/[id]/route.ts`).
 *
 * Use SEMPRE este helper para montar o `src` do <UserAvatar> — nunca passe a key
 * crua, que não resolve como imagem.
 */

/**
 * Monta a URL da foto a partir da key. Retorna `undefined` quando não há foto,
 * fazendo o <UserAvatar> cair no fallback padrão (iniciais coloridas).
 *
 * O `?v=` deriva da key e muda a cada upload, bustando o cache do browser.
 */
export function avatarSrc(
  userId: string | null | undefined,
  avatarKey: string | null | undefined,
): string | undefined {
  if (!userId || !avatarKey) return undefined;
  const v = avatarKey.split("/").pop()?.split("__")[0]?.slice(0, 8) ?? "";
  return `/equipe/avatar/${userId}?v=${v}`;
}

/** Formato mínimo de usuário para renderizar nome + foto. */
export type AvatarUser = { id: string; name: string; avatarUrl?: string | null };

/** Atalho: recebe o usuário (ou null) e devolve a URL da foto, se houver. */
export function avatarSrcOf(user: AvatarUser | null | undefined): string | undefined {
  return avatarSrc(user?.id, user?.avatarUrl);
}

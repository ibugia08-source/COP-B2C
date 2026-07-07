import type { AssetPlatform, AssetType, SecretType } from "@/db/schema";

// Templates de cadastro rápido de ativos digitais.
// Campos sensíveis viram DigitalAssetSecret; os demais vão para DigitalAsset.

export type AssetTemplate = {
  slug: string;
  name: string;
  assetType: AssetType;
  platform: AssetPlatform;
  // campos não sensíveis do DigitalAsset sugeridos no formulário
  assetFields: ("loginUrl" | "profileUrl" | "businessManagerId" | "adAccountId" | "pageId" | "profileId" | "externalId" | "recoveryEmail")[];
  // segredos sugeridos (tipo + label pré-preenchido)
  secretFields: { type: SecretType; label: string }[];
};

export const ASSET_TEMPLATES: AssetTemplate[] = [
  {
    slug: "facebook",
    name: "Conta do Facebook",
    assetType: "FACEBOOK_ACCOUNT",
    platform: "FACEBOOK",
    assetFields: ["loginUrl", "profileUrl", "recoveryEmail"],
    secretFields: [
      { type: "USERNAME", label: "Login do Facebook" },
      { type: "PASSWORD", label: "Senha do Facebook" },
      { type: "EMAIL", label: "E-mail vinculado" },
      { type: "EMAIL_PASSWORD", label: "Senha do e-mail" },
      { type: "RECOVERY_EMAIL", label: "E-mail de recuperação" },
    ],
  },
  {
    slug: "instagram",
    name: "Conta do Instagram",
    assetType: "INSTAGRAM_ACCOUNT",
    platform: "INSTAGRAM",
    assetFields: ["profileUrl", "recoveryEmail"],
    secretFields: [
      { type: "USERNAME", label: "Usuário do Instagram" },
      { type: "PASSWORD", label: "Senha do Instagram" },
      { type: "EMAIL", label: "E-mail vinculado" },
      { type: "EMAIL_PASSWORD", label: "Senha do e-mail" },
      { type: "OTHER", label: "Telefone vinculado" },
    ],
  },
  {
    slug: "tiktok",
    name: "Conta TikTok",
    assetType: "TIKTOK_ACCOUNT",
    platform: "TIKTOK",
    assetFields: ["profileUrl", "profileId"],
    secretFields: [
      { type: "USERNAME", label: "Usuário do TikTok" },
      { type: "PASSWORD", label: "Senha do TikTok" },
      { type: "EMAIL", label: "E-mail vinculado" },
      { type: "EMAIL_PASSWORD", label: "Senha do e-mail" },
      { type: "TOKEN", label: "Token (se aplicável)" },
    ],
  },
  {
    slug: "meta-bm",
    name: "Meta Business Manager",
    assetType: "META_BUSINESS_MANAGER",
    platform: "META",
    assetFields: ["loginUrl", "businessManagerId"],
    secretFields: [
      { type: "USERNAME", label: "Login principal" },
      { type: "PASSWORD", label: "Senha" },
      { type: "EMAIL", label: "E-mail vinculado" },
    ],
  },
  {
    slug: "meta-ad-account",
    name: "Conta de Anúncio Meta",
    assetType: "META_AD_ACCOUNT",
    platform: "META",
    assetFields: ["adAccountId", "businessManagerId", "loginUrl"],
    secretFields: [{ type: "OTHER", label: "Forma de acesso" }],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    assetType: "GOOGLE_ADS",
    platform: "GOOGLE",
    assetFields: ["loginUrl", "adAccountId", "externalId"],
    secretFields: [
      { type: "EMAIL", label: "E-mail de acesso" },
      { type: "PASSWORD", label: "Senha" },
      { type: "OTHER", label: "MCC (se houver)" },
    ],
  },
  {
    slug: "email",
    name: "Conta de E-mail",
    assetType: "EMAIL_ACCOUNT",
    platform: "OUTRA",
    assetFields: ["loginUrl", "recoveryEmail"],
    secretFields: [
      { type: "EMAIL", label: "Endereço de e-mail" },
      { type: "PASSWORD", label: "Senha" },
      { type: "RECOVERY_EMAIL", label: "E-mail de recuperação" },
      { type: "OTHER", label: "Telefone de recuperação" },
    ],
  },
  {
    slug: "wordpress",
    name: "WordPress",
    assetType: "WORDPRESS",
    platform: "WORDPRESS",
    assetFields: ["loginUrl", "profileUrl"],
    secretFields: [
      { type: "USERNAME", label: "Usuário do admin" },
      { type: "PASSWORD", label: "Senha do admin" },
      { type: "EMAIL", label: "E-mail" },
    ],
  },
  {
    slug: "dominio-hospedagem",
    name: "Domínio/Hospedagem",
    assetType: "HOSTING",
    platform: "OUTRA",
    assetFields: ["loginUrl", "externalId"],
    secretFields: [
      { type: "USERNAME", label: "Login do provedor" },
      { type: "PASSWORD", label: "Senha do provedor" },
    ],
    // vencimento do domínio: registrar como observação operacional (notes)
  },
  {
    slug: "perfil-navegador",
    name: "Perfil/Backup de Navegador",
    assetType: "BROWSER_PROFILE_BACKUP",
    platform: "DOLPHIN_ANTY",
    assetFields: ["profileId"],
    secretFields: [{ type: "OTHER", label: "Dados de acesso do perfil" }],
  },
];

export function findAssetTemplate(slug: string): AssetTemplate | undefined {
  return ASSET_TEMPLATES.find((t) => t.slug === slug);
}

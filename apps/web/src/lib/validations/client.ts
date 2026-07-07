import { z } from "zod";
import {
  ADS_STATUSES,
  AGENCY_BRANDS,
  BUSINESS_MODELS,
  CLIENT_STATUSES,
  HEALTH_STATUSES,
} from "@/db/schema";

const optionalStr = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalUrl = optionalStr.pipe(z.string().url("URL inválida").optional());

export const clientFormSchema = z.object({
  name: z.string().trim().min(2, "Nome do cliente é obrigatório"),
  legalName: optionalStr,
  brandName: optionalStr,
  agencyBrand: z.enum(AGENCY_BRANDS),
  businessModel: z.enum(BUSINESS_MODELS),
  niche: optionalStr,
  city: optionalStr,
  state: optionalStr,
  instagramUrl: optionalUrl,
  websiteUrl: optionalUrl,
  decisionMakerName: optionalStr,
  decisionMakerPhone: optionalStr,
  decisionMakerEmail: optionalStr.pipe(z.string().email("E-mail inválido").optional()),
  status: z.enum(CLIENT_STATUSES),
  healthStatus: z.enum(HEALTH_STATUSES),
  adsStatus: z.enum(ADS_STATUSES),
  strategistId: optionalStr,
  trafficManager1Id: optionalStr,
  trafficManager2Id: optionalStr,
  mainResponsibleId: optionalStr,
  startDate: optionalStr,
  notes: optionalStr,
});

export type ClientFormData = z.infer<typeof clientFormSchema>;

export const operationalProfileSchema = z.object({
  platforms: z.array(z.string()).default([]),
  averageDailyBudget: z.coerce.number().nonnegative().optional(),
  campaignObjective: optionalStr,
  campaignTypes: optionalStr, // separado por vírgula na UI
  offerDescription: optionalStr,
  funnelNotes: optionalStr,
  serviceRules: optionalStr,
  monthlyMeetingRequired: z.boolean().default(false),
  briefingText: optionalStr,
});

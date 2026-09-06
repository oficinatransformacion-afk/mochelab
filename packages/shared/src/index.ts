import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const PersonaBusinessKeySchema = z.object({
  dni: z.string().trim().min(1),
  empresaId: z.uuid(),
});

export type PersonaBusinessKey = z.infer<typeof PersonaBusinessKeySchema>;

export const ModuleCodeSchema = z.enum([
  "INICIO",
  "PERSONAS",
  "EQUIPOS",
  "CURSOS",
  "MADUREZ",
  "OBJETIVOS",
  "PORTAFOLIO",
  "CATALOGOS",
  "USUARIOS",
  "MIGRACIONES",
  "AUDITORIA",
]);

export type ModuleCode = z.infer<typeof ModuleCodeSchema>;

export const ModuleCapabilitySchema = z.object({
  code: ModuleCodeSchema,
  name: z.string().min(1),
  route: z.string().min(1),
  icon: z.string().min(1),
  sortOrder: z.number().int(),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export type ModuleCapability = z.infer<typeof ModuleCapabilitySchema>;

export const UserCapabilitiesSchema = z.object({
  profile: z.enum(["ADMINISTRADOR", "USUARIO"]),
  modules: z.array(ModuleCapabilitySchema),
});

export type UserCapabilities = z.infer<typeof UserCapabilitiesSchema>;

export const SelfAssessmentAnswerSchema = z.object({
  behaviorId: z.uuid(),
  score: z.number().int().min(0).max(2),
  comments: z.string().trim().max(2000).optional(),
});

export const SubmitSelfAssessmentSchema = z.object({
  personRoleId: z.uuid(),
  periodId: z.uuid(),
  configurationVersion: z.string().trim().min(1).max(80),
  answers: z.array(SelfAssessmentAnswerSchema).min(1),
}).superRefine((value, context) => {
  const behaviorIds = value.answers.map((answer) => answer.behaviorId);
  if (new Set(behaviorIds).size !== behaviorIds.length) {
    context.addIssue({
      code: "custom",
      path: ["answers"],
      message: "Cada comportamiento debe responderse una sola vez",
    });
  }
});

export type SubmitSelfAssessment = z.infer<typeof SubmitSelfAssessmentSchema>;

export const CalibrateRoleMaturitySchema = z.object({
  roleMaturityId: z.uuid(),
  calibratedScore: z.number().min(0).max(2),
  comments: z.string().trim().max(4000).optional(),
  mastery: z.object({
    trainedPersonId: z.uuid().optional(),
    trainingEvidence: z.string().trim().max(4000).optional(),
    trainingVerified: z.boolean(),
    campName: z.string().trim().max(240).optional(),
    campDate: z.iso.date().optional(),
    campEvidence: z.string().trim().max(4000).optional(),
    campVerified: z.boolean(),
    teamMaturityId: z.uuid().optional(),
  }).optional(),
}).superRefine((value,context)=>{
  const mastery=value.mastery;if(!mastery)return;
  if(!mastery.trainingVerified||!mastery.trainedPersonId||!mastery.trainingEvidence?.trim()||!mastery.campVerified||!mastery.campName?.trim()||!mastery.campDate||!mastery.campEvidence?.trim()||!mastery.teamMaturityId){context.addIssue({code:"custom",path:["mastery"],message:"Para Maestro deben completarse las tres condiciones y sus evidencias"});}
});

export type CalibrateRoleMaturity = z.infer<typeof CalibrateRoleMaturitySchema>;

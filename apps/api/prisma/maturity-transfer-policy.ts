export type MaturityTransferIdentity = {
  companyCode:string;
  personDni:string;
  roleCode:string;
  periodCode:string;
};

export const maturityTransferExclusions = [
  {
    personDni:"DEMO0001",
    roleCode:"DEMO-ROL-001",
    periodCode:"DEMO-2026",
    reason:"Registro demostrativo local; no corresponde a información de calibración transferible.",
  },
] as const;

export function maturityTransferExclusion(identity:MaturityTransferIdentity) {
  return maturityTransferExclusions.find(rule =>
    rule.personDni === identity.personDni &&
    rule.roleCode === identity.roleCode &&
    rule.periodCode === identity.periodCode,
  ) ?? null;
}

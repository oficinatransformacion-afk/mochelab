export const DEFAULT_ROLE_FILTER_NAMES = [
  "SPONSOR",
  "LIDER AE",
  "LIDER EAD",
  "DUEÑO DE PROGRAMA",
  "DUEÑO DE PRODUCTO",
  "ATF",
] as const;

const normalizeRole = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

const defaultRoleSet = new Set(DEFAULT_ROLE_FILTER_NAMES.map(normalizeRole));

export function defaultRoleFilterIds<T>(
  options: T[],
  id: (option: T) => string,
  label: (option: T) => string,
) {
  return options.filter((option) => defaultRoleSet.has(normalizeRole(label(option)))).map(id);
}

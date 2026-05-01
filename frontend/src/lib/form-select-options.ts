export function buildOrderedSelectOptions(
  builtInIds: readonly string[],
  customIds: string[] | undefined,
  labels: Record<string, string>,
  order: string[] | undefined,
  hidden: string[] | undefined,
): Array<{ value: string; label: string }> {
  const custom = customIds ?? [];
  const defaultAll = [...builtInIds, ...custom];
  const universe = new Set(defaultAll);
  for (const id of custom) universe.add(id);

  const orderedPart = order?.filter((k) => universe.has(k)) ?? [];
  const rest = defaultAll.filter((k) => !orderedPart.includes(k));
  const sequence =
    orderedPart.length > 0 ? [...orderedPart, ...rest] : defaultAll;
  const hide = new Set(hidden ?? []);
  return sequence
    .filter((k) => universe.has(k) && !hide.has(k))
    .map((k) => ({ value: k, label: labels[k] ?? k }));
}

export function mergeLabelRecord(
  base: Record<string, string>,
  overrides: Partial<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  if (!overrides) return out;
  for (const k of Object.keys(overrides)) {
    const v = overrides[k];
    if (v !== undefined && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

/** @deprecated use buildOrderedSelectOptions */
export function buildOrderedEnumOptions<T extends string>(
  enumValues: readonly T[],
  labels: Record<T, string>,
  order: string[] | undefined,
  hidden: string[] | undefined,
): Array<{ value: T; label: string }> {
  return buildOrderedSelectOptions(
    enumValues,
    [],
    labels as Record<string, string>,
    order,
    hidden,
  ) as Array<{ value: T; label: string }>;
}

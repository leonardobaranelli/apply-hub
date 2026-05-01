export function buildOrderedEnumOptions<T extends string>(
  enumValues: readonly T[],
  labels: Record<T, string>,
  order: string[] | undefined,
  hidden: string[] | undefined,
): Array<{ value: T; label: string }> {
  const set = new Set(enumValues);
  const orderedPart =
    order?.filter((k): k is T => set.has(k as T)) ?? [];
  const rest = enumValues.filter((k) => !orderedPart.includes(k));
  const sequence = orderedPart.length > 0 ? [...orderedPart, ...rest] : [...enumValues];
  const hide = new Set(hidden ?? []);
  return sequence
    .filter((k) => !hide.has(k))
    .map((k) => ({ value: k, label: labels[k] ?? k }));
}

export function mergeLabelRecord<T extends string>(
  base: Record<T, string>,
  overrides: Partial<Record<string, string>> | undefined,
): Record<T, string> {
  if (!overrides) return base;
  const out = { ...base } as Record<T, string>;
  for (const k of Object.keys(overrides)) {
    if (k in base && overrides[k] !== undefined && overrides[k] !== '') {
      out[k as T] = overrides[k] as string;
    }
  }
  return out;
}

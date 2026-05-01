import { BadRequestException } from '@nestjs/common';
import {
  ApplicationMethod,
  EmploymentType,
  PositionType,
} from '../../applications/domain/application.enums';
import { SearchPlatform } from '../../search-sessions/domain/search-session.enums';
import type { FormConfigDto } from '../dto/form-config.dto';

/** Custom keys: lowercase slug, no collision with built-ins. */
export const CUSTOM_OPTION_KEY_REGEX = /^[a-z][a-z0-9_]{0,47}$/;

const enumValues = <T extends Record<string, string>>(e: T): string[] =>
  [...new Set(Object.values(e))];

export const BUILTIN_METHOD_IDS = new Set<string>(
  enumValues(ApplicationMethod),
);
export const BUILTIN_POSITION_IDS = new Set<string>(
  enumValues(PositionType),
);
export const BUILTIN_EMPLOYMENT_IDS = new Set<string>(
  enumValues(EmploymentType),
);
export const BUILTIN_SEARCH_PLATFORM_IDS = new Set<string>(
  enumValues(SearchPlatform),
);

export function allMethodIds(config: FormConfigDto): Set<string> {
  const out = new Set(BUILTIN_METHOD_IDS);
  for (const id of config.customApplicationMethods ?? []) {
    out.add(id);
  }
  return out;
}

export function allPositionIds(config: FormConfigDto): Set<string> {
  const out = new Set(BUILTIN_POSITION_IDS);
  for (const id of config.customPositionTypes ?? []) {
    out.add(id);
  }
  return out;
}

export function allEmploymentIds(config: FormConfigDto): Set<string> {
  const out = new Set(BUILTIN_EMPLOYMENT_IDS);
  for (const id of config.customEmploymentTypes ?? []) {
    out.add(id);
  }
  return out;
}

export function allSearchPlatformIds(config: FormConfigDto): Set<string> {
  const out = new Set(BUILTIN_SEARCH_PLATFORM_IDS);
  for (const id of config.customSearchPlatforms ?? []) {
    out.add(id);
  }
  return out;
}

export function assertCustomSlugs(
  ids: string[] | undefined,
  reserved: Set<string>,
  field: string,
): void {
  if (!ids?.length) return;
  for (const id of ids) {
    if (reserved.has(id)) {
      throw new BadRequestException(
        `${field}: "${id}" conflicts with a built-in value`,
      );
    }
    if (!CUSTOM_OPTION_KEY_REGEX.test(id)) {
      throw new BadRequestException(
        `${field}: "${id}" must be a lowercase slug (a-z, 0-9, underscore)`,
      );
    }
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new BadRequestException(`${field}: duplicate "${id}"`);
    }
    seen.add(id);
  }
}

export function assertFullPermutation(
  order: string[] | undefined,
  universe: Set<string>,
  field: string,
): void {
  if (order === undefined) return;
  if (order.length !== universe.size) {
    throw new BadRequestException(
      `${field} must list each option exactly once (${universe.size} total)`,
    );
  }
  const seen = new Set<string>();
  for (const key of order) {
    if (!universe.has(key) || seen.has(key)) {
      throw new BadRequestException(
        `${field}: invalid or duplicate entry "${key}"`,
      );
    }
    seen.add(key);
  }
}

export function assertSubset(
  values: string[] | undefined,
  universe: Set<string>,
  field: string,
): void {
  if (!values?.length) return;
  for (const v of values) {
    if (!universe.has(v)) {
      throw new BadRequestException(`${field}: unknown value "${v}"`);
    }
  }
}

export function assertLabelKeys(
  labels: Record<string, string> | undefined,
  universe: Set<string>,
  field: string,
): void {
  if (!labels) return;
  for (const key of Object.keys(labels)) {
    if (!universe.has(key)) {
      throw new BadRequestException(`${field}: unknown key "${key}"`);
    }
  }
}

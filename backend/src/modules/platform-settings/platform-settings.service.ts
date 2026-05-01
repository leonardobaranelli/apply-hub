import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformSettings, WorkMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FormConfigDto } from './dto/form-config.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import {
  allEmploymentIds,
  allMethodIds,
  allPositionIds,
  allSearchPlatformIds,
  assertCustomSlugs,
  assertFullPermutation,
  assertLabelKeys,
  assertSubset,
  BUILTIN_EMPLOYMENT_IDS,
  BUILTIN_METHOD_IDS,
  BUILTIN_POSITION_IDS,
  BUILTIN_SEARCH_PLATFORM_IDS,
} from './domain/form-config.helpers';

const SETTINGS_ID = 'default';

const WORK_MODE_VALUES = new Set<string>(Object.values(WorkMode));

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformSettings> {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.platformSettings.create({
      data: {
        id: SETTINGS_ID,
        themeId: 'ocean',
        appearanceMode: 'dark',
        formConfig: {},
      },
    });
  }

  async getFormConfig(): Promise<FormConfigDto> {
    const row = await this.get();
    return (row.formConfig as FormConfigDto) ?? {};
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettings> {
    await this.get();
    if (dto.formConfig) {
      this.assertValidFormConfig(dto.formConfig);
    }

    try {
      return await this.prisma.platformSettings.update({
        where: { id: SETTINGS_ID },
        data: {
          ...(dto.themeId !== undefined ? { themeId: dto.themeId } : {}),
          ...(dto.appearanceMode !== undefined
            ? { appearanceMode: dto.appearanceMode }
            : {}),
          ...(dto.formConfig !== undefined
            ? { formConfig: dto.formConfig as object }
            : {}),
        },
      });
    } catch {
      throw new NotFoundException('Platform settings not found');
    }
  }

  private assertValidFormConfig(config: FormConfigDto): void {
    assertCustomSlugs(
      config.customApplicationMethods,
      BUILTIN_METHOD_IDS,
      'customApplicationMethods',
    );
    assertCustomSlugs(
      config.customPositionTypes,
      BUILTIN_POSITION_IDS,
      'customPositionTypes',
    );
    assertCustomSlugs(
      config.customEmploymentTypes,
      BUILTIN_EMPLOYMENT_IDS,
      'customEmploymentTypes',
    );
    assertCustomSlugs(
      config.customSearchPlatforms,
      BUILTIN_SEARCH_PLATFORM_IDS,
      'customSearchPlatforms',
    );

    const methodUniverse = allMethodIds(config);
    assertLabelKeys(
      config.applicationMethodLabels,
      methodUniverse,
      'applicationMethodLabels',
    );
    assertFullPermutation(
      config.applicationMethodOrder,
      methodUniverse,
      'applicationMethodOrder',
    );
    assertSubset(
      config.applicationMethodHidden,
      methodUniverse,
      'applicationMethodHidden',
    );

    if (config.workModeLabels) {
      for (const key of Object.keys(config.workModeLabels)) {
        if (!WORK_MODE_VALUES.has(key)) {
          throw new BadRequestException(
            `Invalid workModeLabels key: ${key}`,
          );
        }
      }
    }

    const posUniverse = allPositionIds(config);
    assertLabelKeys(config.positionLabels, posUniverse, 'positionLabels');
    assertFullPermutation(
      config.positionOrder,
      posUniverse,
      'positionOrder',
    );
    assertSubset(config.positionHidden, posUniverse, 'positionHidden');

    const empUniverse = allEmploymentIds(config);
    assertLabelKeys(
      config.employmentLabels,
      empUniverse,
      'employmentLabels',
    );
    assertFullPermutation(
      config.employmentOrder,
      empUniverse,
      'employmentOrder',
    );
    assertSubset(
      config.employmentHidden,
      empUniverse,
      'employmentHidden',
    );

    const platUniverse = allSearchPlatformIds(config);
    assertLabelKeys(
      config.searchPlatformLabels,
      platUniverse,
      'searchPlatformLabels',
    );
    assertFullPermutation(
      config.searchPlatformOrder,
      platUniverse,
      'searchPlatformOrder',
    );
    assertSubset(
      config.searchPlatformHidden,
      platUniverse,
      'searchPlatformHidden',
    );

    if (config.roleTitleOptions !== undefined) {
      if (config.roleTitleOptions.length > 80) {
        throw new BadRequestException('roleTitleOptions: at most 80 entries');
      }
    }
    if (config.resumeVersionOptions !== undefined) {
      if (config.resumeVersionOptions.length > 40) {
        throw new BadRequestException('resumeVersionOptions: at most 40 entries');
      }
    }
  }
}

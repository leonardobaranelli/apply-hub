import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformSettings } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FormConfigDto } from './dto/form-config.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import {
  allEmploymentIds,
  allMethodIds,
  allPositionIds,
  allSearchPlatformIds,
  allStageIds,
  allStatusIds,
  allWorkModeIds,
  assertAtLeastOneVisible,
  assertCustomSlugs,
  assertFullPermutation,
  assertLabelKeys,
  assertSubset,
  BUILTIN_EMPLOYMENT_IDS,
  BUILTIN_METHOD_IDS,
  BUILTIN_POSITION_IDS,
  BUILTIN_SEARCH_PLATFORM_IDS,
  BUILTIN_STAGE_IDS,
  BUILTIN_STATUS_IDS,
  BUILTIN_WORK_MODE_IDS,
} from './domain/form-config.helpers';

const SETTINGS_ID = 'default';

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
    this.validateGroup({
      custom: config.customApplicationMethods,
      labels: config.applicationMethodLabels,
      order: config.applicationMethodOrder,
      hidden: config.applicationMethodHidden,
      builtIn: BUILTIN_METHOD_IDS,
      universe: allMethodIds(config),
      customField: 'customApplicationMethods',
      labelsField: 'applicationMethodLabels',
      orderField: 'applicationMethodOrder',
      hiddenField: 'applicationMethodHidden',
    });
    this.validateGroup({
      custom: config.customWorkModes,
      labels: config.workModeLabels,
      order: config.workModeOrder,
      hidden: config.workModeHidden,
      builtIn: BUILTIN_WORK_MODE_IDS,
      universe: allWorkModeIds(config),
      customField: 'customWorkModes',
      labelsField: 'workModeLabels',
      orderField: 'workModeOrder',
      hiddenField: 'workModeHidden',
    });
    this.validateGroup({
      custom: config.customPositionTypes,
      labels: config.positionLabels,
      order: config.positionOrder,
      hidden: config.positionHidden,
      builtIn: BUILTIN_POSITION_IDS,
      universe: allPositionIds(config),
      customField: 'customPositionTypes',
      labelsField: 'positionLabels',
      orderField: 'positionOrder',
      hiddenField: 'positionHidden',
    });
    this.validateGroup({
      custom: config.customEmploymentTypes,
      labels: config.employmentLabels,
      order: config.employmentOrder,
      hidden: config.employmentHidden,
      builtIn: BUILTIN_EMPLOYMENT_IDS,
      universe: allEmploymentIds(config),
      customField: 'customEmploymentTypes',
      labelsField: 'employmentLabels',
      orderField: 'employmentOrder',
      hiddenField: 'employmentHidden',
    });
    this.validateGroup({
      custom: config.customSearchPlatforms,
      labels: config.searchPlatformLabels,
      order: config.searchPlatformOrder,
      hidden: config.searchPlatformHidden,
      builtIn: BUILTIN_SEARCH_PLATFORM_IDS,
      universe: allSearchPlatformIds(config),
      customField: 'customSearchPlatforms',
      labelsField: 'searchPlatformLabels',
      orderField: 'searchPlatformOrder',
      hiddenField: 'searchPlatformHidden',
    });
    this.validateGroup({
      custom: config.customApplicationStatuses,
      labels: config.applicationStatusLabels,
      order: config.applicationStatusOrder,
      hidden: config.applicationStatusHidden,
      builtIn: BUILTIN_STATUS_IDS,
      universe: allStatusIds(config),
      customField: 'customApplicationStatuses',
      labelsField: 'applicationStatusLabels',
      orderField: 'applicationStatusOrder',
      hiddenField: 'applicationStatusHidden',
    });
    this.validateGroup({
      custom: config.customApplicationStages,
      labels: config.applicationStageLabels,
      order: config.applicationStageOrder,
      hidden: config.applicationStageHidden,
      builtIn: BUILTIN_STAGE_IDS,
      universe: allStageIds(config),
      customField: 'customApplicationStages',
      labelsField: 'applicationStageLabels',
      orderField: 'applicationStageOrder',
      hiddenField: 'applicationStageHidden',
    });

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

  private validateGroup(spec: {
    custom: string[] | undefined;
    labels: Record<string, string> | undefined;
    order: string[] | undefined;
    hidden: string[] | undefined;
    builtIn: Set<string>;
    universe: Set<string>;
    customField: string;
    labelsField: string;
    orderField: string;
    hiddenField: string;
  }): void {
    assertCustomSlugs(spec.custom, spec.builtIn, spec.customField);
    assertLabelKeys(spec.labels, spec.universe, spec.labelsField);
    assertFullPermutation(spec.order, spec.universe, spec.orderField);
    assertSubset(spec.hidden, spec.universe, spec.hiddenField);
    assertAtLeastOneVisible(spec.hidden, spec.universe, spec.hiddenField);
  }
}

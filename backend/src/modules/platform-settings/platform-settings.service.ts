import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationMethod,
  PlatformSettings,
  WorkMode,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FormConfigDto } from './dto/form-config.dto';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

const SETTINGS_ID = 'default';

const METHOD_VALUES = new Set<string>(Object.values(ApplicationMethod));
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
        formConfig: {},
      },
    });
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
    if (config.applicationMethodLabels) {
      for (const key of Object.keys(config.applicationMethodLabels)) {
        if (!METHOD_VALUES.has(key)) {
          throw new BadRequestException(
            `Invalid applicationMethodLabels key: ${key}`,
          );
        }
      }
    }
    if (config.applicationMethodOrder !== undefined) {
      const order = config.applicationMethodOrder;
      if (order.length !== METHOD_VALUES.size) {
        throw new BadRequestException(
          'applicationMethodOrder must list each application method exactly once',
        );
      }
      const seen = new Set<string>();
      for (const key of order) {
        if (!METHOD_VALUES.has(key) || seen.has(key)) {
          throw new BadRequestException(
            `Invalid applicationMethodOrder entry: ${key}`,
          );
        }
        seen.add(key);
      }
    }
    if (config.applicationMethodHidden) {
      for (const key of config.applicationMethodHidden) {
        if (!METHOD_VALUES.has(key)) {
          throw new BadRequestException(
            `Invalid applicationMethodHidden value: ${key}`,
          );
        }
      }
    }
    if (config.workModeLabels) {
      for (const key of Object.keys(config.workModeLabels)) {
        if (!WORK_MODE_VALUES.has(key)) {
          throw new BadRequestException(
            `Invalid workModeLabels key: ${key}`,
          );
        }
      }
    }
  }
}

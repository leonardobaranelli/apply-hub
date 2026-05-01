import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobSearchSession, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { allSearchPlatformIds } from '../platform-settings/domain/form-config.helpers';
import type { FormConfigDto } from '../platform-settings/dto/form-config.dto';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { CreateSearchSessionDto } from './dto/create-search-session.dto';
import { QuerySearchSessionDto } from './dto/query-search-session.dto';
import { UpdateSearchSessionDto } from './dto/update-search-session.dto';

@Injectable()
export class SearchSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  private parseJobPostedDateOnly(raw: string): Date {
    const day = raw.trim().slice(0, 10);
    return new Date(`${day}T00:00:00.000Z`);
  }

  async create(dto: CreateSearchSessionDto): Promise<JobSearchSession> {
    await this.assertSearchPlatform(dto.platform);

    const searchedAt = dto.searchedAt ? new Date(dto.searchedAt) : new Date();
    const jobPostedFrom = dto.jobPostedFrom
      ? this.parseJobPostedDateOnly(dto.jobPostedFrom)
      : new Date(`${searchedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
    return this.prisma.jobSearchSession.create({
      data: {
        platform: dto.platform,
        platformOther:
          dto.platform === 'other'
            ? (dto.platformOther?.trim() ?? null)
            : null,
        queryTitle: dto.queryTitle.trim(),
        filterDescription: dto.filterDescription?.trim() ?? null,
        jobPostedFrom,
        searchedAt,
        resultsApproxCount: dto.resultsApproxCount ?? null,
        isComplete: dto.isComplete ?? false,
        searchUrl: dto.searchUrl?.trim() ?? null,
        notes: dto.notes?.trim() ?? null,
      },
    });
  }

  async findAll(
    query: QuerySearchSessionDto,
  ): Promise<PaginatedResult<JobSearchSession>> {
    const { page, limit, search, platform, fromDate, toDate } = query;
    const where: Prisma.JobSearchSessionWhereInput = {};

    if (search) {
      where.OR = [
        { queryTitle: { contains: search, mode: 'insensitive' } },
        { filterDescription: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { platformOther: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (platform) where.platform = platform;
    if (fromDate || toDate) {
      where.searchedAt = {
        ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
        ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999Z`) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.jobSearchSession.findMany({
        where,
        orderBy: { searchedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobSearchSession.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string): Promise<
    JobSearchSession & { _count: { applications: number } }
  > {
    const row = await this.prisma.jobSearchSession.findUnique({
      where: { id },
      include: { _count: { select: { applications: true } } },
    });
    if (!row) {
      throw new NotFoundException(`Search session ${id} not found`);
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdateSearchSessionDto,
  ): Promise<JobSearchSession> {
    const existing = await this.prisma.jobSearchSession.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Search session ${id} not found`);
    }
    if (dto.platform !== undefined) {
      await this.assertSearchPlatform(dto.platform);
    }
    const data: Prisma.JobSearchSessionUpdateInput = {};
    if (dto.platform !== undefined) {
      data.platform = dto.platform;
      if (dto.platform !== 'other') {
        data.platformOther = null;
      }
    }
    if (dto.platformOther !== undefined) {
      const effectivePlatform = dto.platform ?? existing.platform;
      data.platformOther =
        effectivePlatform === 'other'
          ? (dto.platformOther?.trim() ?? null)
          : null;
    }
    if (dto.queryTitle !== undefined) data.queryTitle = dto.queryTitle.trim();
    if (dto.filterDescription !== undefined) {
      data.filterDescription = dto.filterDescription?.trim() ?? null;
    }
    if (dto.jobPostedFrom !== undefined) {
      data.jobPostedFrom = dto.jobPostedFrom
        ? this.parseJobPostedDateOnly(dto.jobPostedFrom)
        : undefined;
    }
    if (dto.searchedAt !== undefined) {
      data.searchedAt = dto.searchedAt ? new Date(dto.searchedAt) : undefined;
    }
    if (dto.resultsApproxCount !== undefined) {
      data.resultsApproxCount = dto.resultsApproxCount;
    }
    if (dto.isComplete !== undefined) {
      data.isComplete = dto.isComplete;
    }
    if (dto.searchUrl !== undefined) {
      data.searchUrl = dto.searchUrl?.trim() ?? null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() ?? null;

    return this.prisma.jobSearchSession.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.jobSearchSession.delete({ where: { id } });
  }

  private async assertSearchPlatform(platform: string): Promise<void> {
    const fc = (await this.platformSettings.getFormConfig()) as FormConfigDto;
    if (!allSearchPlatformIds(fc).has(platform)) {
      throw new BadRequestException('Invalid search session platform');
    }
  }
}

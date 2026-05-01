import { Injectable, NotFoundException } from '@nestjs/common';
import { JobApplication, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEventType } from '../application-events/domain/event.enums';
import {
  ACTIVE_STATUSES,
  ApplicationStage,
  ApplicationStatus,
  isTerminalStatus,
} from './domain/application.enums';
import { StatusResolverService } from './domain/status-resolver.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusResolver: StatusResolverService,
  ) {}

  // ───────────────────────────────────────────────────────────────────
  //  CREATE
  // ───────────────────────────────────────────────────────────────────
  async create(dto: CreateApplicationDto): Promise<JobApplication> {
    const today = new Date().toISOString().slice(0, 10);
    const applicationDate = new Date(`${dto.applicationDate ?? today}T00:00:00.000Z`);
    const status = dto.status ?? ApplicationStatus.APPLIED;
    const stage = dto.stage ?? this.statusResolver.defaultStageFor(status);

    let jobSearchSessionId: string | undefined;
    if (dto.jobSearchSessionId) {
      await this.assertSearchSessionExists(dto.jobSearchSessionId);
      jobSearchSessionId = dto.jobSearchSessionId;
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.jobApplication.create({
        data: {
          companyName: dto.companyName.trim(),
          companyUrl: dto.companyUrl ?? null,
          roleTitle: dto.roleTitle,
          position: dto.position,
          jobDescription: dto.jobDescription ?? null,
          jobUrl: dto.jobUrl ?? null,
          location: dto.location ?? null,
          workMode: dto.workMode,
          employmentType: dto.employmentType ?? null,
          applicationDate,
          applicationMethod: dto.applicationMethod,
          source: dto.source ?? null,
          platform: dto.platform ?? null,
          salaryMin: dto.salaryMin ?? null,
          salaryMax: dto.salaryMax ?? null,
          currency: dto.currency ?? null,
          salaryPeriod: dto.salaryPeriod ?? null,
          status,
          stage,
          priority: dto.priority,
          excitement: dto.excitement ?? null,
          tags: dto.tags ?? [],
          notes: dto.notes ?? null,
          resumeVersion: dto.resumeVersion ?? null,
          contactName: dto.contactName ?? null,
          contactLinkedin: dto.contactLinkedin ?? null,
          contactEmail: dto.contactEmail ?? null,
          contactPhone: dto.contactPhone ?? null,
          contactOther: dto.contactOther ?? null,
          jobSearchSessionId: jobSearchSessionId ?? undefined,
          lastActivityAt: new Date(),
        },
      });

      await tx.applicationEvent.create({
        data: {
          applicationId: created.id,
          type: ApplicationEventType.APPLICATION_SUBMITTED,
          newStatus: created.status,
          newStage: created.stage,
          title: `Application submitted for ${created.roleTitle}`,
          description: dto.notes ?? null,
          occurredAt: new Date(`${dto.applicationDate ?? today}T12:00:00.000Z`),
          metadata: {
            applicationMethod: created.applicationMethod,
            source: created.source,
            platform: created.platform,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  READ
  // ───────────────────────────────────────────────────────────────────
  async findAll(
    query: QueryApplicationDto,
  ): Promise<PaginatedResult<JobApplication>> {
    const {
      page,
      limit,
      search,
      status,
      stage,
      position,
      method,
      workMode,
      priority,
      companyName,
      fromDate,
      toDate,
      includeArchived,
      onlyActive,
      tags,
      sortBy = 'applicationDate',
      sortDir = 'desc',
    } = query;

    const where: Prisma.JobApplicationWhereInput = {};

    if (!includeArchived) {
      where.archivedAt = null;
    }
    if (search) {
      where.OR = [
        { roleTitle: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status?.length) where.status = { in: status };
    if (stage?.length) where.stage = { in: stage };
    if (position?.length) where.position = { in: position };
    if (method?.length) where.applicationMethod = { in: method };
    if (workMode?.length) where.workMode = { in: workMode };
    if (priority?.length) where.priority = { in: priority };
    if (companyName) {
      where.companyName = { contains: companyName, mode: 'insensitive' };
    }
    if (onlyActive) {
      where.status = { in: Array.from(ACTIVE_STATUSES) };
    }
    if (fromDate) {
      where.applicationDate = {
        ...(typeof where.applicationDate === 'object'
          ? where.applicationDate
          : {}),
        gte: new Date(`${fromDate}T00:00:00.000Z`),
      };
    }
    if (toDate) {
      where.applicationDate = {
        ...(typeof where.applicationDate === 'object'
          ? where.applicationDate
          : {}),
        lte: new Date(`${toDate}T23:59:59.999Z`),
      };
    }
    if (tags?.length) {
      where.tags = { hasSome: tags };
    }

    const sortMap: Record<string, keyof Prisma.JobApplicationOrderByWithRelationInput> = {
      applicationDate: 'applicationDate',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      status: 'status',
      priority: 'priority',
      lastActivityAt: 'lastActivityAt',
    };
    const orderField = sortMap[sortBy] ?? 'applicationDate';
    const orderBy: Prisma.JobApplicationOrderByWithRelationInput[] = [
      { [orderField]: sortDir } as Prisma.JobApplicationOrderByWithRelationInput,
      { createdAt: 'desc' },
    ];

    const [data, total] = await this.prisma.$transaction([
      this.prisma.jobApplication.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
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

  async findOne(id: string): Promise<JobApplication> {
    const app = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: {
        contacts: true,
        jobSearchSession: {
          select: {
            id: true,
            queryTitle: true,
            platform: true,
            platformOther: true,
            searchedAt: true,
            isComplete: true,
          },
        },
      },
    });
    if (!app) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return app;
  }

  // ───────────────────────────────────────────────────────────────────
  //  UPDATE
  // ───────────────────────────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<JobApplication> {
    await this.assertExists(id);
    const data: Prisma.JobApplicationUpdateInput = {};
    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim();
    if (dto.companyUrl !== undefined) data.companyUrl = dto.companyUrl;
    if (dto.roleTitle !== undefined) data.roleTitle = dto.roleTitle;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.jobDescription !== undefined) data.jobDescription = dto.jobDescription;
    if (dto.jobUrl !== undefined) data.jobUrl = dto.jobUrl;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.workMode !== undefined) data.workMode = dto.workMode;
    if (dto.employmentType !== undefined) data.employmentType = dto.employmentType;
    if (dto.applicationDate !== undefined) {
      data.applicationDate = new Date(`${dto.applicationDate}T00:00:00.000Z`);
    }
    if (dto.applicationMethod !== undefined)
      data.applicationMethod = dto.applicationMethod;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.salaryMin !== undefined) data.salaryMin = dto.salaryMin;
    if (dto.salaryMax !== undefined) data.salaryMax = dto.salaryMax;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.salaryPeriod !== undefined) data.salaryPeriod = dto.salaryPeriod;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.excitement !== undefined) data.excitement = dto.excitement;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.resumeVersion !== undefined) data.resumeVersion = dto.resumeVersion;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactLinkedin !== undefined) data.contactLinkedin = dto.contactLinkedin;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.contactOther !== undefined) data.contactOther = dto.contactOther;
    if (dto.jobSearchSessionId !== undefined) {
      if (dto.jobSearchSessionId === null) {
        data.jobSearchSession = { disconnect: true };
      } else {
        await this.assertSearchSessionExists(dto.jobSearchSessionId);
        data.jobSearchSession = {
          connect: { id: dto.jobSearchSessionId },
        };
      }
    }

    return this.prisma.jobApplication.update({
      where: { id },
      data,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  STATUS TRANSITIONS
  // ───────────────────────────────────────────────────────────────────
  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
  ): Promise<JobApplication> {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.jobApplication.findUnique({ where: { id } });
      if (!application) {
        throw new NotFoundException(`Application ${id} not found`);
      }

      const previousStatus = application.status as ApplicationStatus;
      const previousStage = application.stage as ApplicationStage;
      const newStatus = dto.status;
      const newStage =
        dto.stage ?? this.statusResolver.defaultStageFor(newStatus);

      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

      const data: Prisma.JobApplicationUpdateInput = {
        status: newStatus,
        stage: newStage,
        lastActivityAt: occurredAt,
      };

      if (
        this.statusResolver.isFirstResponseTransition(previousStatus, newStatus) &&
        !application.firstResponseAt
      ) {
        data.firstResponseAt = occurredAt;
      }

      if (this.statusResolver.isClosingTransition(newStatus)) {
        data.closedAt = occurredAt;
      } else if (
        previousStatus !== newStatus &&
        !isTerminalStatus(newStatus)
      ) {
        data.closedAt = null;
      }

      const updated = await tx.jobApplication.update({
        where: { id },
        data,
      });

      await tx.applicationEvent.create({
        data: {
          applicationId: updated.id,
          type: this.eventTypeForStatus(newStatus),
          newStatus,
          newStage,
          channel: dto.channel ?? null,
          title:
            dto.title ?? `Status: ${previousStatus} → ${newStatus} (${newStage})`,
          description: dto.description ?? null,
          occurredAt,
          metadata: {
            previousStatus,
            previousStage,
            ...(dto.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private eventTypeForStatus(status: ApplicationStatus): ApplicationEventType {
    switch (status) {
      case ApplicationStatus.OFFER:
        return ApplicationEventType.OFFER_RECEIVED;
      case ApplicationStatus.ACCEPTED:
        return ApplicationEventType.OFFER_ACCEPTED;
      case ApplicationStatus.NEGOTIATING:
        return ApplicationEventType.OFFER_NEGOTIATED;
      case ApplicationStatus.REJECTED:
        return ApplicationEventType.REJECTED;
      case ApplicationStatus.WITHDRAWN:
        return ApplicationEventType.WITHDRAWN;
      case ApplicationStatus.GHOSTED:
        return ApplicationEventType.GHOSTED_MARKED;
      default:
        return ApplicationEventType.STATUS_CHANGED;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  CONTACTS
  // ───────────────────────────────────────────────────────────────────
  async linkContacts(
    id: string,
    contactIds: string[],
  ): Promise<JobApplication> {
    await this.assertExists(id);
    return this.prisma.jobApplication.update({
      where: { id },
      data: {
        contacts: {
          set: contactIds.map((cid) => ({ id: cid })),
        },
      },
      include: { contacts: true },
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  ARCHIVE / RESTORE / DELETE
  // ───────────────────────────────────────────────────────────────────
  async archive(id: string): Promise<JobApplication> {
    await this.assertExists(id);
    return this.prisma.jobApplication.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async restore(id: string): Promise<JobApplication> {
    await this.assertExists(id);
    return this.prisma.jobApplication.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.jobApplication.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(`Application ${id} not found`);
      }
      throw err;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  AUTO-GHOST: marks as ghosted applications stale for X days
  // ───────────────────────────────────────────────────────────────────
  async markStaleAsGhosted(daysWithoutActivity = 21): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysWithoutActivity);

    const stale = await this.prisma.jobApplication.findMany({
      where: {
        status: { in: [ApplicationStatus.APPLIED, ApplicationStatus.ACKNOWLEDGED] },
      },
    });

    let count = 0;
    for (const app of stale) {
      const ref = app.lastActivityAt ?? app.applicationDate;
      if (ref < threshold) {
        await this.changeStatus(app.id, {
          status: ApplicationStatus.GHOSTED,
          stage: ApplicationStage.CLOSED,
          title: 'Auto-marked as ghosted',
          description: `No activity for more than ${daysWithoutActivity} days`,
        });
        count += 1;
      }
    }
    return count;
  }

  // ───────────────────────────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────────────────────────
  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.jobApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Application ${id} not found`);
    }
  }

  private async assertSearchSessionExists(id: string): Promise<void> {
    const row = await this.prisma.jobSearchSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Search session ${id} not found`);
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEventType } from './domain/event.enums';
import { CreateEventDto } from './dto/create-event.dto';

const RESPONSE_TYPES: ReadonlySet<ApplicationEventType> = new Set([
  ApplicationEventType.MESSAGE_RECEIVED,
  ApplicationEventType.EMAIL_RECEIVED,
  ApplicationEventType.INTERVIEW_SCHEDULED,
  ApplicationEventType.ASSESSMENT_ASSIGNED,
  ApplicationEventType.FEEDBACK_RECEIVED,
  ApplicationEventType.OFFER_RECEIVED,
]);

@Injectable()
export class ApplicationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto): Promise<ApplicationEvent> {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.jobApplication.findUnique({
        where: { id: dto.applicationId },
        select: { id: true, firstResponseAt: true },
      });
      if (!application) {
        throw new NotFoundException(
          `Application ${dto.applicationId} not found`,
        );
      }

      const occurredAt = dto.occurredAt
        ? new Date(dto.occurredAt)
        : new Date();

      const updateData: Prisma.JobApplicationUpdateInput = {
        lastActivityAt: occurredAt,
      };
      if (!application.firstResponseAt && this.implyResponse(dto.type)) {
        updateData.firstResponseAt = occurredAt;
      }

      await tx.jobApplication.update({
        where: { id: application.id },
        data: updateData,
      });

      return tx.applicationEvent.create({
        data: {
          applicationId: dto.applicationId,
          type: dto.type,
          title: dto.title,
          description: dto.description ?? null,
          channel: dto.channel ?? null,
          newStatus: dto.newStatus ?? null,
          newStage: dto.newStage ?? null,
          occurredAt,
          metadata: (dto.metadata ?? null) as Prisma.InputJsonValue,
        },
      });
    });
  }

  async findByApplication(applicationId: string): Promise<ApplicationEvent[]> {
    return this.prisma.applicationEvent.findMany({
      where: { applicationId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<ApplicationEvent> {
    const event = await this.prisma.applicationEvent.findUnique({
      where: { id },
    });
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }
    return event;
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.applicationEvent.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(`Event ${id} not found`);
      }
      throw err;
    }
  }

  private implyResponse(type: ApplicationEventType): boolean {
    return RESPONSE_TYPES.has(type);
  }
}

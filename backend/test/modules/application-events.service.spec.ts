import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApplicationEventsService } from '../../src/modules/application-events/application-events.service';
import { ApplicationEventType } from '../../src/modules/application-events/domain/event.enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

describe('ApplicationEventsService', () => {
  let prisma: PrismaMock;
  let service: ApplicationEventsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ApplicationEventsService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when the application does not exist', async () => {
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.create({
        applicationId: 'missing',
        type: ApplicationEventType.NOTE_ADDED,
        title: 'note',
      } as Parameters<ApplicationEventsService['create']>[0]),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('within a transaction: bumps lastActivityAt and creates the event (both writes flow through the prisma client)', async () => {
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 'app-1',
      firstResponseAt: null,
    });
    prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
    prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

    await service.create({
      applicationId: 'app-1',
      type: ApplicationEventType.NOTE_ADDED,
      title: 'just a note',
    } as Parameters<ApplicationEventsService['create']>[0]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.jobApplication.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'app-1' });
    expect(updateArgs.data.lastActivityAt).toBeInstanceOf(Date);
    // NOTE_ADDED does NOT imply a response, so firstResponseAt must stay untouched.
    expect(updateArgs.data.firstResponseAt).toBeUndefined();

    expect(prisma.applicationEvent.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.applicationEvent.create.mock.calls[0][0];
    expect(createArgs.data.applicationId).toBe('app-1');
    expect(createArgs.data.type).toBe(ApplicationEventType.NOTE_ADDED);
  });

  it('sets firstResponseAt for response-implying events (e.g. EMAIL_RECEIVED)', async () => {
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 'app-1',
      firstResponseAt: null,
    });
    prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
    prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

    await service.create({
      applicationId: 'app-1',
      type: ApplicationEventType.EMAIL_RECEIVED,
      title: 'reply',
    } as Parameters<ApplicationEventsService['create']>[0]);

    const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
    expect(updateArgs.data.firstResponseAt).toBeInstanceOf(Date);
  });

  it('does NOT overwrite firstResponseAt when it is already set', async () => {
    const previous = new Date('2025-01-01T00:00:00Z');
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 'app-1',
      firstResponseAt: previous,
    });
    prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
    prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

    await service.create({
      applicationId: 'app-1',
      type: ApplicationEventType.EMAIL_RECEIVED,
      title: 'reply 2',
    } as Parameters<ApplicationEventsService['create']>[0]);

    const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
    expect(updateArgs.data.firstResponseAt).toBeUndefined();
  });

  it('remove translates P2025 to NotFoundException', async () => {
    prisma.applicationEvent.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('gone', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApplicationsService } from '../../src/modules/applications/applications.service';
import {
  ApplicationStage,
  ApplicationStatus,
} from '../../src/modules/applications/domain/application.enums';
import { StatusResolverService } from '../../src/modules/applications/domain/status-resolver.service';
import { ApplicationEventType } from '../../src/modules/application-events/domain/event.enums';
import { PlatformSettingsService } from '../../src/modules/platform-settings/platform-settings.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

function buildPlatformSettings(): jest.Mocked<PlatformSettingsService> {
  return {
    get: jest.fn(),
    getFormConfig: jest.fn().mockResolvedValue({}),
    update: jest.fn(),
  } as unknown as jest.Mocked<PlatformSettingsService>;
}

describe('ApplicationsService', () => {
  let prisma: PrismaMock;
  let resolver: StatusResolverService;
  let platformSettings: jest.Mocked<PlatformSettingsService>;
  let service: ApplicationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    resolver = new StatusResolverService();
    platformSettings = buildPlatformSettings();
    service = new ApplicationsService(
      prisma as unknown as PrismaService,
      resolver,
      platformSettings,
    );
  });

  describe('create', () => {
    it('inside a single $transaction, creates the application and emits APPLICATION_SUBMITTED', async () => {
      prisma.jobApplication.create.mockResolvedValueOnce({
        id: 'app-1',
        status: ApplicationStatus.APPLIED,
        stage: ApplicationStage.SUBMITTED,
        roleTitle: 'Senior',
        jobTitle: 'Backend Engineer',
        applicationMethod: 'linkedin_easy_apply',
        source: null,
        platform: null,
      });
      prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

      await service.create({
        companyName: '  Acme  ',
        roleTitle: 'Senior',
        jobTitle: '  Backend Engineer  ',
        position: 'backend',
        applicationMethod: 'linkedin_easy_apply',
        workMode: 'remote',
        priority: 'medium',
      } as unknown as Parameters<ApplicationsService['create']>[0]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Both writes flow through the same client → middleware fires for each.
      expect(prisma.jobApplication.create).toHaveBeenCalledTimes(1);
      expect(prisma.applicationEvent.create).toHaveBeenCalledTimes(1);

      const eventArgs = prisma.applicationEvent.create.mock.calls[0][0];
      expect(eventArgs.data.type).toBe(
        ApplicationEventType.APPLICATION_SUBMITTED,
      );
      expect(eventArgs.data.applicationId).toBe('app-1');
      expect(eventArgs.data.metadata).toEqual({
        applicationMethod: 'linkedin_easy_apply',
        source: null,
        platform: null,
      });

      const appArgs = prisma.jobApplication.create.mock.calls[0][0];
      expect(appArgs.data.companyName).toBe('Acme');
      expect(appArgs.data.jobTitle).toBe('Backend Engineer');
      expect(appArgs.data.lastActivityAt).toBeInstanceOf(Date);
      expect(appArgs.data.applicationDate).toBeInstanceOf(Date);
      expect(appArgs.data.vacancyPostedDate).toBeInstanceOf(Date);
    });

    it('rejects creation when applicationMethod is not in the configured vocabulary', async () => {
      platformSettings.getFormConfig.mockResolvedValue({
        customApplicationMethods: [],
      });

      await expect(
        service.create({
          companyName: 'Acme',
          roleTitle: 'X',
          jobTitle: 'Backend Engineer',
          applicationMethod: 'made_up',
          workMode: 'remote',
          priority: 'medium',
        } as unknown as Parameters<ApplicationsService['create']>[0]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.jobApplication.create).not.toHaveBeenCalled();
    });

    it('refuses to link to a non-existent search session', async () => {
      prisma.jobSearchSession.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create({
          companyName: 'Acme',
          roleTitle: 'X',
          jobTitle: 'Backend Engineer',
          applicationMethod: 'linkedin_easy_apply',
          workMode: 'remote',
          priority: 'medium',
          jobSearchSessionId: '00000000-0000-0000-0000-000000000000',
        } as unknown as Parameters<ApplicationsService['create']>[0]),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.jobApplication.create).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('inside a $transaction, sets firstResponseAt on first response and emits a typed event', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        id: 'app-1',
        status: ApplicationStatus.APPLIED,
        stage: ApplicationStage.SUBMITTED,
        firstResponseAt: null,
      });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
      prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

      await service.changeStatus('app-1', {
        status: ApplicationStatus.SCREENING,
      } as Parameters<ApplicationsService['changeStatus']>[1]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(ApplicationStatus.SCREENING);
      expect(updateArgs.data.stage).toBe(ApplicationStage.RECRUITER_SCREEN);
      expect(updateArgs.data.lastActivityAt).toBeInstanceOf(Date);
      expect(updateArgs.data.firstResponseAt).toBeInstanceOf(Date);

      const eventArgs = prisma.applicationEvent.create.mock.calls[0][0];
      expect(eventArgs.data.type).toBe(ApplicationEventType.STATUS_CHANGED);
      expect(eventArgs.data.metadata.previousStatus).toBe(
        ApplicationStatus.APPLIED,
      );
      expect(eventArgs.data.metadata.previousStage).toBe(
        ApplicationStage.SUBMITTED,
      );
    });

    it('emits OFFER_RECEIVED for transitions into OFFER status', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        id: 'app-1',
        status: ApplicationStatus.INTERVIEW,
        stage: ApplicationStage.TECH_INTERVIEW_2,
        firstResponseAt: new Date(),
      });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
      prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

      await service.changeStatus('app-1', {
        status: ApplicationStatus.OFFER,
      } as Parameters<ApplicationsService['changeStatus']>[1]);

      const eventArgs = prisma.applicationEvent.create.mock.calls[0][0];
      expect(eventArgs.data.type).toBe(ApplicationEventType.OFFER_RECEIVED);
      expect(eventArgs.data.newStage).toBe(ApplicationStage.OFFER_RECEIVED);
    });

    it('sets closedAt for terminal statuses (rejected/accepted/withdrawn/ghosted)', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        id: 'app-1',
        status: ApplicationStatus.SCREENING,
        stage: ApplicationStage.RECRUITER_SCREEN,
        firstResponseAt: new Date(),
      });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
      prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

      await service.changeStatus('app-1', {
        status: ApplicationStatus.REJECTED,
      } as Parameters<ApplicationsService['changeStatus']>[1]);

      const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
      expect(updateArgs.data.closedAt).toBeInstanceOf(Date);
    });

    it('clears closedAt when reopening to a non-terminal status', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({
        id: 'app-1',
        status: ApplicationStatus.REJECTED,
        stage: ApplicationStage.CLOSED,
        firstResponseAt: new Date(),
      });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });
      prisma.applicationEvent.create.mockResolvedValueOnce({ id: 'ev-1' });

      await service.changeStatus('app-1', {
        status: ApplicationStatus.SCREENING,
      } as Parameters<ApplicationsService['changeStatus']>[1]);

      const updateArgs = prisma.jobApplication.update.mock.calls[0][0];
      expect(updateArgs.data.closedAt).toBeNull();
    });
  });

  describe('archive / restore', () => {
    it('archive sets archivedAt via prisma.jobApplication.update', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({ id: 'app-1' });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });

      await service.archive('app-1');

      const args = prisma.jobApplication.update.mock.calls[0][0];
      expect(args.data.archivedAt).toBeInstanceOf(Date);
    });

    it('restore clears archivedAt via prisma.jobApplication.update', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({ id: 'app-1' });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });

      await service.restore('app-1');

      const args = prisma.jobApplication.update.mock.calls[0][0];
      expect(args.data.archivedAt).toBeNull();
    });
  });

  describe('linkContacts', () => {
    it('replaces the contact set via update + connect-set semantics', async () => {
      prisma.jobApplication.findUnique.mockResolvedValueOnce({ id: 'app-1' });
      prisma.jobApplication.update.mockResolvedValueOnce({ id: 'app-1' });

      await service.linkContacts('app-1', ['c1', 'c2']);

      const args = prisma.jobApplication.update.mock.calls[0][0];
      expect(args.data.contacts.set).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    });
  });

  describe('remove', () => {
    it('issues prisma.jobApplication.delete (replication path; events cascade on the DB)', async () => {
      prisma.jobApplication.delete.mockResolvedValueOnce({ id: 'app-1' });

      await service.remove('app-1');

      expect(prisma.jobApplication.delete).toHaveBeenCalledWith({
        where: { id: 'app-1' },
      });
    });

    it('translates Prisma P2025 to NotFoundException', async () => {
      prisma.jobApplication.delete.mockRejectedValueOnce(
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

  describe('markStaleAsGhosted', () => {
    it('replays changeStatus for each stale application — every transition emits its own event', async () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      prisma.jobApplication.findMany.mockResolvedValueOnce([
        {
          id: 'app-1',
          status: ApplicationStatus.APPLIED,
          stage: ApplicationStage.SUBMITTED,
          lastActivityAt: oldDate,
          applicationDate: oldDate,
        },
        {
          id: 'app-2',
          status: ApplicationStatus.ACKNOWLEDGED,
          stage: ApplicationStage.AUTO_REPLY,
          lastActivityAt: null,
          applicationDate: oldDate,
        },
      ]);

      prisma.jobApplication.findUnique.mockResolvedValue({
        id: 'app-x',
        status: ApplicationStatus.APPLIED,
        stage: ApplicationStage.SUBMITTED,
        firstResponseAt: null,
      });
      prisma.jobApplication.update.mockResolvedValue({ id: 'app-x' });
      prisma.applicationEvent.create.mockResolvedValue({ id: 'ev-x' });

      const count = await service.markStaleAsGhosted(21);

      expect(count).toBe(2);
      expect(prisma.applicationEvent.create).toHaveBeenCalledTimes(2);
      for (const call of prisma.applicationEvent.create.mock.calls) {
        const args = call[0];
        expect(args.data.type).toBe(ApplicationEventType.GHOSTED_MARKED);
        expect(args.data.newStatus).toBe(ApplicationStatus.GHOSTED);
        expect(args.data.newStage).toBe(ApplicationStage.CLOSED);
      }
    });
  });
});

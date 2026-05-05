import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformSettingsService } from '../../src/modules/platform-settings/platform-settings.service';
import { SearchSessionsService } from '../../src/modules/search-sessions/search-sessions.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

function buildPlatformSettings(): jest.Mocked<PlatformSettingsService> {
  return {
    get: jest.fn(),
    getFormConfig: jest.fn().mockResolvedValue({}),
    update: jest.fn(),
  } as unknown as jest.Mocked<PlatformSettingsService>;
}

describe('SearchSessionsService', () => {
  let prisma: PrismaMock;
  let platformSettings: jest.Mocked<PlatformSettingsService>;
  let service: SearchSessionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    platformSettings = buildPlatformSettings();
    service = new SearchSessionsService(
      prisma as unknown as PrismaService,
      platformSettings,
    );
  });

  describe('create', () => {
    it('rejects unknown platform values', async () => {
      platformSettings.getFormConfig.mockResolvedValue({});

      await expect(
        service.create({
          platform: 'made_up',
          queryTitle: 'q',
        } as Parameters<SearchSessionsService['create']>[0]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.jobSearchSession.create).not.toHaveBeenCalled();
    });

    it('persists trimmed fields and clears platformOther for non-`other` platforms', async () => {
      prisma.jobSearchSession.create.mockResolvedValueOnce({ id: 's1' });

      await service.create({
        platform: 'linkedin',
        platformOther: '  irrelevant  ',
        queryTitle: '  Backend  ',
        filterDescription: '  filt  ',
        notes: '  note  ',
        searchUrl: '  https://x.test  ',
      } as Parameters<SearchSessionsService['create']>[0]);

      const args = prisma.jobSearchSession.create.mock.calls[0][0];
      expect(args.data.platform).toBe('linkedin');
      expect(args.data.platformOther).toBeNull();
      expect(args.data.queryTitle).toBe('Backend');
      expect(args.data.filterDescription).toBe('filt');
      expect(args.data.notes).toBe('note');
      expect(args.data.searchUrl).toBe('https://x.test');
      expect(args.data.searchedAt).toBeInstanceOf(Date);
      expect(args.data.jobPostedFrom).toBeInstanceOf(Date);
    });

    it('keeps platformOther when platform === "other"', async () => {
      prisma.jobSearchSession.create.mockResolvedValueOnce({ id: 's1' });

      await service.create({
        platform: 'other',
        platformOther: '  Stack Overflow Jobs  ',
        queryTitle: 'q',
      } as Parameters<SearchSessionsService['create']>[0]);

      const args = prisma.jobSearchSession.create.mock.calls[0][0];
      expect(args.data.platform).toBe('other');
      expect(args.data.platformOther).toBe('Stack Overflow Jobs');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the session does not exist', async () => {
      prisma.jobSearchSession.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('missing', { notes: 'x' } as Parameters<
          SearchSessionsService['update']
        >[1]),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.jobSearchSession.update).not.toHaveBeenCalled();
    });

    it('clears platformOther when switching away from "other"', async () => {
      prisma.jobSearchSession.findUnique.mockResolvedValueOnce({
        id: 's1',
        platform: 'other',
        platformOther: 'Custom',
      });
      prisma.jobSearchSession.update.mockResolvedValueOnce({ id: 's1' });

      await service.update('s1', {
        platform: 'linkedin',
      } as Parameters<SearchSessionsService['update']>[1]);

      const args = prisma.jobSearchSession.update.mock.calls[0][0];
      expect(args.data.platform).toBe('linkedin');
      expect(args.data.platformOther).toBeNull();
    });
  });

  describe('remove', () => {
    it('issues prisma.jobSearchSession.delete (replication path)', async () => {
      prisma.jobSearchSession.findUnique.mockResolvedValueOnce({
        id: 's1',
        _count: { applications: 0 },
      });
      prisma.jobSearchSession.delete.mockResolvedValueOnce({ id: 's1' });

      await service.remove('s1');

      expect(prisma.jobSearchSession.delete).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
    });
  });
});

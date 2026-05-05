import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService } from '../../src/modules/platform-settings/platform-settings.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

describe('PlatformSettingsService', () => {
  let prisma: PrismaMock;
  let service: PlatformSettingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PlatformSettingsService(prisma as unknown as PrismaService);
  });

  describe('get', () => {
    it('returns the existing default row when present', async () => {
      const existing = { id: 'default', themeId: 'ocean' };
      prisma.platformSettings.findUnique.mockResolvedValueOnce(existing);

      const result = await service.get();

      expect(result).toBe(existing);
      expect(prisma.platformSettings.create).not.toHaveBeenCalled();
    });

    it('creates the default row on first call (replication path: prisma.platformSettings.create)', async () => {
      prisma.platformSettings.findUnique.mockResolvedValueOnce(null);
      const created = {
        id: 'default',
        themeId: 'ocean',
        appearanceMode: 'dark',
      };
      prisma.platformSettings.create.mockResolvedValueOnce(created);

      const result = await service.get();

      expect(result).toBe(created);
      expect(prisma.platformSettings.create).toHaveBeenCalledWith({
        data: {
          id: 'default',
          themeId: 'ocean',
          appearanceMode: 'dark',
          formConfig: {},
        },
      });
    });
  });

  describe('update', () => {
    it('issues prisma.platformSettings.update when the dto is partial and valid', async () => {
      prisma.platformSettings.findUnique.mockResolvedValueOnce({
        id: 'default',
      });
      prisma.platformSettings.update.mockResolvedValueOnce({ id: 'default' });

      await service.update({
        themeId: 'emerald',
      } as Parameters<PlatformSettingsService['update']>[0]);

      expect(prisma.platformSettings.update).toHaveBeenCalledWith({
        where: { id: 'default' },
        data: { themeId: 'emerald' },
      });
    });

    it('rejects invalid form config (custom slug colliding with a built-in)', async () => {
      prisma.platformSettings.findUnique.mockResolvedValueOnce({
        id: 'default',
      });

      await expect(
        service.update({
          formConfig: {
            customApplicationMethods: ['email'],
          },
        } as unknown as Parameters<PlatformSettingsService['update']>[0]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.platformSettings.update).not.toHaveBeenCalled();
    });

    it('rejects invalid form config (workModeLabels with unknown enum key)', async () => {
      prisma.platformSettings.findUnique.mockResolvedValueOnce({
        id: 'default',
      });

      await expect(
        service.update({
          formConfig: {
            workModeLabels: { not_a_mode: 'X' },
          },
        } as unknown as Parameters<PlatformSettingsService['update']>[0]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a valid form config including custom slugs and order permutation', async () => {
      prisma.platformSettings.findUnique.mockResolvedValueOnce({
        id: 'default',
      });
      prisma.platformSettings.update.mockResolvedValueOnce({ id: 'default' });

      // Custom + built-in IDs must form a full permutation in the order array.
      const customMethods = ['custom_one'];
      const builtins = [
        'email',
        'linkedin_easy_apply',
        'linkedin_external',
        'company_website',
        'job_board',
        'referral',
        'recruiter_outreach',
        'other',
      ];
      const order = [...builtins, ...customMethods];

      await service.update({
        formConfig: {
          customApplicationMethods: customMethods,
          applicationMethodOrder: order,
        },
      } as unknown as Parameters<PlatformSettingsService['update']>[0]);

      expect(prisma.platformSettings.update).toHaveBeenCalledTimes(1);
    });
  });
});

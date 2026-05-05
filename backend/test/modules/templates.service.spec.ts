import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TemplatesService } from '../../src/modules/templates/templates.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

describe('TemplatesService', () => {
  let prisma: PrismaMock;
  let service: TemplatesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TemplatesService(prisma as unknown as PrismaService);
  });

  it('create issues prisma.template.create with full payload', async () => {
    prisma.template.create.mockResolvedValueOnce({ id: 't1' });

    await service.create({
      name: 'Cover',
      type: 'cover_letter',
      body: 'Hi',
    } as Parameters<TemplatesService['create']>[0]);

    expect(prisma.template.create).toHaveBeenCalledTimes(1);
    expect(prisma.template.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        name: 'Cover',
        type: 'cover_letter',
        body: 'Hi',
        tags: [],
        isFavorite: false,
      }),
    );
  });

  it('findAll paginates and applies filters via $transaction', async () => {
    prisma.$transaction.mockImplementationOnce(async (input: unknown) => {
      if (Array.isArray(input)) return [[{ id: 't1' }], 1];
      return undefined;
    });

    const result = await service.findAll({
      page: 1,
      limit: 25,
      search: 'cover',
      type: 'cover_letter',
      favoritesOnly: true,
      language: 'en',
    } as Parameters<TemplatesService['findAll']>[0]);

    expect(result.meta.total).toBe(1);
    const findManyArgs = prisma.template.findMany.mock.calls[0][0];
    expect(findManyArgs.where.type).toBe('cover_letter');
    expect(findManyArgs.where.isFavorite).toBe(true);
    expect(findManyArgs.where.language).toBe('en');
  });

  it('update fails with NotFoundException when row is missing', async () => {
    prisma.template.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.update('missing', { name: 'X' } as Parameters<
        TemplatesService['update']
      >[1]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggleFavorite flips the boolean via prisma.template.update', async () => {
    prisma.template.findUnique.mockResolvedValueOnce({
      id: 't1',
      isFavorite: false,
    });
    prisma.template.update.mockResolvedValueOnce({ id: 't1', isFavorite: true });

    await service.toggleFavorite('t1');

    const args = prisma.template.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 't1' });
    expect(args.data).toEqual({ isFavorite: true });
  });

  it('markUsed increments usageCount and refreshes lastUsedAt (replicated update)', async () => {
    prisma.template.findUnique.mockResolvedValueOnce({ id: 't1' });
    prisma.template.update.mockResolvedValueOnce({ id: 't1' });

    await service.markUsed('t1');

    const args = prisma.template.update.mock.calls[0][0];
    expect(args.data.usageCount).toEqual({ increment: 1 });
    expect(args.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it('remove translates P2025 into NotFoundException', async () => {
    prisma.template.delete.mockRejectedValueOnce(
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

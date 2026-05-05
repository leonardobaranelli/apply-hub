import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactsService } from '../../src/modules/contacts/contacts.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../helpers/prisma-mock';

describe('ContactsService', () => {
  let prisma: PrismaMock;
  let service: ContactsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ContactsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('persists trimmed companyName via prisma.contact.create (replication path)', async () => {
      prisma.contact.create.mockResolvedValueOnce({ id: 'c1' });

      await service.create({
        name: 'Ada Lovelace',
        role: 'recruiter',
        companyName: '  Acme  ',
      } as Parameters<ContactsService['create']>[0]);

      expect(prisma.contact.create).toHaveBeenCalledTimes(1);
      const args = prisma.contact.create.mock.calls[0][0];
      expect(args.data.name).toBe('Ada Lovelace');
      expect(args.data.companyName).toBe('Acme');
      expect(args.data.title).toBeNull();
    });
  });

  describe('findAll', () => {
    it('paginates with $transaction(findMany + count) and respects filters', async () => {
      prisma.$transaction.mockImplementationOnce(async (input: unknown) => {
        if (Array.isArray(input)) {
          return [[{ id: 'c1' }], 1];
        }
        return undefined;
      });

      const result = await service.findAll({
        page: 2,
        limit: 10,
        search: 'ada',
        role: 'recruiter',
        companyName: 'Acme',
      } as Parameters<ContactsService['findAll']>[0]);

      expect(result.meta).toEqual({
        total: 1,
        page: 2,
        limit: 10,
        totalPages: 1,
      });
      const findManyCall = prisma.contact.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.role).toBe('recruiter');
      expect(findManyCall.where.companyName.contains).toBe('Acme');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the row does not exist', async () => {
      prisma.contact.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('missing', { name: 'New' } as Parameters<
          ContactsService['update']
        >[1]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('passes mutating call through prisma.contact.update so the replica mirror fires', async () => {
      prisma.contact.findUnique.mockResolvedValueOnce({ id: 'c1' });
      prisma.contact.update.mockResolvedValueOnce({ id: 'c1' });

      await service.update('c1', { companyName: '  Acme  ' } as Parameters<
        ContactsService['update']
      >[1]);

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ companyName: 'Acme' }),
      });
    });
  });

  describe('remove', () => {
    it('issues prisma.contact.delete (replication path)', async () => {
      prisma.contact.delete.mockResolvedValueOnce(undefined);

      await service.remove('c1');

      expect(prisma.contact.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('translates Prisma P2025 to NotFoundException', async () => {
      prisma.contact.delete.mockRejectedValueOnce(
        Object.assign(
          new Prisma.PrismaClientKnownRequestError('not found', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        ),
      );

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

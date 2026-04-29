import { Injectable, NotFoundException } from '@nestjs/common';
import { Contact, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactDto } from './dto/query-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContactDto): Promise<Contact> {
    return this.prisma.contact.create({
      data: {
        name: dto.name,
        title: dto.title ?? null,
        role: dto.role,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        linkedinUrl: dto.linkedinUrl ?? null,
        notes: dto.notes ?? null,
        companyName: dto.companyName?.trim() ?? null,
      },
    });
  }

  async findAll(query: QueryContactDto): Promise<PaginatedResult<Contact>> {
    const { page, limit, search, role, companyName } = query;
    const where: Prisma.ContactWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (companyName) {
      where.companyName = { contains: companyName, mode: 'insensitive' };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
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

  async findOne(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    return contact;
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    await this.findOne(id);
    return this.prisma.contact.update({
      where: { id },
      data: {
        ...dto,
        companyName: dto.companyName?.trim() ?? dto.companyName,
      },
    });
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.contact.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(`Contact ${id} not found`);
      }
      throw err;
    }
  }
}

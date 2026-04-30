import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Template } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTemplateDto): Promise<Template> {
    return this.prisma.template.create({
      data: {
        name: dto.name,
        type: dto.type,
        subject: dto.subject ?? null,
        body: dto.body,
        language: dto.language ?? null,
        tags: dto.tags ?? [],
        isFavorite: dto.isFavorite ?? false,
      },
    });
  }

  async findAll(query: QueryTemplateDto): Promise<PaginatedResult<Template>> {
    const { page, limit, search, type, favoritesOnly, language } = query;
    const where: Prisma.TemplateWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type;
    if (favoritesOnly) where.isFavorite = true;
    if (language) where.language = language;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        orderBy: [
          { isFavorite: 'desc' },
          { usageCount: 'desc' },
          { updatedAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.template.count({ where }),
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

  async findOne(id: string): Promise<Template> {
    const tpl = await this.prisma.template.findUnique({ where: { id } });
    if (!tpl) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return tpl;
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<Template> {
    await this.findOne(id);
    return this.prisma.template.update({
      where: { id },
      data: dto,
    });
  }

  async toggleFavorite(id: string): Promise<Template> {
    const tpl = await this.findOne(id);
    return this.prisma.template.update({
      where: { id },
      data: { isFavorite: !tpl.isFavorite },
    });
  }

  /**
   * Marks the template as used: increments the counter and refreshes
   * the last-used timestamp. Intended to be called when copying from
   * the frontend.
   */
  async markUsed(id: string): Promise<Template> {
    await this.findOne(id);
    return this.prisma.template.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.template.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(`Template ${id} not found`);
      }
      throw err;
    }
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TemplateType } from '../domain/template.enums';

export class QueryTemplateDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TemplateType })
  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  favoritesOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filter by language code (e.g. "en", "es")' })
  @IsOptional()
  @IsString()
  language?: string;
}

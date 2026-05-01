import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SearchPlatform } from '../domain/search-session.enums';

export class CreateSearchSessionDto {
  @ApiProperty({ enum: SearchPlatform })
  @IsEnum(SearchPlatform)
  platform!: SearchPlatform;

  @ApiPropertyOptional({ description: 'Custom label when platform is other' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOther?: string;

  @ApiProperty({ example: 'Node.js Developer' })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  queryTitle!: string;

  @ApiPropertyOptional({
    description: 'Free text: filters, sort, “past 3 days”, location, etc.',
  })
  @IsOptional()
  @IsString()
  filterDescription?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Job-posted filter date only (YYYY-MM-DD). Defaults to the calendar day of searchedAt.',
  })
  @IsOptional()
  @IsDateString()
  jobPostedFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When you ran the search (defaults to now)',
  })
  @IsOptional()
  @IsDateString()
  searchedAt?: string;

  @ApiPropertyOptional({
    description: 'Omit or leave empty if unknown',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  @Min(0)
  @Max(500000)
  resultsApproxCount?: number;

  @ApiPropertyOptional({
    description: 'Whether you finished reviewing/applying for this search',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(1000)
  searchUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  ApplicationStage,
  ApplicationStatus,
  Priority,
  WorkMode,
} from '../domain/application.enums';

const toArray = <T>(value: unknown): T[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as T[];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean) as T[];
};

export type ApplicationSortField =
  | 'applicationDate'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'priority'
  | 'lastActivityAt';

export class QueryApplicationDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search role, company name and notes' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray<ApplicationStatus>(value))
  @IsArray()
  @IsEnum(ApplicationStatus, { each: true })
  status?: ApplicationStatus[];

  @ApiPropertyOptional({ enum: ApplicationStage, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray<ApplicationStage>(value))
  @IsArray()
  @IsEnum(ApplicationStage, { each: true })
  stage?: ApplicationStage[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  position?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  method?: string[];

  @ApiPropertyOptional({ enum: WorkMode, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray<WorkMode>(value))
  @IsArray()
  @IsEnum(WorkMode, { each: true })
  workMode?: WorkMode[];

  @ApiPropertyOptional({ enum: Priority, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray<Priority>(value))
  @IsArray()
  @IsEnum(Priority, { each: true })
  priority?: Priority[];

  @ApiPropertyOptional({ description: 'Filter by company name (exact match)' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ description: 'Only active (non-terminal) applications' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyActive?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: [
      'applicationDate',
      'createdAt',
      'updatedAt',
      'status',
      'priority',
      'lastActivityAt',
    ],
    default: 'applicationDate',
  })
  @IsOptional()
  @IsString()
  sortBy?: ApplicationSortField = 'applicationDate';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc' = 'desc';
}

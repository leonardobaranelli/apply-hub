import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ApplicationStage,
  ApplicationStatus,
  PositionType,
  Priority,
  WorkMode,
} from '../domain/application.enums';

export class CreateApplicationDto {
  @ApiProperty({ description: 'Free-text company name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(500)
  companyUrl?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  roleTitle!: string;

  @ApiPropertyOptional({
    description: 'Built-in or custom position id from platform settings',
    default: PositionType.BACKEND,
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(500)
  jobUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ enum: WorkMode })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @ApiPropertyOptional({
    description: 'Built-in or custom employment type id from platform settings',
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  employmentType?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Defaults to today if not provided.',
  })
  @IsOptional()
  @IsDateString()
  applicationDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'When the vacancy was posted; defaults to application date or today.',
  })
  @IsOptional()
  @IsDateString()
  vacancyPostedDate?: string;

  @ApiPropertyOptional({
    description: 'Built-in or custom application method id from platform settings',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  applicationMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  salaryPeriod?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  stage?: ApplicationStage;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v: unknown) => String(v).trim()).filter(Boolean)
      : value,
  )
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeVersion?: string;

  // ── Vacancy contact ────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contactLinkedin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactOther?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional link to a logged job search session',
  })
  @IsOptional()
  @IsUUID()
  jobSearchSessionId?: string | null;
}

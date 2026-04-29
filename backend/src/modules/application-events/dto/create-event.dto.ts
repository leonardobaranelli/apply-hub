import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ApplicationStage,
  ApplicationStatus,
} from '../../applications/domain/application.enums';
import { ApplicationEventType, EventChannel } from '../domain/event.enums';

export class CreateEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  applicationId!: string;

  @ApiProperty({ enum: ApplicationEventType })
  @IsEnum(ApplicationEventType)
  type!: ApplicationEventType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: EventChannel })
  @IsOptional()
  @IsEnum(EventChannel)
  channel?: EventChannel;

  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  newStatus?: ApplicationStatus;

  @ApiPropertyOptional({ enum: ApplicationStage })
  @IsOptional()
  @IsEnum(ApplicationStage)
  newStage?: ApplicationStage;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EventChannel } from '../../application-events/domain/event.enums';

export class ChangeStatusDto {
  @ApiProperty({
    description:
      'Built-in or custom application status id from platform settings',
  })
  @IsString()
  @MaxLength(48)
  status!: string;

  @ApiPropertyOptional({
    description:
      'Built-in or custom application stage id from platform settings',
  })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  stage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: EventChannel })
  @IsOptional()
  @IsEnum(EventChannel)
  channel?: EventChannel;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

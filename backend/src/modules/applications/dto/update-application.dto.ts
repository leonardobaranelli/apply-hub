import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto';

/**
 * Status / stage are NOT updated through this endpoint, but through
 * `PATCH /applications/:id/status` to keep consistency and emit the
 * proper timeline events.
 */
export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['status', 'stage'] as const),
) {}

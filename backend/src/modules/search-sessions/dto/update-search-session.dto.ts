import { PartialType } from '@nestjs/swagger';
import { CreateSearchSessionDto } from './create-search-session.dto';

export class UpdateSearchSessionDto extends PartialType(CreateSearchSessionDto) {}

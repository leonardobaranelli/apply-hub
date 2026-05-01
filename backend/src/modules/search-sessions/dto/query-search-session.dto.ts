import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SearchPlatform } from '../domain/search-session.enums';

export class QuerySearchSessionDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SearchPlatform })
  @IsOptional()
  @IsEnum(SearchPlatform)
  platform?: SearchPlatform;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

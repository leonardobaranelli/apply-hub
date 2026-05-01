import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import {
  ALLOWED_APPEARANCE_MODES,
  ALLOWED_THEME_IDS,
} from '../domain/theme.constants';
import { FormConfigDto } from './form-config.dto';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ enum: ALLOWED_THEME_IDS })
  @IsOptional()
  @IsString()
  @IsIn([...ALLOWED_THEME_IDS])
  themeId?: string;

  @ApiPropertyOptional({ enum: ALLOWED_APPEARANCE_MODES })
  @IsOptional()
  @IsString()
  @IsIn([...ALLOWED_APPEARANCE_MODES])
  appearanceMode?: string;

  @ApiPropertyOptional({ type: FormConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FormConfigDto)
  formConfig?: FormConfigDto;
}

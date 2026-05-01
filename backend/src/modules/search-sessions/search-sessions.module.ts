import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { SearchSessionsController } from './search-sessions.controller';
import { SearchSessionsService } from './search-sessions.service';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [SearchSessionsController],
  providers: [SearchSessionsService],
  exports: [SearchSessionsService],
})
export class SearchSessionsModule {}

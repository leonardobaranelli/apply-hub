import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { StatusResolverService } from './domain/status-resolver.service';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, StatusResolverService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

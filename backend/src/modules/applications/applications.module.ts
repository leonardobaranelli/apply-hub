import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { StatusResolverService } from './domain/status-resolver.service';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, StatusResolverService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

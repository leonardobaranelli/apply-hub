import { Module } from '@nestjs/common';
import { ApplicationEventsController } from './application-events.controller';
import { ApplicationEventsService } from './application-events.service';

@Module({
  controllers: [ApplicationEventsController],
  providers: [ApplicationEventsService],
  exports: [ApplicationEventsService],
})
export class ApplicationEventsModule {}

import { Module } from '@nestjs/common';
import { SearchSessionsController } from './search-sessions.controller';
import { SearchSessionsService } from './search-sessions.service';

@Module({
  controllers: [SearchSessionsController],
  providers: [SearchSessionsService],
  exports: [SearchSessionsService],
})
export class SearchSessionsModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApplicationEventsService } from './application-events.service';
import { CreateEventDto } from './dto/create-event.dto';

@ApiTags('Application Events')
@Controller()
export class ApplicationEventsController {
  constructor(private readonly service: ApplicationEventsService) {}

  @Post('events')
  create(@Body() dto: CreateEventDto) {
    return this.service.create(dto);
  }

  @Get('applications/:applicationId/events')
  findByApplication(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ) {
    return this.service.findByApplication(applicationId);
  }

  @Get('events/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}

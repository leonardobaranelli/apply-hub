import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';
import { ApplicationsService } from './applications.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

class LinkContactsDto {
  @IsArray()
  @IsUUID('all', { each: true })
  contactIds!: string[];
}

@ApiTags('Applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new application' })
  create(@Body() dto: CreateApplicationDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List with filters, search and pagination' })
  findAll(@Query() query: QueryApplicationDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change status/stage and emit a timeline event' })
  changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.service.changeStatus(id, dto);
  }

  @Patch(':id/contacts')
  linkContacts(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkContactsDto,
  ) {
    return this.service.linkContacts(id, dto.contactIds);
  }

  @Patch(':id/archive')
  archive(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.archive(id);
  }

  @Patch(':id/restore')
  restore(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.restore(id);
  }

  @Post('mark-stale-ghosted')
  @ApiOperation({
    summary: 'Mark stale applications as ghosted (>21 days by default)',
  })
  markStaleAsGhosted(@Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : undefined;
    return this.service
      .markStaleAsGhosted(Number.isFinite(parsed) ? parsed : undefined)
      .then((count) => ({ ghostedCount: count }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}

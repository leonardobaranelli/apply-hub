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
import { ApiTags } from '@nestjs/swagger';
import { CreateSearchSessionDto } from './dto/create-search-session.dto';
import { QuerySearchSessionDto } from './dto/query-search-session.dto';
import { UpdateSearchSessionDto } from './dto/update-search-session.dto';
import { SearchSessionsService } from './search-sessions.service';

@ApiTags('Search sessions')
@Controller('search-sessions')
export class SearchSessionsController {
  constructor(private readonly service: SearchSessionsService) {}

  @Post()
  create(@Body() dto: CreateSearchSessionDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QuerySearchSessionDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSearchSessionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}

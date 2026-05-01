import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('search-activity')
  getSearchActivity(@Query() query: DashboardQueryDto) {
    return this.service.getSearchActivity(query);
  }

  @Get()
  getOverview(@Query() query: DashboardQueryDto) {
    return this.service.getOverview(query);
  }
}

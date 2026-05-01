import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { ApplicationEventsModule } from './modules/application-events/application-events.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { SearchSessionsModule } from './modules/search-sessions/search-sessions.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: true },
    }),
    PrismaModule,
    ContactsModule,
    ApplicationsModule,
    ApplicationEventsModule,
    TemplatesModule,
    SearchSessionsModule,
    DashboardModule,
    PlatformSettingsModule,
  ],
})
export class AppModule {}

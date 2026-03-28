import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { VerificationModule } from './verification/verification.module';
import { SearchModule } from './search/search.module';
import { BookingsModule } from './bookings/bookings.module';
import { ProviderModule } from './provider/provider.module';
import { ChatModule } from './chat/chat.module';
import { UtilityModule } from './utility/utility.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
    }),
    DatabaseModule,
    UsersModule,
    VerificationModule,
    SearchModule,
    BookingsModule,
    ProviderModule,
    ChatModule,
    UtilityModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

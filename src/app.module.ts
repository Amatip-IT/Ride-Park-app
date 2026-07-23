import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { ReviewsModule } from './reviews/reviews.module';
import { RidesModule } from './rides/rides.module';
import { TaxiBookingsModule } from './taxi-bookings/taxi-bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DisputesModule } from './disputes/disputes.module';
import { AccountStatusGuard } from './guards/account-status.guard';
import { AuthModule } from './guards/auth.module';
import { DocumentExpiryTask } from './tasks/document-expiry.task';
import { User, UserSchema } from './schemas/user.schema';
import { Chauffeur, ChauffeurSchema } from './schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from './schemas/taxi.schema';
import { RateLimitGuard } from './common/rate-limit.guard';
import { ObservabilityModule } from './observability/observability.module';
import { RequestObservabilityInterceptor } from './observability/request-observability.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
    ]),
    AuthModule,
    ObservabilityModule,
    DatabaseModule,
    UsersModule,
    VerificationModule,
    SearchModule,
    BookingsModule,
    ProviderModule,
    ChatModule,
    UtilityModule,
    AdminModule,
    ReviewsModule,
    RidesModule,
    TaxiBookingsModule,
    PaymentsModule,
    WalletModule,
    NotificationsModule,
    DisputesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DocumentExpiryTask,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestObservabilityInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccountStatusGuard,
    },
  ],
})
export class AppModule {}

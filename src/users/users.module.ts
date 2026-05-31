import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/schemas/user.schema';
import {
  user_settings,
  UserSettingsSchema,
} from 'src/schemas/user-settings-schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { VerificationModule } from 'src/verification/verification.module';
import { AdminGuard } from 'src/guards/admin.guard';
import { AuthGuard } from 'src/guards/auth.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: user_settings.name, schema: UserSettingsSchema },
      { name: Taxi.name, schema: TaxiSchema },
    ]),
    VerificationModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AuthGuard, AdminGuard],
})
export class UsersModule {}

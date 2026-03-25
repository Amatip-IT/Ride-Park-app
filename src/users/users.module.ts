import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/schemas/user.schema';
import {
  user_settings,
  UserSettingsSchema,
} from 'src/schemas/user-settings-schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { VerificationModule } from 'src/verification/verification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: user_settings.name, schema: UserSettingsSchema },
    ]),
    VerificationModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceSchema } from 'src/schemas/parking-space.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { UtilityModule } from 'src/utility/utility.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UtilityModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

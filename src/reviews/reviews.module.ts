import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { Review, ReviewSchema } from 'src/schemas/review.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import {
  ParkingSpace,
  ParkingSpaceSchema,
} from 'src/schemas/parking-space.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

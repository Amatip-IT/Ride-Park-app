import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import {
  ParkingSpace,
  ParkingSpaceSchema,
} from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { ReviewsModule } from 'src/reviews/reviews.module';

@Module({
  imports: [
    ReviewsModule,
    MongooseModule.forFeature([
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from 'src/schemas/platform-settings.schema';
import { PricingService } from './pricing.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
    ]),
  ],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}

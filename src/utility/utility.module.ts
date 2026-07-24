import { Module, Global } from '@nestjs/common';
import { What3WordsService } from './what3words.service';
import { AmazonLocationService } from './amazon-location.service';

@Global()
@Module({
  providers: [What3WordsService, AmazonLocationService],
  exports: [What3WordsService, AmazonLocationService],
})
export class UtilityModule {}

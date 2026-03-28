import { Module, Global } from '@nestjs/common';
import { What3WordsService } from './what3words.service';

@Global()
@Module({
  providers: [What3WordsService],
  exports: [What3WordsService],
})
export class UtilityModule {}

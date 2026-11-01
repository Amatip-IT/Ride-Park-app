import { Global, Module } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Global()
@Module({
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutingModule {}

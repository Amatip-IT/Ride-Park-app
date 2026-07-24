import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    try {
      const request: Request = context.switchToHttp().getRequest();
      const user = request['user'] as { role?: string } | undefined;

      if (!user) {
        throw new ForbiddenException('Admin privileges required');
      }

      if (user.role !== 'admin') {
        throw new ForbiddenException('Admin privileges required');
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error('AdminGuard unexpected error', error);
      throw new ForbiddenException('Admin privileges required');
    }
  }
}

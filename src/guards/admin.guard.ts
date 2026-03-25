import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    try {
      const request: Request = context.switchToHttp().getRequest();
      const user = request['user'] as { role?: string } | undefined;

      if (!user) {
        throw new ForbiddenException('User information is missing in request');
      }

      if (user.role !== 'admin') {
        throw new ForbiddenException('Admin privileges required');
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ForbiddenException('Access denied: ' + message);
    }
  }
}

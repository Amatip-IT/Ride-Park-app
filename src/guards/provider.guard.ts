import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

export const PROVIDER_ROLES = [
  'parking_provider',
  'driver',
  'taxi_driver',
  'admin',
] as const;

@Injectable()
export class ProviderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'] as { role?: string } | undefined;

    if (!user?.role) {
      throw new ForbiddenException('User information is missing in request');
    }

    if (!PROVIDER_ROLES.includes(user.role as (typeof PROVIDER_ROLES)[number])) {
      throw new ForbiddenException(
        'Only registered providers can access this feature',
      );
    }

    return true;
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

interface UserWithVerification {
  isVerified?: {
    identity?: boolean;
    email?: boolean;
    phone?: boolean;
  };
}

interface AuthenticatedRequest extends Request {
  user: UserWithVerification;
}

@Injectable()
export class IdentityVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: UserWithVerification = request.user;

    if (!user) {
      throw new ForbiddenException('User information is missing in request');
    }

    if (!user.isVerified?.identity) {
      throw new ForbiddenException(
        'Identity verification required. Please verify your identity (passport or UK driving license) before proceeding.',
      );
    }

    return true;
  }
}

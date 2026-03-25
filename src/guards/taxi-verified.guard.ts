import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { Taxi, TaxiDocument } from '../schemas/taxi.schema';

interface UserWithId {
  _id: {
    toString(): string;
  };
}

interface AuthenticatedRequest extends Request {
  user: UserWithId;
}

@Injectable()
export class DriverVerifiedGuard implements CanActivate {
  constructor(
    @InjectModel(Taxi.name)
    private taxiModel: Model<TaxiDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User information is missing in request');
    }

    const userId = user._id.toString();

    // Check if user has verified driver status
    const taxiVerification = await this.taxiModel.findOne({
      user: userId,
      isVerified: true,
      status: 'approved',
    });

    if (!taxiVerification) {
      throw new ForbiddenException(
        'Driver verification required. Please apply to become a driver and get approved.',
      );
    }

    return true;
  }
}

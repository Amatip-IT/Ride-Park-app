import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      this.logger.warn('No authorization header provided');
      throw new UnauthorizedException('No authorization token provided');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      this.logger.warn('Invalid authorization header format');
      throw new UnauthorizedException('Invalid authorization token format');
    }

    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token);
      this.logger.log(`Token payload: ${JSON.stringify(payload)}`);

      // Get user ID from payload - now using _id
      const userId = payload._id || payload.id || payload.sub || payload.userId;
      
      if (!userId) {
        this.logger.error(`No user ID found in token payload: ${JSON.stringify(payload)}`);
        throw new UnauthorizedException('Invalid token payload');
      }

      this.logger.log(`Looking for user with ID: ${userId}`);

      // Find user from database
      const user = await this.userModel
        .findById(userId)
        .select('-password -refreshToken')
        .lean();

      if (!user) {
        this.logger.warn(`User not found for ID: ${userId}`);
        throw new UnauthorizedException('User not found');
      }

      // Check if token version matches - using tokenVersion from payload
      if (payload.tokenVersion !== undefined && user.tokenVersion !== undefined) {
        if (payload.tokenVersion !== user.tokenVersion) {
          this.logger.warn(`Token version mismatch for user: ${user._id}`);
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      // Check account status
      if (user.accountStatus === 'banned') {
        throw new UnauthorizedException('Account has been permanently banned');
      }

      if (user.accountStatus === 'suspended') {
        const now = new Date();
        if (user.suspensionEndDate && new Date(user.suspensionEndDate) <= now) {
          await this.userModel.findByIdAndUpdate(user._id, {
            accountStatus: 'active',
            suspensionReason: undefined,
            suspensionEndDate: undefined,
          });
        } else {
          throw new UnauthorizedException('Account is temporarily suspended');
        }
      }

      // Attach user to request
      request.user = {
        _id: user._id,
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        username: user.username,
        accountStatus: user.accountStatus,
        tokenVersion: user.tokenVersion,
      };

      return true;
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`);
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired. Please refresh your token.');
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

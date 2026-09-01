import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production',
    });
  }

  async validate(payload: any) {
    const userId = payload._id || payload.id || payload.sub;
    
    if (!userId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken')
      .lean();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.accountStatus === 'banned') {
      throw new UnauthorizedException('Account has been permanently banned');
    }

    if (user.accountStatus === 'suspended') {
      const now = new Date();
      if (user.suspensionEndDate && new Date(user.suspensionEndDate) <= now) {
        // Auto-unsuspend handled by AccountStatusGuard
      } else {
        throw new UnauthorizedException('Account is temporarily suspended');
      }
    }

    return {
      _id: user._id,
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      username: user.username,
      tokenVersion: payload.tokenVersion || 0,
      accountStatus: user.accountStatus,
    };
  }
}

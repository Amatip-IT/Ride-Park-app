import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user._id) {
      return true; // Let other guards handle auth
    }

    // Fetch latest user status from DB
    const dbUser = await this.userModel.findById(user._id).exec();
    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    // Check if banned (permanent)
    if (dbUser.accountStatus === 'banned') {
      throw new ForbiddenException(
        'Your account has been permanently banned. Contact support for more information.',
      );
    }

    // Check if suspended (temporary)
    if (dbUser.accountStatus === 'suspended') {
      // Check if suspension period has ended
      if (dbUser.suspensionEndDate && new Date() > dbUser.suspensionEndDate) {
        // Auto-unsuspend
        await this.userModel.findByIdAndUpdate(user._id, {
          accountStatus: 'active',
          suspensionReason: undefined,
          suspensionEndDate: undefined,
        });
        // Update request user to reflect new status
        request.user.accountStatus = 'active';
      } else {
        const endDateStr = dbUser.suspensionEndDate
          ? dbUser.suspensionEndDate.toLocaleDateString()
          : 'indefinite';
        throw new ForbiddenException(
          `Your account is suspended until ${endDateStr}. Reason: ${dbUser.suspensionReason || 'No reason provided'}`,
        );
      }
    }

    return true;
  }
}

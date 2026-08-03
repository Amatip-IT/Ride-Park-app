import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOGIN_LOCK_DURATION_MS,
} from 'src/utility/authUtilities';
import { user_settings } from 'src/schemas/user-settings-schema';
import { EmailVerificationService } from 'src/verification/email/verification.service';
import { Response } from 'src/common/interfaces/response.interface';
import {
  isStrongPassword,
  PASSWORD_STRENGTH_MESSAGE,
} from 'src/utility/password.util';
import { CreateUserDto } from './dto/create-user.dto';

import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import {
  BookingRequest,
  BookingRequestDocument,
} from 'src/schemas/booking-request.schema';
import {
  ParkingVerification,
  ParkingVerificationDocument,
} from 'src/schemas/parking-verification.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';

interface UserWithId extends User {
  _id: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(user_settings.name)
    private userSettingsModel: Model<user_settings>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(BookingRequest.name)
    private bookingRequestModel: Model<BookingRequestDocument>,
    @InjectModel(ParkingVerification.name)
    private parkingVerificationModel: Model<ParkingVerificationDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    private emailVerificationService: EmailVerificationService,
  ) {}

  /**
   * Generate alternative username suggestions when the desired one is taken.
   */
  private async generateUsernameSuggestions(base: string): Promise<string[]> {
    const candidates: string[] = [];
    const stripped = base.replace(/\d+$/, '');

    for (let i = 0; candidates.length < 5 && i < 20; i++) {
      const suffix = Math.floor(Math.random() * 9000) + 1000;
      candidates.push(`${stripped}${suffix}`);
    }
    candidates.push(`${stripped}_x`);
    candidates.push(`the_${stripped}`);

    const taken = await this.userModel
      .find({ username: { $in: candidates } })
      .select('username')
      .lean();
    const takenSet = new Set(taken.map((u) => u.username));

    return candidates.filter((c) => !takenSet.has(c)).slice(0, 4);
  }

  /* METHOD TO CREATE A NEW USER (NON-ADMIN) */
  async createUser(createUserDTO: CreateUserDto): Promise<Response> {
    try {
      const normalizedUsername = createUserDTO.username.toLowerCase().trim();
      const normalizedEmail = createUserDTO.email.toLowerCase().trim();

      const [emailTaken, usernameTaken] = await Promise.all([
        this.userModel.findOne({ email: normalizedEmail }).lean(),
        this.userModel.findOne({ username: normalizedUsername }).lean(),
      ]);

      if (emailTaken) {
        return {
          success: false,
          message:
            'An account with this email address already exists. Please sign in or use a different email.',
        };
      }

      if (usernameTaken) {
        const suggestions =
          await this.generateUsernameSuggestions(normalizedUsername);
        return {
          success: false,
          message: `The username "${normalizedUsername}" is already taken.`,
          data: { suggestions },
        };
      }

      if (!isStrongPassword(createUserDTO.password || '')) {
        return {
          success: false,
          message: PASSWORD_STRENGTH_MESSAGE,
        };
      }

      if (!createUserDTO.termsAccepted) {
        return {
          success: false,
          message: 'You must accept the Terms & Conditions to register',
        };
      }

      const allowedRoles = [
        'user',
        'parking_provider',
        'driver',
        'taxi_driver',
      ];
      const role =
        createUserDTO.role && allowedRoles.includes(createUserDTO.role)
          ? createUserDTO.role
          : 'user';

      const providerRoles = ['parking_provider', 'driver', 'taxi_driver'];
      const isProvider = providerRoles.includes(role);

      const userData: Record<string, any> = {
        firstName: createUserDTO.firstName.trim(),
        lastName: createUserDTO.lastName.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        phoneNumber: createUserDTO.phoneNumber,
        password: createUserDTO.password,
        postCode: createUserDTO.postCode?.trim(),
        role,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      };

      if (createUserDTO.address) {
        userData.address = {
          street: createUserDTO.address.street,
          county: createUserDTO.address.county,
          town: createUserDTO.address.town,
          country: createUserDTO.address.country,
        };
      }

      if (isProvider && createUserDTO.idType) {
        userData.idType = createUserDTO.idType;
        userData.identityDocumentUrl = createUserDTO.identityDocumentUrl || '';
        userData.proofOfAddressUrl = createUserDTO.proofOfAddressUrl || '';
        userData.identityStatus = 'pending';
      }

      if (role === 'taxi_driver') {
        userData.taxiType = createUserDTO.taxiType;
      }

      const newUser = new this.userModel(userData);

      if (!newUser) {
        return {
          success: false,
          message: 'Failed to create user, please try again later',
        };
      }

      // Save the new user to the database
      await newUser.save();

      // IF Taxi Driver, auto-create their Taxi record with the vehicle info provided during registration
      if (role === 'taxi_driver') {
        await this.taxiModel.create({
          user: newUser._id,
          status: 'not_applied', // Admin will review later upon doc upload
          vehicleInfo: {
            type: createUserDTO.taxiType,
            make: createUserDTO.vehicleMake,
            model: createUserDTO.vehicleModel,
            color: createUserDTO.vehicleColor,
            plateNumber: createUserDTO.plateNumber,
          },
        });
      }

      const newUserWithoutPassword: User | null = await this.userModel
        .findById(newUser._id)
        .select('-password')
        .exec();

      if (!newUserWithoutPassword) {
        return {
          success: false,
          message: 'Failed to retrieve user after creation',
        };
      }
      return {
        success: true,
        data: newUserWithoutPassword,
        message: 'User created successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while creating the user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private clearExpiredLoginLock(user: UserDocument): void {
    if (user.lockUntil && user.lockUntil <= new Date()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }
  }

  private async registerFailedLogin(user: UserDocument): Promise<Response> {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOGIN_LOCK_DURATION_MS);
      await user.save();
      return {
        success: false,
        message:
          'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
      };
    }
    await user.save();
    return {
      success: false,
      message: 'Invalid email or password',
    };
  }

  /* METHOD TO LOGIN A USER */
  async loginUser(loginDto: {
    email: string;
    password: string;
    otp?: string;
  }): Promise<Response> {
    try {
      const normalizedEmail = loginDto.email?.toLowerCase().trim();
      const user: UserDocument | null = await this.userModel
        .findOne({
          email: normalizedEmail,
        })
        .select('+password');

      if (!user) {
        return {
          success: false,
          message: 'Invalid email or password',
        };
      }

      this.clearExpiredLoginLock(user);
      if (user.lockUntil && user.lockUntil > new Date()) {
        const minutesLeft = Math.max(
          1,
          Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000),
        );
        return {
          success: false,
          message: `Account temporarily locked due to too many failed login attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        };
      }

      // Compare provided password with stored hashed password
      const isPasswordValid: boolean = await bcrypt.compare(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        return this.registerFailedLogin(user);
      }

      // Block banned users
      if (user.accountStatus === 'banned') {
        return {
          success: false,
          message: 'This account has been permanently banned.',
        };
      }

      // Block suspended users (auto-clear if suspension expired)
      if (user.accountStatus === 'suspended') {
        if (
          user.suspensionEndDate &&
          new Date(user.suspensionEndDate) <= new Date()
        ) {
          user.accountStatus = 'active';
          user.suspensionReason = undefined;
          user.suspensionEndDate = undefined;
          await user.save();
        } else {
          const until = user.suspensionEndDate
            ? ` until ${new Date(user.suspensionEndDate).toLocaleDateString()}`
            : '';
          return {
            success: false,
            message: `This account is temporarily suspended${until}.`,
          };
        }
      }

      // Correct password — clear lockout counters before OTP step
      user.failedLoginAttempts = 0;
      user.lockUntil = null;

      // Update lastLoggedInAt to current time
      const currentTime = new Date();
      user.lastLoggedInAt = currentTime;

      // Normalize legacy usernames (e.g. Abdulmalik123 → abdulmalik123) before save
      if (typeof user.username === 'string') {
        user.username = user.username.toLowerCase().trim();
      }

      // Always require OTP for every login to enforce security
      if (!loginDto.otp) {
        await user.save();
        // Send OTP to user's email (non-blocking to avoid SMTP timeout)
        this.emailVerificationService
          .sendEmailOtp(loginDto.email, 'Login')
          .catch((err) =>
            console.error('Failed to send login OTP email:', err),
          );

        // Respond immediately — don't wait for email delivery
        return {
          success: true,
          requiresOTP: true,
          message: 'OTP has been sent to your email',
          data: { _id: user._id.toString() } as UserWithId,
        };
      }

      // If OTP is provided, verify it
      const verifyResponse = await this.emailVerificationService.verifyEmailOtp(
        loginDto.email,
        loginDto.otp,
        'Login',
      );

      if (!verifyResponse.success) {
        return verifyResponse;
      }

      // OTP verified successfully, save user (which updates lastLoggedInAt)
      await user.save();

      if (user && typeof user === 'object') {
        const tokenVersion = user.tokenVersion ?? 0;
        // Generate JWT token
        const token = generateToken({
          _id: user._id.toString(),
          role: user.role,
          tokenVersion,
        });

        // Generate and save refresh token
        const refreshToken = generateRefreshToken(
          user._id.toString(),
          tokenVersion,
        );
        user.refreshToken = refreshToken;
        await user.save();

        // Remove password and refreshToken before returning user data
        const {
          password,
          refreshToken: _,
          ...userWithoutSensitiveData
        } = user.toObject();

        return {
          success: true,
          requiresOTP: false,
          token: token,
          refreshToken: refreshToken,
          data: {
            _id: userWithoutSensitiveData._id,
            firstName: userWithoutSensitiveData.firstName,
            lastName: userWithoutSensitiveData.lastName,
            email: userWithoutSensitiveData.email,
            phoneNumber: userWithoutSensitiveData.phoneNumber,
            postCode: userWithoutSensitiveData.postCode,
            address: userWithoutSensitiveData.address,
            role: userWithoutSensitiveData.role,
            isVerified: userWithoutSensitiveData.isVerified,
          },
          message: 'Login successful',
        };
      } else {
        return {
          success: false,
          message: 'User data is not in expected format',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `An error occurred during login: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /* METHOD TO FETCH ALL USERS */
  async findAll(
    role?: string,
    firstName?: string,
    lastName?: string,
    username?: string,
  ): Promise<Response> {
    // Initialize empty filter object
    const filter: Partial<{
      role: string;
      firstName: string;
      lastName: string;
      username: string;
    }> = {};

    if (role) filter.role = role; // Add role to filter if provided
    if (firstName) filter.firstName = firstName; // Add firstName to filter if provided
    if (lastName) filter.lastName = lastName; // Add lastName to filter if provided
    if (username) filter.username = username; // Add username to filter if provided

    try {
      const users: User[] | null = await this.userModel
        .find(filter)
        .select('-password')
        .exec();

      if (!users) {
        return {
          success: false,
          message: 'No users found',
        };
      }

      //if users length is 0
      if (users.length === 0) {
        return {
          success: false,
          message: `Zero users found with ${
            filter && Object.values(filter).length
              ? `${Object.entries(filter)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(', ')}`
              : ' '
          }`,
        };
      }

      return {
        success: true,
        data: users as UserDocument[],
        message: 'Users fetched successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while fetching users: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /* METHOD TO HANDLE FORGOT PASSWORD */
  async forgotPassword(email: string): Promise<Response> {
    try {
      const normalizedEmail = email?.toLowerCase().trim();
      const user = await this.userModel.findOne({ email: normalizedEmail });
      if (!user) {
        return {
          success: true,
          message:
            'If an account exists for this email, a password reset code has been sent',
        };
      }
      const result = await this.emailVerificationService.sendEmailOtp(
        normalizedEmail,
        'password_reset',
      );
      return {
        success: true,
        message:
          result.message ||
          'If an account exists for this email, a password reset code has been sent',
      };
    } catch (error) {
      // Avoid leaking existence via error differences for unknown emails
      if (error instanceof Error && /wait \d+ seconds/i.test(error.message)) {
        return { success: false, message: error.message };
      }
      return {
        success: true,
        message:
          'If an account exists for this email, a password reset code has been sent',
      };
    }
  }

  /* METHOD TO RESET PASSWORD */
  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<Response> {
    try {
      // Validate password strength
      if (!isStrongPassword(newPassword)) {
        return {
          success: false,
          message: PASSWORD_STRENGTH_MESSAGE,
        };
      }

      const user = await this.userModel
        .findOne({ email })
        .select('+password +refreshToken');
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const verifyResponse = await this.emailVerificationService.verifyEmailOtp(
        email,
        otp,
        'password_reset',
      );
      if (!verifyResponse.success) {
        return verifyResponse;
      }

      // Set the plain-text password — the Mongoose pre-save hook will hash it once
      user.password = newPassword;
      // Invalidate all outstanding sessions
      user.refreshToken = null as any;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();

      return {
        success: true,
        message: 'Password reset successfully. You can now login.',
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to reset password',
      };
    }
  }

  /* METHOD TO REFRESH ACCESS TOKEN (rotates refresh token; reuse revokes all sessions) */
  async refreshUserToken(refreshToken: string): Promise<Response> {
    try {
      const decodedInfo = verifyRefreshToken(refreshToken);
      const user = await this.userModel
        .findById(decodedInfo.id)
        .select('+refreshToken');

      if (!user) {
        return { success: false, message: 'Invalid or revoked refresh token' };
      }

      // Reuse of an old/stolen refresh token after rotation → revoke everything
      if (!user.refreshToken || user.refreshToken !== refreshToken) {
        user.refreshToken = null as any;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save();
        return { success: false, message: 'Invalid or revoked refresh token' };
      }

      if ((decodedInfo.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        user.refreshToken = null as any;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save();
        return { success: false, message: 'Invalid or revoked refresh token' };
      }

      if (user.accountStatus === 'banned') {
        return {
          success: false,
          message: 'This account has been permanently banned.',
        };
      }

      if (user.accountStatus === 'suspended') {
        if (
          user.suspensionEndDate &&
          new Date(user.suspensionEndDate) <= new Date()
        ) {
          user.accountStatus = 'active';
          user.suspensionReason = undefined;
          user.suspensionEndDate = undefined;
          await user.save();
        } else {
          return {
            success: false,
            message: 'This account is currently suspended.',
          };
        }
      }

      const tokenVersion = user.tokenVersion ?? 0;
      const newAccessToken = generateToken({
        _id: user._id.toString(),
        role: user.role,
        tokenVersion,
      });
      const newRefreshToken = generateRefreshToken(
        user._id.toString(),
        tokenVersion,
      );
      user.refreshToken = newRefreshToken;
      await user.save();

      return {
        success: true,
        message: 'Token refreshed successfully',
        token: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      return { success: false, message: 'Invalid or expired refresh token' };
    }
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async getProfile(userId: string): Promise<Response> {
    try {
      const user = await this.userModel
        .findById(userId)
        .select('-password -refreshToken')
        .exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return {
        success: true,
        data: user,
        message: 'Profile fetched successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while fetching profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async findOneById(id: string): Promise<Response> {
    try {
      const user = await this.userModel
        .findById(id)
        .select('-password -refreshToken')
        .exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return {
        success: true,
        data: user,
        message: 'User fetched successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while fetching user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async updateById(
    id: string,
    updateUserDto: Partial<User>,
  ): Promise<Response> {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, updateUserDto, {
          new: true,
          runValidators: true,
        })
        .select('-password -refreshToken')
        .exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return {
        success: true,
        data: user,
        message: 'User updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while updating user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async remove(id: string, requestingUserId?: string): Promise<Response> {
    try {
      // Check if user exists
      const user = await this.userModel.findById(id);
      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Prevent admin self-deletion
      if (requestingUserId && id === requestingUserId) {
        return {
          success: false,
          message: 'You cannot delete your own account through this endpoint',
        };
      }

      // Protect admin accounts — ensure at least one admin remains
      if (user.role === 'admin') {
        const adminCount = await this.userModel.countDocuments({
          role: 'admin',
        });
        if (adminCount <= 1) {
          return {
            success: false,
            message: 'Cannot delete the last admin account',
          };
        }
      }

      // If user is a taxi driver, delete associated taxi record
      if (user.role === 'taxi_driver') {
        await this.taxiModel.deleteMany({ user: id });
      }

      // Cascade cleanup of related records
      await Promise.all([
        this.userSettingsModel.deleteOne({ userId: id }),
        this.walletModel.deleteMany({ user: id }),
        this.bookingRequestModel.deleteMany({ requester: id }),
        this.parkingVerificationModel.deleteMany({ user: id }),
        this.chauffeurModel.deleteMany({ user: id }),
      ]);

      // Delete the user
      await this.userModel.findByIdAndDelete(id);

      return {
        success: true,
        message: `User ${user.email} has been successfully deleted`,
        data: { deletedUserId: id, email: user.email },
      };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while deleting the user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { generateToken, generateRefreshToken, verifyRefreshToken } from 'src/utility/authUtilities';
import { user_settings } from 'src/schemas/user-settings-schema';
import { EmailVerificationService } from 'src/verification/email/verification.service';
import { Response } from 'src/common/interfaces/response.interface';
import { CreateUserDto } from './dto/create-user.dto';

import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';

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
    private emailVerificationService: EmailVerificationService,
  ) {}

  /* METHOD TO CREATE A NEW USER (NON-ADMIN) */
  async createUser(createUserDTO: CreateUserDto): Promise<Response> {
    try {
      const existingUser: User | null = await this.userModel.findOne({
        $or: [
          { email: createUserDTO.email },
          { username: createUserDTO.username },
        ],
      });

      if (existingUser) {
        return {
          success: false,
          message: 'User with the given email or username already exists',
        };
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(createUserDTO.password || '')) {
        return {
          success: false,
          message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
        };
      }

      if (!createUserDTO.termsAccepted) {
        return {
          success: false,
          message: 'You must accept the Terms & Conditions to register',
        };
      }

      const allowedRoles = ['user', 'parking_provider', 'driver', 'taxi_driver'];
      const role = createUserDTO.role && allowedRoles.includes(createUserDTO.role)
        ? createUserDTO.role
        : 'user';

      const providerRoles = ['parking_provider', 'driver', 'taxi_driver'];
      const isProvider = providerRoles.includes(role);

      const userData: Record<string, any> = {
        firstName: createUserDTO.firstName,
        lastName: createUserDTO.lastName,
        username: createUserDTO.username,
        email: createUserDTO.email,
        phoneNumber: createUserDTO.phoneNumber,
        password: createUserDTO.password,
        postCode: createUserDTO.postCode,
        role,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      };

      if (isProvider && createUserDTO.idType) {
        userData.idType = createUserDTO.idType;
        userData.identityDocumentUrl = createUserDTO.identityDocumentUrl || '';
        userData.proofOfAddressUrl = createUserDTO.proofOfAddressUrl || '';
        userData.identityStatus = 'pending';
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

  /* METHOD TO LOGIN A USER */
  async loginUser(loginDto: {
    email: string;
    password: string;
    otp?: string;
  }): Promise<Response> {
    try {
      const user: UserDocument | null = await this.userModel
        .findOne({
          email: loginDto.email,
        })
        .select('+password'); // Explicitly select password field

      if (!user) {
        return {
          success: false,
          message: 'Invalid email or password',
        };
      }

      // Compare provided password with stored hashed password
      const isPasswordValid: boolean = await bcrypt.compare(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid email or password',
        };
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
        if (user.suspensionEndDate && new Date(user.suspensionEndDate) <= new Date()) {
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

      // Update lastLoggedInAt to current time
      const currentTime = new Date();
      user.lastLoggedInAt = currentTime;

      // Always require OTP for every login to enforce security
      if (!loginDto.otp) {
        // Send OTP to user's email (non-blocking to avoid SMTP timeout)
        this.emailVerificationService.sendEmailOtp(
          loginDto.email,
          'Login',
        ).catch(err => console.error('Failed to send login OTP email:', err));

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
        // Generate JWT token
        const token = generateToken({
          _id: user._id.toString(),
          role: user.role,
        });
        
        // Generate and save refresh token
        const refreshToken = generateRefreshToken(user._id.toString());
        user.refreshToken = refreshToken;
        await user.save();

        // Remove password and refreshToken before returning user data
        const { password, refreshToken: _, ...userWithoutSensitiveData } = user.toObject();

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
      const user = await this.userModel.findOne({ email });
      if (!user) {
        return { success: false, message: 'No account found with this email' };
      }
      return await this.emailVerificationService.sendEmailOtp(email, 'password_reset');
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send password reset code',
      };
    }
  }

  /* METHOD TO RESET PASSWORD */
  async resetPassword(email: string, otp: string, newPassword: string): Promise<Response> {
    try {
      // Validate password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return {
          success: false,
          message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
        };
      }

      const user = await this.userModel.findOne({ email }).select('+password');
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const verifyResponse = await this.emailVerificationService.verifyEmailOtp(email, otp, 'password_reset');
      if (!verifyResponse.success) {
        return verifyResponse;
      }

      // Set the plain-text password — the Mongoose pre-save hook will hash it once
      user.password = newPassword;
      await user.save();

      return { success: true, message: 'Password reset successfully. You can now login.' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to reset password',
      };
    }
  }

  /* METHOD TO REFRESH ACCESS TOKEN */
  async refreshUserToken(refreshToken: string): Promise<Response> {
    try {
      const decodedInfo = verifyRefreshToken(refreshToken);
      const user = await this.userModel.findById(decodedInfo.id).select('+refreshToken');
      
      if (!user || user.refreshToken !== refreshToken) {
        return { success: false, message: 'Invalid or revoked refresh token' };
      }

      if (user.accountStatus === 'banned') {
        return { success: false, message: 'This account has been permanently banned.' };
      }

      if (user.accountStatus === 'suspended') {
        if (user.suspensionEndDate && new Date(user.suspensionEndDate) <= new Date()) {
          user.accountStatus = 'active';
          user.suspensionReason = undefined;
          user.suspensionEndDate = undefined;
          await user.save();
        } else {
          return { success: false, message: 'This account is currently suspended.' };
        }
      }

      const newAccessToken = generateToken({
        _id: user._id.toString(),
        role: user.role,
      });
      
      return { success: true, message: 'Token refreshed successfully', token: newAccessToken };
    } catch (error) {
      return { success: false, message: 'Invalid or expired refresh token' };
    }
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async getProfile(userId: string): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).select('-password -refreshToken').exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return { success: true, data: user, message: 'Profile fetched successfully' };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while fetching profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async findOneById(id: string): Promise<Response> {
    try {
      const user = await this.userModel.findById(id).select('-password -refreshToken').exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return { success: true, data: user, message: 'User fetched successfully' };
    } catch (error) {
      return {
        success: false,
        message: `An error occurred while fetching user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async updateById(id: string, updateUserDto: Partial<User>): Promise<Response> {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, updateUserDto, { new: true, runValidators: true })
        .select('-password -refreshToken')
        .exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      return { success: true, data: user, message: 'User updated successfully' };
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
        const adminCount = await this.userModel.countDocuments({ role: 'admin' });
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

      // Delete user settings if any
      await this.userSettingsModel.deleteOne({ userId: id });

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

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { generateToken, generateRefreshToken, verifyRefreshToken } from 'src/utility/authUtilities';
import { user_settings } from 'src/schemas/user-settings-schema';
import { EmailVerificationService } from 'src/verification/email/verification.service';
import { Response } from 'src/common/interfaces/response.interface';

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
  async createUser(createUserDTO: any): Promise<Response> {
    try {
      // find if user with the same email or username already exists
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

      // Validate terms acceptance
      if (!createUserDTO.termsAccepted) {
        return {
          success: false,
          message: 'You must accept the Terms & Conditions to register',
        };
      }

      // Validate role — only allow specific roles during registration
      const allowedRoles = ['user', 'parking_provider', 'driver', 'taxi_driver'];
      const role = allowedRoles.includes(createUserDTO.role) ? createUserDTO.role : 'user';

      // Build user data with identity verification for providers
      const providerRoles = ['parking_provider', 'driver', 'taxi_driver'];
      const isProvider = providerRoles.includes(role);

      const userData: any = {
        ...createUserDTO,
        role,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      };

      // Store identity verification data for providers
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

      // For user that that sets require_OTP_for_login to true and lastLoggedInAt is less than 5 minutes ago, respond with OTP required message response, send OTP
      const currentTime = new Date();
      const fiveMinutesAgo = new Date(currentTime.getTime() - 5 * 60000);
      const previousLoginTime = user.lastLoggedInAt;

      // Update lastLoggedInAt to current time
      user.lastLoggedInAt = currentTime;
      await user.save();

      //check user settings for require_OTP_for_login using the user_settings subdocument
      //find user_settings with userID equal to user._id
      const user_settings = await this.userSettingsModel.findOne({
        userID: user._id.toString(),
      });

      if (
        user_settings &&
        user_settings.require_OTP_for_login &&
        previousLoginTime &&
        previousLoginTime > fiveMinutesAgo
      ) {
        // send OTP to user's email
        await this.emailVerificationService.sendEmailOtp(
          loginDto.email,
          'Login',
        );
        // Respond with OTP required message
        return {
          success: true,
          requiresOTP: true,
          message: 'OTP verification required for login',
          data: { _id: user._id.toString() } as UserWithId,
        };
      }

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
      const user = await this.userModel.findOne({ email });
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      const verifyResponse = await this.emailVerificationService.verifyEmailOtp(email, otp, 'password_reset');
      if (!verifyResponse.success) {
        return verifyResponse;
      }

      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      user.password = hashedPassword;
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

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: User) {
    return `This action updates a #${updateUserDto.firstName} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}

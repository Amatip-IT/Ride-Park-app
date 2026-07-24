import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { User } from 'src/schemas/user.schema';
import type { UserDocument } from 'src/schemas/user.schema';
import { AdminGuard } from 'src/guards/admin.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { FileUploadService } from 'src/verification/services/file/file-upload.service';
import { RateLimit } from 'src/common/rate-limit.decorator';
import {
  EmailRequestDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  //route to login a user
  @Post('login')
  @RateLimit({ limit: 8, windowMs: 5 * 60_000 })
  async loginUser(@Body() loginDto: LoginDto) {
    const result = await this.usersService.loginUser(loginDto);
    // Check if result is an error response with success false
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  //route to create a new user(non-admin)
  @Post('register')
  @RateLimit({ limit: 5, windowMs: 60 * 60_000 })
  async createUser(@Body() createUserDto: CreateUserDto) {
    const result = await this.usersService.createUser(createUserDto);

    // Check if result is an error response with success false
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Post('forgot-password')
  @RateLimit({ limit: 5, windowMs: 15 * 60_000 })
  async forgotPassword(@Body() body: EmailRequestDto) {
    const result = await this.usersService.forgotPassword(body.email);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('reset-password')
  @RateLimit({ limit: 8, windowMs: 15 * 60_000 })
  async resetPassword(@Body() body: ResetPasswordDto) {
    const result = await this.usersService.resetPassword(
      body.email,
      body.otp,
      body.newPassword,
    );
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  // route to refresh access token
  @Post('refresh-token')
  @RateLimit({ limit: 30, windowMs: 5 * 60_000 })
  async refreshToken(@Body() body: RefreshTokenDto) {
    const result = await this.usersService.refreshUserToken(body.refreshToken);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return result;
  }

  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  findAll(
    @Query('role') role?: string,
    @Query('username') username?: string,
    @Query('firstName') firstName?: string,
    @Query('lastName') lastName?: string,
  ) {
    return this.usersService.findAll(role, firstName, lastName, username);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req: any) {
    const userId = req.user._id?.toString() || req.user.id;
    const result = await this.usersService.getProfile(userId);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.NOT_FOUND,
      );
    }
    return result;
  }

  @Get(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    const result = await this.usersService.findOneById(id);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.NOT_FOUND,
      );
    }
    return result;
  }

  /**
   * POST /users/upload-file
   * Upload a profile photo or dispute evidence file to S3
   */
  @Post('upload-file')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadFile(@Req() req: any, @UploadedFile() file: any) {
    if (!file) {
      throw new HttpException(
        { message: 'No file provided' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const userId = req.user._id || req.user.id;
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];

    if (!this.fileUploadService.validateFileType(file, allowedTypes)) {
      throw new HttpException(
        {
          message:
            'Invalid file type. Only JPEG, PNG, WEBP and PDF are allowed.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.fileUploadService.validateFileSize(file, 10)) {
      throw new HttpException(
        { message: 'File too large. Maximum size is 10MB.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const folder = `user-uploads/${userId}`;
      const url = await this.fileUploadService.uploadFile(file, folder);
      return { success: true, url, message: 'File uploaded successfully' };
    } catch (error) {
      throw new HttpException(
        {
          message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Update own profile (or save push tokens)
  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(@Req() req: any, @Body() updateData: Partial<User>) {
    const userId = req.user._id || req.user.id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (updateData.pushToken) user.pushToken = updateData.pushToken;
    if (updateData.firstName) user.firstName = updateData.firstName;
    if (updateData.lastName) user.lastName = updateData.lastName;
    if (updateData.profileImageUrl)
      user.profileImageUrl = updateData.profileImageUrl;
    if (updateData.phoneNumber) user.phoneNumber = updateData.phoneNumber;
    if (updateData.identityDocumentUrl)
      user.identityDocumentUrl = updateData.identityDocumentUrl;
    if (updateData.proofOfAddressUrl)
      user.proofOfAddressUrl = updateData.proofOfAddressUrl;

    await user.save();
    return {
      success: true,
      message: 'Profile updated successfully',
      data: user,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() updateUserDto: Partial<User>) {
    const result = await this.usersService.updateById(id, updateUserDto);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async remove(@Param('id') id: string, @Req() req: any) {
    const requestingUserId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.usersService.remove(id, requestingUserId);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }
}

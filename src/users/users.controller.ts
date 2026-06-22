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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'src/schemas/user.schema';
import type { UserDocument } from 'src/schemas/user.schema';
import { AdminGuard } from 'src/guards/admin.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  //route to login a user
  @Post('login')
  async loginUser(@Body() loginDto: { email: string; password: string; otp?: string }) {
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
  async forgotPassword(@Body() body: { email: string }) {
    const result = await this.usersService.forgotPassword(body.email);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { email: string; otp: string; newPassword: string }) {
    const result = await this.usersService.resetPassword(body.email, body.otp, body.newPassword);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // route to refresh access token
  @Post('refresh-token')
  async refreshToken(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new HttpException({ message: 'Refresh token is required' }, HttpStatus.BAD_REQUEST);
    }
    
    const result = await this.usersService.refreshUserToken(body.refreshToken);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.UNAUTHORIZED);
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
      throw new HttpException({ message: result.message }, HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    const result = await this.usersService.findOneById(id);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.NOT_FOUND);
    }
    return result;
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
    if (updateData.profileImageUrl) user.profileImageUrl = updateData.profileImageUrl;
    if (updateData.phoneNumber) user.phoneNumber = updateData.phoneNumber;
    if (updateData.identityDocumentUrl) user.identityDocumentUrl = updateData.identityDocumentUrl;
    if (updateData.proofOfAddressUrl) user.proofOfAddressUrl = updateData.proofOfAddressUrl;
    
    await user.save();
    return { success: true, message: 'Profile updated successfully', data: user };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() updateUserDto: Partial<User>) {
    const result = await this.usersService.updateById(id, updateUserDto);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async remove(@Param('id') id: string, @Req() req: any) {
    const requestingUserId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.usersService.remove(id, requestingUserId);
    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}

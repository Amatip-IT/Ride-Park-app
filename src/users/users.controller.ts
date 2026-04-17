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
import type { UserDocument } from 'src/schemas/user.schema'; // Import UserDocument type
import { AdminGuard } from 'src/guards/admin.guard';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  //route to login a user
  @Post('login')
  async loginUser(@Body() loginDto: { email: string; password: string }) {
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
  async createUser(@Body() createUserDto: any) {
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
    return this.usersService.findAll(role, username, firstName, lastName);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
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
    
    // Quick update logic to support generic patching without full DTO override
    if (updateData.pushToken) user.pushToken = updateData.pushToken;
    if (updateData.firstName) user.firstName = updateData.firstName;
    if (updateData.lastName) user.lastName = updateData.lastName;
    if (updateData.profileImageUrl) user.profileImageUrl = updateData.profileImageUrl;
    if (updateData.phoneNumber) user.phoneNumber = updateData.phoneNumber;
    
    await user.save();
    return { success: true, message: 'Profile updated successfully', data: user };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: User) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}

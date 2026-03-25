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

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: User) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}

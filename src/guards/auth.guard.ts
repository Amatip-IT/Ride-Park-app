import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User, UserDocument } from 'src/schemas/user.schema';
dotenv.config();

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {} // Inject User model

  //method to check if the request is authorized by a user that has a valid token and can activate the route
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    // Check if Authorization header exists
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer')) {
      throw new UnauthorizedException(
        'Authorization header is missing or invalid',
      );
    }

    // Extract token from "Bearer <token>"
    const token: string | undefined = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    //get secret key from environment variables
    if (!process.env.JWT_SECRET) {
      throw new UnauthorizedException('JWT_SECRET is not defined');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET); //verify token with the secret jwt key

      // if the verification is successful, fetch the user from database
      if (decoded && typeof decoded['id'] === 'string') {
        const user = await this.userModel.findById(decoded['id']).exec();

        if (!user) {
          throw new UnauthorizedException('User not found');
        }

        // Attach user to request object for further use
        request['user'] = user;
      } else {
        throw new UnauthorizedException(
          'Not authorized, authorization failed, please login again',
        );
      }
    } catch (error) {
      console.error('Token verification error:', error);
      throw new UnauthorizedException('Not authorized, authorization failed');
    }

    return true;
  }
}

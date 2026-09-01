import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { User, UserSchema } from 'src/schemas/user.schema';
import { AuthGuard } from './auth.guard';
import { JwtStrategy } from './jwt.strategy';

const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: jwtExpiresIn as any },
    }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [AuthGuard, JwtStrategy],
  exports: [AuthGuard, JwtStrategy, JwtModule, MongooseModule],
})
export class AuthModule {}

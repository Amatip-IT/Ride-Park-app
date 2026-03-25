import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendEmailOtpDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateIdentitySessionDto {
  @IsNotEmpty({ message: 'Return URL is required' })
  @IsString()
  @Matches(/^https?:\/\/.+/, {
    message: 'Return URL must be a valid URL starting with http:// or https://',
  })
  returnUrl: string;
}

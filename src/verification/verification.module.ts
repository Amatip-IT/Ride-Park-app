import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { EmailVerificationController } from './email/verification.controller';
import { EmailVerificationService } from './email/verification.service';

import { PhoneVerificationController } from './phone/verification.controller';
import { PhoneVerificationService } from './phone/verification.service';

import { IdentityVerificationController } from './identity/verification.controller';
import { IdentityVerificationService } from './identity/verification.service';

import { TaxiVerificationController } from './taxi/verification.controller';
import { TaxiVerificationService } from './taxi/verification.service';

import { EmailService } from './services/email/email.service';
import { TwilioService } from './services/phone/twilio.service';
import { StripeIdentityService } from './services/identity/stripe-identity.service';
import { DvlaService } from './services/driver/dvla.service';
import { MotService } from './services/driver/mot.service';
import { FileUploadService } from './services/file/file-upload.service';

import { User, UserSchema } from '../schemas/user.schema';
import {
  IdentityVerification,
  IdentityVerificationSchema,
} from '../schemas/identity-verification.schema';
import { Taxi, TaxiSchema } from '../schemas/taxi.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: IdentityVerification.name, schema: IdentityVerificationSchema },
      { name: Taxi.name, schema: TaxiSchema },
    ]),
  ],
  controllers: [
    EmailVerificationController,
    PhoneVerificationController,
    IdentityVerificationController,
    TaxiVerificationController,
  ],
  providers: [
    EmailVerificationService,
    PhoneVerificationService,
    IdentityVerificationService,
    TaxiVerificationService,
    EmailService,
    TwilioService,
    StripeIdentityService,
    DvlaService,
    MotService,
    FileUploadService,
  ],
  exports: [
    EmailVerificationService,
    PhoneVerificationService,
    IdentityVerificationService,
    TaxiVerificationService,
    EmailService,
    TwilioService,
    StripeIdentityService,
    DvlaService,
    MotService,
    FileUploadService,
  ],
})
export class VerificationModule {}

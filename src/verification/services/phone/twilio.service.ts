import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class TwilioService {
  private client: Twilio;
  private twilioPhoneNumber: string;

  constructor(private configService: ConfigService) {
    this.initializeTwilioClient();
  }

  /**
   * Initialize Twilio client
   */
  private initializeTwilioClient(): void {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = this.configService.get<string>(
      'TWILIO_PHONE_NUMBER',
    );

    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.warn(
        'Twilio credentials not configured. SMS verification will not work. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env',
      );
      return;
    }

    this.twilioPhoneNumber = twilioPhoneNumber;
    this.client = new Twilio(accountSid, authToken);
    console.log('Twilio service ready to send SMS');
  }

  /**
   * Send OTP SMS for phone verification
   * @param phoneNumber - Recipient phone number (international format)
   * @param otp - 6-digit OTP code
   * @returns Promise<boolean> - Success status
   */
  async sendOtpSms(phoneNumber: string, otp: string): Promise<boolean> {
    try {
      const message = await this.client.messages.create({
        body: `Your Ride and Park verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nNever share this code with anyone.`,
        from: this.twilioPhoneNumber,
        to: phoneNumber,
      });

      console.log(`SMS sent to ${phoneNumber}: ${message.sid}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${phoneNumber}:`, error);
      throw new InternalServerErrorException(
        'Failed to send verification SMS. Please try again later.',
      );
    }
  }

  /**
   * Send welcome SMS after successful verification
   * @param phoneNumber - Recipient phone number
   * @param firstName - User's first name
   * @returns Promise<boolean> - Success status
   */
  async sendWelcomeSms(
    phoneNumber: string,
    firstName: string,
  ): Promise<boolean> {
    try {
      const message = await this.client.messages.create({
        body: `Welcome to Ride and Park, ${firstName}! 🎉\n\nYour phone number has been verified. You're all set to start using our platform.\n\nHappy riding!`,
        from: this.twilioPhoneNumber,
        to: phoneNumber,
      });

      console.log(`Welcome SMS sent to ${phoneNumber}: ${message.sid}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send welcome SMS to ${phoneNumber}:`, error);
      // Don't throw error for welcome SMS - it's not critical
      return false;
    }
  }
}

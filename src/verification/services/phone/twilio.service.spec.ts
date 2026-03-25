import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { Twilio } from 'twilio';

interface MessageCreateParams {
  to: string;
  from: string;
  body: string;
}

describe('TwilioService', () => {
  let service: TwilioService;
  let mockCreate: jest.Mock<
    Promise<{ sid: string; status: string }>,
    [MessageCreateParams]
  >;

  const mockConfigService: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        TWILIO_AUTH_TOKEN: 'mock_auth_token_12345678901234567890',
        TWILIO_PHONE_NUMBER: '+1234567890',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    mockCreate = jest
      .fn<Promise<{ sid: string; status: string }>, [MessageCreateParams]>()
      .mockResolvedValue({
        sid: 'mock-message-sid',
        status: 'sent',
      });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TwilioService>(TwilioService);

    // Mock Twilio client with proper typing
    service['client'] = {
      messages: {
        create: mockCreate,
      },
    } as unknown as Twilio;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should throw error if Twilio credentials are missing', () => {
      const invalidConfigService: Partial<ConfigService> = {
        get: jest.fn(() => undefined),
      };

      expect(
        () => new TwilioService(invalidConfigService as ConfigService),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('sendOtpSms', () => {
    it('should send OTP SMS successfully', async () => {
      const phoneNumber = '+1234567890';
      const otp = '123456';

      const result = await service.sendOtpSms(phoneNumber, otp);

      expect(result).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining<Partial<MessageCreateParams>>({
          to: phoneNumber,
          from: '+1234567890',
          body: expect.stringContaining(otp) as string,
        }),
      );
    });

    it('should include security message in SMS', async () => {
      const phoneNumber = '+1234567890';
      const otp = '654321';

      await service.sendOtpSms(phoneNumber, otp);

      const callArgs = mockCreate.mock.calls[0]?.[0] as
        | MessageCreateParams
        | undefined;
      expect(callArgs?.body).toContain('Your Ride and Park verification code');
      expect(callArgs?.body).toContain('expires in 10 minutes');
      expect(callArgs?.body).toContain('Never share this code');
    });

    it('should throw error if SMS sending fails', async () => {
      const phoneNumber = '+1234567890';
      const otp = '123456';

      mockCreate.mockRejectedValueOnce(new Error('Twilio API error'));

      await expect(service.sendOtpSms(phoneNumber, otp)).rejects.toThrow(
        InternalServerErrorException,
      );

      // Reset mock for second assertion
      mockCreate.mockRejectedValueOnce(new Error('Twilio API error'));

      await expect(service.sendOtpSms(phoneNumber, otp)).rejects.toThrow(
        'Failed to send verification SMS. Please try again later.',
      );
    });
  });

  describe('sendWelcomeSms', () => {
    it('should send welcome SMS successfully', async () => {
      const phoneNumber = '+1234567890';
      const firstName = 'John';

      const result = await service.sendWelcomeSms(phoneNumber, firstName);

      expect(result).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining<Partial<MessageCreateParams>>({
          to: phoneNumber,
          from: '+1234567890',
          body: expect.stringContaining(firstName) as string,
        }),
      );
    });

    it('should include personalized greeting', async () => {
      const phoneNumber = '+1234567890';
      const firstName = 'Jane';

      await service.sendWelcomeSms(phoneNumber, firstName);

      const callArgs = mockCreate.mock.calls[0]?.[0] as
        | MessageCreateParams
        | undefined;
      expect(callArgs?.body).toContain(
        `Welcome to Ride and Park, ${firstName}`,
      );
      expect(callArgs?.body).toContain('verified');
    });

    it('should return false if welcome SMS fails (non-critical)', async () => {
      const phoneNumber = '+1234567890';
      const firstName = 'John';

      mockCreate.mockRejectedValueOnce(new Error('Twilio API error'));

      const result = await service.sendWelcomeSms(phoneNumber, firstName);

      expect(result).toBe(false);
      // Should NOT throw error
    });
  });
});

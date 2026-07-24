import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { EmailService } from './email.service';
import { Transporter } from 'nodemailer';

describe('EmailService', () => {
  let service: EmailService;
  let mockSendMail: jest.Mock;

  const mockConfigService: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'admin@example.com',
        SMTP_PASSWORD: 'mockpassword',
      };
      return config[key];
    }),
  };

  const mockTransporter: Partial<Transporter> = {
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'mock-message-id',
      accepted: ['test@example.com'],
    }),
    verify: jest
      .fn()
      .mockImplementation(
        (
          cb?: (err: Error | null, success: true) => void,
        ): void | Promise<true> => {
          if (cb) {
            cb(null, true);
            return undefined as any;
          }
          return Promise.resolve(true);
        },
      ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);

    // fully mock transporter
    service['transporter'] = mockTransporter as Transporter;
    mockSendMail = mockTransporter.sendMail as jest.Mock;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should warn and skip transporter when SMTP is not configured', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const invalidConfigService: Partial<ConfigService> = {
        get: jest.fn(() => undefined),
      };
      const instance = new EmailService(invalidConfigService as ConfigService);
      expect(instance['transporter']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('sendOtpEmail', () => {
    it('should send OTP email successfully', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      const result = await service.sendOtpEmail(email, otp);
      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: 'Email Verification - Gleezip',
        }),
      );
    });

    it('should throw error if email sending fails', async () => {
      const email = 'fail@example.com';
      const otp = '654321';
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      await expect(service.sendOtpEmail(email, otp)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email successfully', async () => {
      const email = 'test@example.com';
      const firstName = 'John';

      const result = await service.sendWelcomeEmail(email, firstName);
      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: 'Welcome to Gleezip! 🎉',
        }),
      );
    });

    it('should return false if welcome email fails', async () => {
      const email = 'fail@example.com';
      const firstName = 'John';
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      const result = await service.sendWelcomeEmail(email, firstName);
      expect(result).toBe(false);
    });
  });

  describe('sendTemplateEmail', () => {
    it('should send generic template email successfully', async () => {
      const email = 'test@example.com';
      const subject = 'Custom Subject';
      const templateName = 'welcome';
      const data = { customField: 'value' };

      const result = await service.sendTemplateEmail(
        email,
        subject,
        templateName,
        data,
      );
      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: email, subject }),
      );
    });

    it('should throw error if template sending fails', async () => {
      const email = 'fail@example.com';
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      await expect(
        service.sendTemplateEmail(email, 'Subject', 'welcome', {}),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('compileTemplate', () => {
    it('should throw error if template file not found', () => {
      expect(() => service['compileTemplate']('non-existent', {})).toThrow(
        InternalServerErrorException,
      );
    });
  });
});

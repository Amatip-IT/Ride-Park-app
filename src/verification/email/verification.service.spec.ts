import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailVerificationService } from './verification.service';
import { EmailService } from '../services/email/email.service';
import { User } from '../../schemas/user.schema';
import { OtpStorage } from '../../schemas/otp.schema';
import { VerifiedStatus } from '../../schemas/verified-status.schema';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  // Helper function to create a fresh user object
  const createMockUser = (
    overrides: Partial<{
      _id: string;
      firstName: string;
      lastName: string;
      username: string;
      email: string;
      phoneNumber: string;
      password: string;
      role: string;
      isVerified: VerifiedStatus;
      otpStorage: OtpStorage | null;
      save: jest.Mock;
    }> = {},
  ) => ({
    _id: '507f1f77bcf86cd799439011',
    firstName: 'John',
    lastName: 'Smith',
    username: 'johnsmith',
    email: 'john@example.com',
    phoneNumber: '+1234567890',
    password: 'hashedPassword',
    role: 'user',
    isVerified: {
      email: false,
      phone: false,
      identity: false,
    } as VerifiedStatus,
    otpStorage: null as OtpStorage | null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  // Mock EmailService with proper typing
  const mockEmailService = {
    sendOtpEmail: jest
      .fn<Promise<boolean>, [string, string]>()
      .mockResolvedValue(true),
    sendWelcomeEmail: jest
      .fn<Promise<boolean>, [string, string?]>()
      .mockResolvedValue(true),
  };

  // Mock UserModel
  const mockUserModel = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // SEND EMAIL OTP
  describe('sendEmailOtp', () => {
    it('should send OTP successfully to unverified user', async () => {
      const email = 'john@example.com';
      const user = createMockUser();

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.sendEmailOtp(email);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP sent successfully to your email');
      expect(result.expiresIn).toBe('10 minutes');
      expect(mockEmailService.sendOtpEmail).toHaveBeenCalled();
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(service.sendEmailOtp('x@x.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when email already verified', async () => {
      const user = createMockUser({
        isVerified: { email: true, phone: false, identity: false },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(service.sendEmailOtp(user.email)).rejects.toThrow(
        'Email is already verified',
      );
    });

    it('should enforce 1-minute rate-limit', async () => {
      const user = createMockUser({
        otpStorage: {
          emailOtp: {
            code: '123456',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // OTP sent <1min ago
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(service.sendEmailOtp(user.email)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate a valid 6-digit OTP', async () => {
      const user = createMockUser();

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await service.sendEmailOtp(user.email);

      const otpSent = mockEmailService.sendOtpEmail.mock.calls[0][1];

      expect(otpSent).toMatch(/^\d{6}$/);
    });
  });

  // VERIFY EMAIL OTP
  describe('verifyEmailOtp', () => {
    it('should verify OTP and mark email as verified', async () => {
      const otp = '123456';

      const user = createMockUser({
        otpStorage: {
          emailOtp: {
            code: otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.verifyEmailOtp(user.email, otp);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
      expect(user.isVerified.email).toBe(true);
      expect(user.otpStorage?.emailOtp).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(service.verifyEmailOtp('x@x.com', '111111')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw when email already verified', async () => {
      const user = createMockUser({
        isVerified: { email: true, phone: false, identity: false },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyEmailOtp(user.email, '123456'),
      ).rejects.toThrow('Email is already verified');
    });

    it('should throw when OTP does not exist', async () => {
      const user = createMockUser({ otpStorage: null });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyEmailOtp(user.email, '123456'),
      ).rejects.toThrow('No OTP found. Please request a new OTP');
    });

    it('should throw when OTP is expired', async () => {
      const user = createMockUser({
        otpStorage: {
          emailOtp: {
            code: '123456',
            expiresAt: new Date(Date.now() - 1 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyEmailOtp(user.email, '123456'),
      ).rejects.toThrow('OTP has expired. Please request a new one');

      expect(user.save).toHaveBeenCalled();
    });

    it('should throw when OTP is incorrect', async () => {
      const user = createMockUser({
        otpStorage: {
          emailOtp: {
            code: '222222',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyEmailOtp(user.email, '123456'),
      ).rejects.toThrow('Invalid OTP. Please check and try again');
    });

    it('should send welcome email after successful verification', async () => {
      const otp = '123456';

      const user = createMockUser({
        otpStorage: {
          emailOtp: {
            code: otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await service.verifyEmailOtp(user.email, otp);
      await new Promise((res) => setTimeout(res, 100));

      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        user.email,
        user.firstName,
      );
    });
  });

  // CHECK STATUS
  describe('checkEmailVerificationStatus', () => {
    it('should return verified status', async () => {
      const user = createMockUser({
        email: 'verified@example.com',
        isVerified: { email: true, phone: false, identity: false },
      });

      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.checkEmailVerificationStatus(user.email);

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(true);
      expect(result.email).toBe(user.email);
    });

    it('should return unverified status', async () => {
      const user = createMockUser();

      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.checkEmailVerificationStatus(user.email);

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(false);
      expect(result.email).toBe(user.email);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.checkEmailVerificationStatus('none@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

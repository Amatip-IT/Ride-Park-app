import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhoneVerificationService } from './verification.service';
import { TwilioService } from '../services/phone/twilio.service';
import { User } from '../../schemas/user.schema';
import { OtpStorage } from '../../schemas/otp.schema';
import { VerifiedStatus } from '../../schemas/verified-status.schema';

describe('PhoneVerificationService', () => {
  let service: PhoneVerificationService;

  // Helper function to create a fresh user object
  const createMockUser = (
    overrides: Partial<{
      _id: string;
      firstName: string;
      phoneNumber: string;
      isVerified: VerifiedStatus;
      otpStorage: OtpStorage | null;
      save: jest.Mock;
    }> = {},
  ) => ({
    _id: '507f1f77bcf86cd799439011',
    firstName: 'John',
    phoneNumber: '+1234567890',
    isVerified: {
      email: false,
      phone: false,
      identity: false,
    } as VerifiedStatus,
    otpStorage: null as OtpStorage | null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  // Mock TwilioService
  const mockTwilioService = {
    sendOtpSms: jest
      .fn<Promise<boolean>, [string, string]>()
      .mockResolvedValue(true),
    sendWelcomeSms: jest
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
        PhoneVerificationService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: TwilioService, useValue: mockTwilioService },
      ],
    }).compile();

    service = module.get<PhoneVerificationService>(PhoneVerificationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // SEND PHONE OTP
  describe('sendPhoneOtp', () => {
    it('should send OTP successfully to unverified user', async () => {
      const phoneNumber = '+1234567890';
      const user = createMockUser();

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.sendPhoneOtp(phoneNumber);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP sent successfully to your phone');
      expect(result.expiresIn).toBe('10 minutes');
      expect(mockTwilioService.sendOtpSms).toHaveBeenCalled();
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(service.sendPhoneOtp('+9999999999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when phone already verified', async () => {
      const user = createMockUser({
        isVerified: { email: false, phone: true, identity: false },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(service.sendPhoneOtp(user.phoneNumber)).rejects.toThrow(
        'Phone number is already verified',
      );
    });

    it('should enforce 1-minute rate-limit', async () => {
      const user = createMockUser({
        otpStorage: {
          phoneOtp: {
            code: '123456',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(service.sendPhoneOtp(user.phoneNumber)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate a valid 6-digit OTP', async () => {
      const user = createMockUser();

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await service.sendPhoneOtp(user.phoneNumber);

      const otpSent = mockTwilioService.sendOtpSms.mock.calls[0][1];
      expect(otpSent).toMatch(/^\d{6}$/);
    });
  });

  // VERIFY PHONE OTP
  describe('verifyPhoneOtp', () => {
    it('should verify OTP and mark phone as verified', async () => {
      const otp = '123456';
      const user = createMockUser({
        otpStorage: {
          phoneOtp: {
            code: otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.verifyPhoneOtp(user.phoneNumber, otp);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Phone number verified successfully');
      expect(user.isVerified.phone).toBe(true);
      expect(user.otpStorage?.phoneOtp).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.verifyPhoneOtp('+9999999999', '111111'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when phone already verified', async () => {
      const user = createMockUser({
        isVerified: { email: false, phone: true, identity: false },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyPhoneOtp(user.phoneNumber, '123456'),
      ).rejects.toThrow('Phone number is already verified');
    });

    it('should throw when OTP does not exist', async () => {
      const user = createMockUser({ otpStorage: null });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyPhoneOtp(user.phoneNumber, '123456'),
      ).rejects.toThrow('No OTP found. Please request a new OTP');
    });

    it('should throw when OTP is expired', async () => {
      const user = createMockUser({
        otpStorage: {
          phoneOtp: {
            code: '123456',
            expiresAt: new Date(Date.now() - 1 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyPhoneOtp(user.phoneNumber, '123456'),
      ).rejects.toThrow('OTP has expired. Please request a new one');

      expect(user.save).toHaveBeenCalled();
    });

    it('should throw when OTP is incorrect', async () => {
      const user = createMockUser({
        otpStorage: {
          phoneOtp: {
            code: '222222',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await expect(
        service.verifyPhoneOtp(user.phoneNumber, '123456'),
      ).rejects.toThrow('Invalid OTP. Please check and try again');
    });

    it('should send welcome SMS after successful verification', async () => {
      const otp = '123456';
      const user = createMockUser({
        otpStorage: {
          phoneOtp: {
            code: otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        },
      });

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      await service.verifyPhoneOtp(user.phoneNumber, otp);
      await new Promise((res) => setTimeout(res, 100));

      expect(mockTwilioService.sendWelcomeSms).toHaveBeenCalledWith(
        user.phoneNumber,
        user.firstName,
      );
    });
  });

  // CHECK STATUS
  describe('checkPhoneVerificationStatus', () => {
    it('should return verified status', async () => {
      const user = createMockUser({
        phoneNumber: '+1234567890',
        isVerified: { email: false, phone: true, identity: false },
      });

      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.checkPhoneVerificationStatus(
        user.phoneNumber,
      );

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(true);
      expect(result.phoneNumber).toBe(user.phoneNumber);
    });

    it('should return unverified status', async () => {
      const user = createMockUser();

      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.checkPhoneVerificationStatus(
        user.phoneNumber,
      );

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(false);
      expect(result.phoneNumber).toBe(user.phoneNumber);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.checkPhoneVerificationStatus('+9999999999'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

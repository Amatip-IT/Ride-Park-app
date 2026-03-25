import { Test, TestingModule } from '@nestjs/testing';
import { EmailVerificationController } from './verification.controller';
import { EmailVerificationService } from './verification.service';
import { SendEmailOtpDto } from '../dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from '../dto/verify-email-otp.dto';

describe('EmailVerificationController', () => {
  let controller: EmailVerificationController;

  // Use a single mock object
  const mockEmailVerificationService = {
    sendEmailOtp: jest.fn(),
    verifyEmailOtp: jest.fn(),
    checkEmailVerificationStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailVerificationController],
      providers: [
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
      ],
    }).compile();

    controller = module.get<EmailVerificationController>(
      EmailVerificationController,
    );

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendEmailOtp', () => {
    it('should send OTP successfully', async () => {
      const dto: SendEmailOtpDto = { email: 'john@example.com' };
      const expectedResult = {
        success: true,
        message: 'OTP sent successfully to your email',
        expiresIn: '10 minutes',
      };

      mockEmailVerificationService.sendEmailOtp.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.sendEmailOtp(dto);

      expect(result).toEqual(expectedResult);
      // Always reference the mock object, not the service instance
      expect(mockEmailVerificationService.sendEmailOtp).toHaveBeenCalledWith(
        dto.email,
      );
      expect(mockEmailVerificationService.sendEmailOtp).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should handle errors from service', async () => {
      const dto: SendEmailOtpDto = { email: 'john@example.com' };
      const error = new Error('User not found with this email');

      mockEmailVerificationService.sendEmailOtp.mockRejectedValue(error);

      await expect(controller.sendEmailOtp(dto)).rejects.toThrow(error);
      expect(mockEmailVerificationService.sendEmailOtp).toHaveBeenCalledWith(
        dto.email,
      );
    });
  });

  describe('verifyEmailOtp', () => {
    it('should verify OTP successfully', async () => {
      const dto: VerifyEmailOtpDto = {
        email: 'john@example.com',
        otp: '123456',
      };
      const expectedResult = {
        success: true,
        message: 'Email verified successfully',
        isVerified: true,
      };

      mockEmailVerificationService.verifyEmailOtp.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.verifyEmailOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockEmailVerificationService.verifyEmailOtp).toHaveBeenCalledWith(
        dto.email,
        dto.otp,
      );
      expect(mockEmailVerificationService.verifyEmailOtp).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should handle invalid OTP', async () => {
      const dto: VerifyEmailOtpDto = {
        email: 'john@example.com',
        otp: '999999',
      };
      const error = new Error('Invalid OTP. Please check and try again');

      mockEmailVerificationService.verifyEmailOtp.mockRejectedValue(error);

      await expect(controller.verifyEmailOtp(dto)).rejects.toThrow(error);
      expect(mockEmailVerificationService.verifyEmailOtp).toHaveBeenCalledWith(
        dto.email,
        dto.otp,
      );
    });
  });

  describe('checkEmailStatus', () => {
    it('should return email verification status for verified user', async () => {
      const email = 'verified@example.com';
      const expectedResult = { success: true, isVerified: true, email };

      mockEmailVerificationService.checkEmailVerificationStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkEmailStatus(email);

      expect(result).toEqual(expectedResult);
      expect(
        mockEmailVerificationService.checkEmailVerificationStatus,
      ).toHaveBeenCalledWith(email);
      expect(
        mockEmailVerificationService.checkEmailVerificationStatus,
      ).toHaveBeenCalledTimes(1);
    });

    it('should return email verification status for unverified user', async () => {
      const email = 'john@example.com';
      const expectedResult = { success: true, isVerified: false, email };

      mockEmailVerificationService.checkEmailVerificationStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkEmailStatus(email);

      expect(result).toEqual(expectedResult);
      expect(
        mockEmailVerificationService.checkEmailVerificationStatus,
      ).toHaveBeenCalledWith(email);
    });

    it('should handle user not found', async () => {
      const email = 'notfound@example.com';
      const error = new Error('User not found with this email');

      mockEmailVerificationService.checkEmailVerificationStatus.mockRejectedValue(
        error,
      );

      await expect(controller.checkEmailStatus(email)).rejects.toThrow(error);
      expect(
        mockEmailVerificationService.checkEmailVerificationStatus,
      ).toHaveBeenCalledWith(email);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PhoneVerificationController } from './verification.controller';
import { PhoneVerificationService } from './verification.service';
import { SendPhoneOtpDto } from '../dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from '../dto/verify-phone-otp.dto';

describe('PhoneVerificationController', () => {
  let controller: PhoneVerificationController;

  const mockPhoneVerificationService = {
    sendPhoneOtp: jest.fn(),
    verifyPhoneOtp: jest.fn(),
    checkPhoneVerificationStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PhoneVerificationController],
      providers: [
        {
          provide: PhoneVerificationService,
          useValue: mockPhoneVerificationService,
        },
      ],
    }).compile();

    controller = module.get<PhoneVerificationController>(
      PhoneVerificationController,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendPhoneOtp', () => {
    it('should send OTP successfully', async () => {
      const dto: SendPhoneOtpDto = { phoneNumber: '+1234567890' };
      const expectedResult = {
        success: true,
        message: 'OTP sent successfully to your phone',
        expiresIn: '10 minutes',
      };

      mockPhoneVerificationService.sendPhoneOtp.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.sendPhoneOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockPhoneVerificationService.sendPhoneOtp).toHaveBeenCalledWith(
        dto.phoneNumber,
      );
      expect(mockPhoneVerificationService.sendPhoneOtp).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should handle errors from service', async () => {
      const dto: SendPhoneOtpDto = { phoneNumber: '+1234567890' };
      const error = new Error('User not found with this phone number');

      mockPhoneVerificationService.sendPhoneOtp.mockRejectedValue(error);

      await expect(controller.sendPhoneOtp(dto)).rejects.toThrow(error);
      expect(mockPhoneVerificationService.sendPhoneOtp).toHaveBeenCalledWith(
        dto.phoneNumber,
      );
    });
  });

  describe('verifyPhoneOtp', () => {
    it('should verify OTP successfully', async () => {
      const dto: VerifyPhoneOtpDto = {
        phoneNumber: '+1234567890',
        otp: '123456',
      };
      const expectedResult = {
        success: true,
        message: 'Phone number verified successfully',
        isVerified: true,
      };

      mockPhoneVerificationService.verifyPhoneOtp.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.verifyPhoneOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockPhoneVerificationService.verifyPhoneOtp).toHaveBeenCalledWith(
        dto.phoneNumber,
        dto.otp,
      );
      expect(mockPhoneVerificationService.verifyPhoneOtp).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should handle invalid OTP', async () => {
      const dto: VerifyPhoneOtpDto = {
        phoneNumber: '+1234567890',
        otp: '999999',
      };
      const error = new Error('Invalid OTP. Please check and try again');

      mockPhoneVerificationService.verifyPhoneOtp.mockRejectedValue(error);

      await expect(controller.verifyPhoneOtp(dto)).rejects.toThrow(error);
      expect(mockPhoneVerificationService.verifyPhoneOtp).toHaveBeenCalledWith(
        dto.phoneNumber,
        dto.otp,
      );
    });
  });

  describe('checkPhoneStatus', () => {
    it('should return phone verification status for verified user', async () => {
      const phoneNumber = '+1234567890';
      const expectedResult = {
        success: true,
        isVerified: true,
        phoneNumber,
      };

      mockPhoneVerificationService.checkPhoneVerificationStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkPhoneStatus(phoneNumber);

      expect(result).toEqual(expectedResult);
      expect(
        mockPhoneVerificationService.checkPhoneVerificationStatus,
      ).toHaveBeenCalledWith(phoneNumber);
      expect(
        mockPhoneVerificationService.checkPhoneVerificationStatus,
      ).toHaveBeenCalledTimes(1);
    });

    it('should return phone verification status for unverified user', async () => {
      const phoneNumber = '+1234567890';
      const expectedResult = {
        success: true,
        isVerified: false,
        phoneNumber,
      };

      mockPhoneVerificationService.checkPhoneVerificationStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkPhoneStatus(phoneNumber);

      expect(result).toEqual(expectedResult);
      expect(
        mockPhoneVerificationService.checkPhoneVerificationStatus,
      ).toHaveBeenCalledWith(phoneNumber);
    });

    it('should handle user not found', async () => {
      const phoneNumber = '+9999999999';
      const error = new Error('User not found with this phone number');

      mockPhoneVerificationService.checkPhoneVerificationStatus.mockRejectedValue(
        error,
      );

      await expect(controller.checkPhoneStatus(phoneNumber)).rejects.toThrow(
        error,
      );
      expect(
        mockPhoneVerificationService.checkPhoneVerificationStatus,
      ).toHaveBeenCalledWith(phoneNumber);
    });
  });
});

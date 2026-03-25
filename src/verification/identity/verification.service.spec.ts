import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { IdentityVerificationService } from './verification.service';
import { StripeIdentityService } from '../services/identity/stripe-identity.service';
import { User } from '../../schemas/user.schema';
import { IdentityVerification } from '../../schemas/identity-verification.schema';
import { VerifiedStatus } from '../../schemas/verified-status.schema';

describe('IdentityVerificationService', () => {
  let service: IdentityVerificationService;

  const createMockUser = (
    overrides: Partial<{
      _id: string;
      firstName: string;
      isVerified: VerifiedStatus;
      save: jest.Mock;
    }> = {},
  ) => ({
    _id: '507f1f77bcf86cd799439011',
    firstName: 'John',
    isVerified: {
      email: false,
      phone: false,
      identity: false,
    } as VerifiedStatus,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  const mockStripeIdentityService = {
    createVerificationSession: jest.fn().mockResolvedValue({
      sessionId: 'vs_test_123',
      url: 'https://verify.stripe.com/start/test_123',
      clientSecret: 'vs_test_secret_123',
    }),
    getVerificationSession: jest.fn().mockResolvedValue({
      id: 'vs_test_123',
      status: 'verified',
      verified: true,
      idType: 'driving_license' as const,
      firstName: 'John',
      lastName: 'Smith',
      dateOfBirth: '1990-05-15',
      licenseNumber: 'SMITH905156JD9XX',
    }),
  };

  const mockUserModel = {
    findById: jest.fn(),
  };

  const mockIdentityVerificationModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityVerificationService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        {
          provide: getModelToken(IdentityVerification.name),
          useValue: mockIdentityVerificationModel,
        },
        { provide: StripeIdentityService, useValue: mockStripeIdentityService },
      ],
    }).compile();

    service = module.get<IdentityVerificationService>(
      IdentityVerificationService,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createVerificationSession', () => {
    it('should create verification session successfully', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const returnUrl = 'https://app.example.com/verification/complete';
      const user = createMockUser();

      mockUserModel.findById.mockResolvedValue(user);
      mockIdentityVerificationModel.findOneAndUpdate.mockResolvedValue({});

      const result = await service.createVerificationSession(userId, returnUrl);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('vs_test_123');
      expect(result.url).toContain('stripe.com');
      expect(
        mockStripeIdentityService.createVerificationSession,
      ).toHaveBeenCalledWith(userId, returnUrl);
      expect(mockIdentityVerificationModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.createVerificationSession('invalid_id', 'https://example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already verified', async () => {
      const user = createMockUser({
        isVerified: { email: false, phone: false, identity: true },
      });
      mockUserModel.findById.mockResolvedValue(user);

      await expect(
        service.createVerificationSession('user_id', 'https://example.com'),
      ).rejects.toThrow('Identity is already verified');
    });
  });

  describe('handleVerificationWebhook', () => {
    it('should process verified webhook successfully', async () => {
      const sessionId = 'vs_test_123';
      const user = createMockUser();

      mockIdentityVerificationModel.findOne.mockResolvedValue({
        user: '507f1f77bcf86cd799439011',
        stripeVerificationId: sessionId,
      });
      mockUserModel.findById.mockResolvedValue(user);
      mockIdentityVerificationModel.findOneAndUpdate.mockResolvedValue({});

      const result = await service.handleVerificationWebhook(sessionId);

      expect(result.success).toBe(true);
      expect(result.message).toBe(
        'Identity verification completed successfully',
      );
      expect(user.isVerified.identity).toBe(true);
      expect(user.save).toHaveBeenCalled();
    });

    it('should return false if verification failed', async () => {
      mockStripeIdentityService.getVerificationSession.mockResolvedValueOnce({
        id: 'vs_test_123',
        status: 'requires_input',
        verified: false,
        idType: null,
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        licenseNumber: null,
      });

      const result = await service.handleVerificationWebhook('vs_test_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Verification failed');
    });

    it('should handle missing verification record', async () => {
      mockIdentityVerificationModel.findOne.mockResolvedValue(null);

      const result = await service.handleVerificationWebhook('vs_test_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Verification record not found');
    });
  });

  describe('checkIdentityStatus', () => {
    it('should return verified status with details', async () => {
      const user = createMockUser({
        isVerified: { email: false, phone: false, identity: true },
      });

      mockUserModel.findById.mockResolvedValue(user);
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'driving_license',
          verifiedName: 'John Smith',
          verifiedDOB: '1990-05-15',
          verifiedAt: new Date('2025-12-06'),
        }),
      });

      const result = await service.checkIdentityStatus('user_id');

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(true);
      expect(result.details?.idType).toBe('driving_license');
    });

    it('should return unverified status', async () => {
      const user = createMockUser();
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.checkIdentityStatus('user_id');

      expect(result.success).toBe(true);
      expect(result.isVerified).toBe(false);
      expect(result.details).toBeUndefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.checkIdentityStatus('invalid_id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('hasVerifiedWithDrivingLicense', () => {
    it('should return true if verified with driving license', async () => {
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'driving_license',
        }),
      });

      const result = await service.hasVerifiedWithDrivingLicense('user_id');

      expect(result).toBe(true);
    });

    it('should return false if verified with passport', async () => {
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'passport',
        }),
      });

      const result = await service.hasVerifiedWithDrivingLicense('user_id');

      expect(result).toBe(false);
    });

    it('should return false if not verified', async () => {
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      const result = await service.hasVerifiedWithDrivingLicense('user_id');

      expect(result).toBe(false);
    });
  });
});

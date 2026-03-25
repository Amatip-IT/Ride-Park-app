import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IdentityVerificationController } from './verification.controller';
import { IdentityVerificationService } from './verification.service';
import { StripeIdentityService } from '../services/identity/stripe-identity.service';
import { CreateIdentitySessionDto } from '../dto/create-identity-session.dto';
import { AuthGuard } from '../../guards/auth.guard';
import type { RawBodyRequest } from '@nestjs/common';

// Define the AuthenticatedRequest interface to match controller
interface AuthenticatedRequest {
  user: {
    _id: {
      toString(): string;
    };
  };
}

// Mock AuthGuard to bypass authentication in tests
const mockAuthGuard = {
  canActivate: jest.fn(() => true),
};

describe('IdentityVerificationController', () => {
  let controller: IdentityVerificationController;

  const mockIdentityVerificationService = {
    createVerificationSession: jest.fn(),
    handleVerificationWebhook: jest.fn(),
    checkIdentityStatus: jest.fn(),
    hasVerifiedWithDrivingLicense: jest.fn(),
  };

  const mockStripeIdentityService = {
    verifyWebhookSignature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityVerificationController],
      providers: [
        {
          provide: IdentityVerificationService,
          useValue: mockIdentityVerificationService,
        },
        {
          provide: StripeIdentityService,
          useValue: mockStripeIdentityService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<IdentityVerificationController>(
      IdentityVerificationController,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createSession', () => {
    it('should create verification session successfully', async () => {
      const dto: CreateIdentitySessionDto = {
        returnUrl: 'https://app.example.com/complete',
      };
      const req: AuthenticatedRequest = {
        user: {
          _id: {
            toString: () => '507f1f77bcf86cd799439011',
          },
        },
      };
      const expectedResult = {
        success: true,
        sessionId: 'vs_test_123',
        url: 'https://verify.stripe.com/start/test',
        clientSecret: 'vs_secret_123',
        message: 'Verification session created',
      };

      mockIdentityVerificationService.createVerificationSession.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.createSession(dto, req);

      expect(result).toEqual(expectedResult);
      expect(
        mockIdentityVerificationService.createVerificationSession,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439011', dto.returnUrl);
    });
  });

  describe('handleWebhook', () => {
    it('should process webhook successfully', async () => {
      const signature = 'test_signature';
      const rawBody = Buffer.from('{"test": "data"}');
      const req = { rawBody } as RawBodyRequest<Request>;

      const mockEvent = {
        type: 'identity.verification_session.verified',
        data: {
          object: {
            id: 'vs_test_123',
          },
        },
      };

      mockStripeIdentityService.verifyWebhookSignature.mockReturnValue(
        mockEvent,
      );
      mockIdentityVerificationService.handleVerificationWebhook.mockResolvedValue(
        { success: true },
      );

      const result = await controller.handleWebhook(signature, req);

      expect(result).toEqual({ received: true });
      expect(
        mockStripeIdentityService.verifyWebhookSignature,
      ).toHaveBeenCalledWith(rawBody, signature);
      expect(
        mockIdentityVerificationService.handleVerificationWebhook,
      ).toHaveBeenCalledWith('vs_test_123');
    });

    it('should throw error if signature is missing', async () => {
      const req = { rawBody: Buffer.from('test') } as RawBodyRequest<Request>;

      await expect(controller.handleWebhook('', req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if rawBody is missing', async () => {
      const req = {} as RawBodyRequest<Request>;

      await expect(controller.handleWebhook('signature', req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should ignore non-verification events', async () => {
      const signature = 'test_signature';
      const rawBody = Buffer.from('{"test": "data"}');
      const req = { rawBody } as RawBodyRequest<Request>;

      const mockEvent = {
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      mockStripeIdentityService.verifyWebhookSignature.mockReturnValue(
        mockEvent,
      );

      const result = await controller.handleWebhook(signature, req);

      expect(result).toEqual({ received: true });
      expect(
        mockIdentityVerificationService.handleVerificationWebhook,
      ).not.toHaveBeenCalled();
    });
  });

  describe('checkStatus', () => {
    it('should return identity verification status', async () => {
      const req: AuthenticatedRequest = {
        user: {
          _id: {
            toString: () => '507f1f77bcf86cd799439011',
          },
        },
      };
      const expectedResult = {
        success: true,
        isVerified: true,
        details: {
          idType: 'driving_license',
          verifiedName: 'John Smith',
          verifiedDOB: '1990-05-15',
          verifiedAt: new Date('2025-12-06'),
        },
      };

      mockIdentityVerificationService.checkIdentityStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkStatus(req);

      expect(result).toEqual(expectedResult);
      expect(
        mockIdentityVerificationService.checkIdentityStatus,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });
  });

  describe('hasLicense', () => {
    it('should return true if user has driving license', async () => {
      const req: AuthenticatedRequest = {
        user: {
          _id: {
            toString: () => '507f1f77bcf86cd799439011',
          },
        },
      };

      mockIdentityVerificationService.hasVerifiedWithDrivingLicense.mockResolvedValue(
        true,
      );

      const result = await controller.hasLicense(req);

      expect(result.success).toBe(true);
      expect(result.hasDrivingLicense).toBe(true);
      expect(result.message).toContain('User verified with driving license');
    });

    it('should return false if user has passport', async () => {
      const req: AuthenticatedRequest = {
        user: {
          _id: {
            toString: () => '507f1f77bcf86cd799439011',
          },
        },
      };

      mockIdentityVerificationService.hasVerifiedWithDrivingLicense.mockResolvedValue(
        false,
      );

      const result = await controller.hasLicense(req);

      expect(result.success).toBe(true);
      expect(result.hasDrivingLicense).toBe(false);
      expect(result.message).toContain('re-verify with driving license');
    });
  });
});

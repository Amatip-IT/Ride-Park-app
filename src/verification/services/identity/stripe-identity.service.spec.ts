import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { StripeIdentityService } from './stripe-identity.service';
import Stripe from 'stripe';

describe('StripeIdentityService', () => {
  let service: StripeIdentityService;

  const mockConfigService: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_mock_key',
        STRIPE_WEBHOOK_SECRET: 'whsec_mock_secret',
      };
      return config[key];
    }),
  };

  const mockStripeClient = {
    identity: {
      verificationSessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeIdentityService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StripeIdentityService>(StripeIdentityService);

    // Mock Stripe client with proper typing
    service['stripe'] = mockStripeClient as unknown as Stripe;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should throw error if Stripe key is missing', () => {
      const invalidConfigService: Partial<ConfigService> = {
        get: jest.fn(() => undefined),
      };

      expect(
        () => new StripeIdentityService(invalidConfigService as ConfigService),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('createVerificationSession', () => {
    it('should create verification session successfully', async () => {
      const userId = 'user_123';
      const returnUrl = 'https://app.example.com/complete';

      mockStripeClient.identity.verificationSessions.create.mockResolvedValue({
        id: 'vs_test_123',
        url: 'https://verify.stripe.com/start/test_123',
        client_secret: 'vs_test_secret_123',
      });

      const result = await service.createVerificationSession(userId, returnUrl);

      expect(result.sessionId).toBe('vs_test_123');
      expect(result.url).toContain('stripe.com');
      expect(result.clientSecret).toBe('vs_test_secret_123');
      expect(
        mockStripeClient.identity.verificationSessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'document',
          metadata: { userId },
          return_url: returnUrl,
        }),
      );
    });

    it('should throw error if session creation fails', async () => {
      mockStripeClient.identity.verificationSessions.create.mockRejectedValue(
        new Error('Stripe API error'),
      );

      await expect(
        service.createVerificationSession('user_123', 'https://example.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getVerificationSession', () => {
    it('should retrieve verification session with driving license', async () => {
      mockStripeClient.identity.verificationSessions.retrieve.mockResolvedValue(
        {
          id: 'vs_test_123',
          status: 'verified',
          verified_outputs: {
            first_name: 'John',
            last_name: 'Smith',
            dob: {
              day: 15,
              month: 5,
              year: 1990,
            },
            document: {
              type: 'driving_license',
              number: 'SMITH905156JD9XX',
            },
          },
        },
      );

      const result = await service.getVerificationSession('vs_test_123');

      expect(result.verified).toBe(true);
      expect(result.idType).toBe('driving_license');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
      expect(result.dateOfBirth).toBe('1990-05-15');
      expect(result.licenseNumber).toBe('SMITH905156JD9XX');
    });

    it('should retrieve verification session with passport', async () => {
      mockStripeClient.identity.verificationSessions.retrieve.mockResolvedValue(
        {
          id: 'vs_test_123',
          status: 'verified',
          verified_outputs: {
            first_name: 'Jane',
            last_name: 'Doe',
            dob: {
              day: 20,
              month: 8,
              year: 1985,
            },
            document: {
              type: 'passport',
              number: 'AB1234567',
            },
          },
        },
      );

      const result = await service.getVerificationSession('vs_test_123');

      expect(result.verified).toBe(true);
      expect(result.idType).toBe('passport');
      expect(result.licenseNumber).toBe('AB1234567');
    });

    it('should handle missing verified outputs', async () => {
      mockStripeClient.identity.verificationSessions.retrieve.mockResolvedValue(
        {
          id: 'vs_test_123',
          status: 'requires_input',
          verified_outputs: null,
        },
      );

      const result = await service.getVerificationSession('vs_test_123');

      expect(result.verified).toBe(false);
      expect(result.idType).toBeNull();
      expect(result.firstName).toBeNull();
    });

    it('should throw error if retrieval fails', async () => {
      mockStripeClient.identity.verificationSessions.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );

      await expect(
        service.getVerificationSession('vs_test_123'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature successfully', () => {
      const payload = '{"test": "data"}';
      const signature = 'test_signature';
      const mockEvent = {
        type: 'identity.verification_session.verified',
        data: { object: {} },
      };

      mockStripeClient.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = service.verifyWebhookSignature(payload, signature);

      expect(result).toEqual(mockEvent);
      expect(mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        'whsec_mock_secret',
      );
    });

    it('should throw error if signature verification fails', () => {
      mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() =>
        service.verifyWebhookSignature('payload', 'invalid_sig'),
      ).toThrow(InternalServerErrorException);
    });

    it('should throw error if webhook secret is missing', () => {
      const invalidConfigService: Partial<ConfigService> = {
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_key';
          return undefined;
        }),
      };

      const invalidService = new StripeIdentityService(
        invalidConfigService as ConfigService,
      );
      invalidService['stripe'] = mockStripeClient as unknown as Stripe;

      expect(() =>
        invalidService.verifyWebhookSignature('payload', 'sig'),
      ).toThrow(InternalServerErrorException);
    });
  });
});

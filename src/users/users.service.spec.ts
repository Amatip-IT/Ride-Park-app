import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from '../schemas/user.schema';
import { Taxi } from '../schemas/taxi.schema';
import { user_settings } from '../schemas/user-settings-schema';
import { Wallet } from '../schemas/wallet.schema';
import { BookingRequest } from '../schemas/booking-request.schema';
import { ParkingVerification } from '../schemas/parking-verification.schema';
import { Chauffeur } from '../schemas/chauffeur.schema';
import { EmailVerificationService } from '../verification/email/verification.service';
import {
  generateRefreshToken,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from 'src/utility/authUtilities';

describe('UsersService auth hardening', () => {
  let service: UsersService;

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  };

  const mockEmailVerificationService = {
    sendEmailOtp: jest.fn(),
    verifyEmailOtp: jest.fn(),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test_access_secret';
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
    process.env.NODE_ENV = 'test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Taxi.name), useValue: {} },
        { provide: getModelToken(user_settings.name), useValue: {} },
        { provide: getModelToken(Wallet.name), useValue: {} },
        { provide: getModelToken(BookingRequest.name), useValue: {} },
        { provide: getModelToken(ParkingVerification.name), useValue: {} },
        { provide: getModelToken(Chauffeur.name), useValue: {} },
        {
          provide: EmailVerificationService,
          useValue: mockEmailVerificationService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  function mockUserDoc(overrides: Record<string, unknown> = {}) {
    const doc: any = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      email: 'user@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+441234567890',
      role: 'user',
      accountStatus: 'active',
      password: bcrypt.hashSync('CorrectPass1!', 4),
      failedLoginAttempts: 0,
      lockUntil: null,
      tokenVersion: 0,
      refreshToken: null,
      isVerified: {},
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn(function (this: any) {
        const { save, toObject, ...rest } = this;
        return rest;
      }),
      ...overrides,
    };
    return doc;
  }

  describe('checkUsernameAvailability', () => {
    it('returns available when the username is free', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkUsernameAvailability('fresh_user');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ available: true });
    });

    it('returns suggestions when the username is taken', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ username: 'taken_user' }),
      });
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.checkUsernameAvailability('taken_user');

      expect(result.success).toBe(true);
      expect(result.data.available).toBe(false);
      expect(result.message).toMatch(/already taken/i);
      expect(Array.isArray(result.data.suggestions)).toBe(true);
    });

    it('rejects invalid usernames', async () => {
      const result = await service.checkUsernameAvailability('ab');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/between 3 and 30/i);
    });
  });

  describe('loginUser lockout', () => {
    it('locks the account after too many failed password attempts', async () => {
      const user = mockUserDoc({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
      });
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.loginUser({
        email: 'user@example.com',
        password: 'WrongPass1!',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/temporarily locked/i);
      expect(user.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expect(user.lockUntil).toBeInstanceOf(Date);
      expect(user.save).toHaveBeenCalled();
    });

    it('rejects login while account is locked', async () => {
      const user = mockUserDoc({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockUntil: new Date(Date.now() + 10 * 60_000),
      });
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.loginUser({
        email: 'user@example.com',
        password: 'CorrectPass1!',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/temporarily locked/i);
    });
  });

  describe('resetPassword', () => {
    it('clears refresh token and bumps tokenVersion', async () => {
      const user = mockUserDoc({
        refreshToken: 'old-refresh',
        tokenVersion: 2,
      });
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });
      mockEmailVerificationService.verifyEmailOtp.mockResolvedValue({
        success: true,
      });

      const result = await service.resetPassword(
        'user@example.com',
        '123456',
        'NewStrongPass1!',
      );

      expect(result.success).toBe(true);
      expect(user.refreshToken).toBeNull();
      expect(user.tokenVersion).toBe(3);
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('updateOwnProfile', () => {
    it('updates only provided fields without re-saving the whole user', async () => {
      const updated = {
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ada',
        lastName: 'Lovelace',
      };
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(updated),
        }),
      });

      const result = await service.updateOwnProfile('507f1f77bcf86cd799439011', {
        firstName: 'Ada',
        lastName: 'Lovelace',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { $set: { firstName: 'Ada', lastName: 'Lovelace' } },
        { new: true, runValidators: true },
      );
    });
  });

  describe('refreshUserToken', () => {
    it('rotates the refresh token on success', async () => {
      const currentRefresh = generateRefreshToken(
        '507f1f77bcf86cd799439011',
        0,
      );
      const user = mockUserDoc({ refreshToken: currentRefresh, tokenVersion: 0 });
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.refreshUserToken(currentRefresh);

      expect(result.success).toBe(true);
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).not.toBe(currentRefresh);
      expect(user.refreshToken).toBe(result.refreshToken);
    });

    it('revokes sessions when a rotated refresh token is reused', async () => {
      const staleRefresh = generateRefreshToken('507f1f77bcf86cd799439011', 0);
      const user = mockUserDoc({
        refreshToken: 'already-rotated-token',
        tokenVersion: 0,
      });
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      });

      const result = await service.refreshUserToken(staleRefresh);

      expect(result.success).toBe(false);
      expect(user.refreshToken).toBeNull();
      expect(user.tokenVersion).toBe(1);
    });
  });
});

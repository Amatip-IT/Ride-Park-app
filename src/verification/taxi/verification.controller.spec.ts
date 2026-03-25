import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DriverVerificationController } from './verification.controller';
import { DriverVerificationService } from './verification.service';
import { AdminDriverDecisionDto } from '../dto/apply-driver.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { IdentityVerifiedGuard } from '../../guards/identity-verified.guard';
import { AdminGuard } from '../../guards/admin.guard';

interface AuthenticatedRequest {
  user: {
    _id: {
      toString(): string;
    };
  };
}

describe('DriverVerificationController', () => {
  let controller: DriverVerificationController;

  const mockDriverVerificationService = {
    checkVehicleDetails: jest.fn(),
    applyDriver: jest.fn(),
    checkDriverStatus: jest.fn(),
    approveDriver: jest.fn(),
    rejectDriver: jest.fn(),
  };

  const mockRequest: AuthenticatedRequest = {
    user: {
      _id: {
        toString: () => 'user123',
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverVerificationController],
      providers: [
        {
          provide: DriverVerificationService,
          useValue: mockDriverVerificationService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(IdentityVerifiedGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<DriverVerificationController>(
      DriverVerificationController,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkVehicle', () => {
    it('should check vehicle details successfully', async () => {
      const expectedResult = {
        success: true,
        message: 'Vehicle found',
        vehicleData: {
          registration: 'AB12CDE',
          taxStatus: 'Taxed',
          motStatus: 'Valid',
        },
        requiresConfirmation: true,
      };

      mockDriverVerificationService.checkVehicleDetails.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkVehicle(mockRequest, 'AB12CDE');

      expect(result).toEqual(expectedResult);
      expect(
        mockDriverVerificationService.checkVehicleDetails,
      ).toHaveBeenCalledWith('user123', 'AB12CDE');
    });

    it('should throw error if registration missing', async () => {
      await expect(controller.checkVehicle(mockRequest, '')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('applyDriver', () => {
    const mockDto = {
      registrationNumber: 'AB12CDE',
      vehicleColour: 'Blue',
      vehicleMake: 'TOYOTA',
      vehicleYear: '2020',
      hasValidInsurance: 'true',
      isRoadworthy: 'true',
      hasPermission: 'true',
    };

    const mockFiles = {
      vehiclePhotos: [
        { buffer: Buffer.from('1') },
        { buffer: Buffer.from('2') },
        { buffer: Buffer.from('3') },
        { buffer: Buffer.from('4') },
      ] as Express.Multer.File[],
      insuranceCertificate: [
        { buffer: Buffer.from('insurance') },
      ] as Express.Multer.File[],
    };

    it('should submit driver application successfully', async () => {
      const expectedResult = {
        success: true,
        message: 'Application submitted',
        applicationId: 'app123',
      };

      mockDriverVerificationService.applyDriver.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.applyDriver(
        mockRequest,
        mockDto,
        mockFiles,
      );

      expect(result).toEqual(expectedResult);
      expect(mockDriverVerificationService.applyDriver).toHaveBeenCalledWith(
        'user123',
        {
          registrationNumber: 'AB12CDE',
          vehicleColour: 'Blue',
          vehicleMake: 'TOYOTA',
          vehicleYear: 2020,
          hasValidInsurance: true,
          isRoadworthy: true,
          hasPermission: true,
        },
        mockFiles.vehiclePhotos,
        mockFiles.insuranceCertificate[0],
      );
    });

    it('should throw error if files missing', async () => {
      await expect(
        controller.applyDriver(mockRequest, mockDto, {}),
      ).rejects.toThrow('upload vehicle photos and insurance');
    });
  });

  describe('checkStatus', () => {
    it('should return driver status', async () => {
      const expectedResult = {
        success: true,
        hasApplied: true,
        isVerified: true,
        isActive: false,
        status: 'approved',
      };

      mockDriverVerificationService.checkDriverStatus.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.checkStatus(mockRequest);

      expect(result).toEqual(expectedResult);
      expect(
        mockDriverVerificationService.checkDriverStatus,
      ).toHaveBeenCalledWith('user123');
    });
  });

  describe('approveDriver', () => {
    it('should approve driver', async () => {
      const decision: AdminDriverDecisionDto = {
        userId: 'user456',
        decision: 'approve',
      };

      const expectedResult = {
        success: true,
        message: 'Driver approved',
      };

      mockDriverVerificationService.approveDriver.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.approveDriver(mockRequest, decision);

      expect(result).toEqual(expectedResult);
      expect(mockDriverVerificationService.approveDriver).toHaveBeenCalledWith(
        'user456',
        'user123',
      );
    });

    it('should reject driver with reason', async () => {
      const decision: AdminDriverDecisionDto = {
        userId: 'user456',
        decision: 'reject',
        reason: 'Invalid insurance',
      };

      const expectedResult = {
        success: true,
        message: 'Driver rejected',
      };

      mockDriverVerificationService.rejectDriver.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.approveDriver(mockRequest, decision);

      expect(result).toEqual(expectedResult);
      expect(mockDriverVerificationService.rejectDriver).toHaveBeenCalledWith(
        'user456',
        'user123',
        'Invalid insurance',
      );
    });

    it('should throw error if rejecting without reason', async () => {
      const decision: AdminDriverDecisionDto = {
        userId: 'user456',
        decision: 'reject',
      };

      await expect(
        controller.approveDriver(mockRequest, decision),
      ).rejects.toThrow('Rejection reason is required');
    });
  });
});

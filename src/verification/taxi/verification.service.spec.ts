import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DriverVerificationService } from './verification.service';
import { DvlaService } from '../services/driver/dvla.service';
import { MotService } from '../services/driver/mot.service';
import { FileUploadService } from '../services/file/file-upload.service';
import { User } from '../../schemas/user.schema';
import { DriverVerification } from '../../schemas/taxi.schema';
import { IdentityVerification } from '../../schemas/identity-verification.schema';

describe('DriverVerificationService', () => {
  let service: DriverVerificationService;

  const mockUser = {
    _id: 'user123',
    isVerified: { email: true, phone: true, identity: true },
  };

  const mockDvlaService = {
    validateRegistrationFormat: jest.fn().mockReturnValue(true),
    checkVehicle: jest.fn().mockResolvedValue({
      success: true,
      data: {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        motStatus: 'Valid',
        make: 'TOYOTA',
        colour: 'Blue',
        yearOfManufacture: 2020,
        fuelType: 'Petrol',
      },
      checks: {
        vehicleExists: true,
        taxed: true,
        motValid: true,
        notMarkedForExport: true,
      },
      message: 'Vehicle checks passed',
    }),
  };

  const mockMotService = {
    getMotHistory: jest.fn().mockResolvedValue({
      success: true,
      data: {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'COROLLA',
        motTests: [],
      },
      checks: {
        hasMotHistory: true,
        latestTestPassed: true,
        motNotExpired: true,
        mileageIncreasing: true,
        noDangerousDefects: true,
      },
      latestTest: {
        expiryDate: '2025-11-14',
        completedDate: '2024-11-15',
        testResult: 'PASSED',
        odometerValue: '45000',
        odometerUnit: 'mi',
        motTestNumber: 'TEST123',
      },
      message: 'MOT checks passed',
    }),
  };

  const mockFileUploadService = {
    validateFileType: jest.fn().mockReturnValue(true),
    validateFileSize: jest.fn().mockReturnValue(true),
    uploadMultipleFiles: jest
      .fn()
      .mockResolvedValue([
        'https://s3.amazonaws.com/photo1.jpg',
        'https://s3.amazonaws.com/photo2.jpg',
      ]),
    uploadFile: jest
      .fn()
      .mockResolvedValue('https://s3.amazonaws.com/insurance.pdf'),
  };

  const mockUserModel = {
    findById: jest.fn(),
  };

  const mockDriverVerificationModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const mockIdentityVerificationModel = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverVerificationService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        {
          provide: getModelToken(DriverVerification.name),
          useValue: mockDriverVerificationModel,
        },
        {
          provide: getModelToken(IdentityVerification.name),
          useValue: mockIdentityVerificationModel,
        },
        { provide: DvlaService, useValue: mockDvlaService },
        { provide: MotService, useValue: mockMotService },
        { provide: FileUploadService, useValue: mockFileUploadService },
      ],
    }).compile();

    service = module.get<DriverVerificationService>(DriverVerificationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkVehicleDetails', () => {
    it('should return vehicle details successfully', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'driving_license',
        }),
      });
      mockDriverVerificationModel.findOne.mockResolvedValue(null);

      const result = await service.checkVehicleDetails('user123', 'AB12CDE');

      expect(result.success).toBe(true);
      expect(result.vehicleData?.registration).toBe('AB12CDE');
      expect(result.requiresConfirmation).toBe(true);
    });

    it('should throw error if user not identity verified', async () => {
      mockUserModel.findById.mockResolvedValue({
        ...mockUser,
        isVerified: { identity: false },
      });

      await expect(
        service.checkVehicleDetails('user123', 'AB12CDE'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if verified with passport', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'passport',
        }),
      });

      await expect(
        service.checkVehicleDetails('user123', 'AB12CDE'),
      ).rejects.toThrow('UK Driving License');
    });

    it('should throw error if invalid registration format', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockIdentityVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          idType: 'driving_license',
        }),
      });
      mockDriverVerificationModel.findOne.mockResolvedValue(null);
      mockDvlaService.validateRegistrationFormat.mockReturnValue(false);

      await expect(
        service.checkVehicleDetails('user123', 'INVALID'),
      ).rejects.toThrow('Invalid UK vehicle registration format');
    });
  });

  describe('applyDriver', () => {
    const mockApplyDto = {
      registrationNumber: 'AB12CDE',
      vehicleColour: 'Blue',
      vehicleMake: 'TOYOTA',
      vehicleYear: 2020,
      hasValidInsurance: true,
      isRoadworthy: true,
      hasPermission: true,
    };

    const mockFiles = [
      { buffer: Buffer.from('photo1'), mimetype: 'image/jpeg', size: 1000 },
      { buffer: Buffer.from('photo2'), mimetype: 'image/jpeg', size: 1000 },
      { buffer: Buffer.from('photo3'), mimetype: 'image/jpeg', size: 1000 },
      { buffer: Buffer.from('photo4'), mimetype: 'image/jpeg', size: 1000 },
    ] as Express.Multer.File[];

    const mockInsurance = {
      buffer: Buffer.from('insurance'),
      mimetype: 'application/pdf',
      size: 5000,
    } as Express.Multer.File;

    it('should submit driver application successfully', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockDriverVerificationModel.create.mockResolvedValue({
        _id: 'app123',
      });

      const result = await service.applyDriver(
        'user123',
        mockApplyDto,
        mockFiles,
        mockInsurance,
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toBe('app123');
      expect(mockFileUploadService.uploadMultipleFiles).toHaveBeenCalled();
      expect(mockFileUploadService.uploadFile).toHaveBeenCalled();
    });

    it('should reject if vehicle details do not match', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);

      const wrongDto = {
        ...mockApplyDto,
        vehicleColour: 'Red', // Wrong colour
      };

      await expect(
        service.applyDriver('user123', wrongDto, mockFiles, mockInsurance),
      ).rejects.toThrow('Vehicle details do not match');
    });

    it('should reject if legal confirmations not checked', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);

      const wrongDto = {
        ...mockApplyDto,
        hasValidInsurance: false,
      };

      await expect(
        service.applyDriver('user123', wrongDto, mockFiles, mockInsurance),
      ).rejects.toThrow('legal requirements');
    });

    it('should reject if insufficient photos', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);

      await expect(
        service.applyDriver(
          'user123',
          mockApplyDto,
          [mockFiles[0]],
          mockInsurance,
        ),
      ).rejects.toThrow('at least 4 vehicle photos');
    });
  });

  describe('checkDriverStatus', () => {
    it('should return driver status', async () => {
      mockDriverVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          isVerified: true,
          isActive: false,
          status: 'approved',
          vehicleInfo: { make: 'TOYOTA' },
          createdAt: new Date(),
        }),
      });

      const result = await service.checkDriverStatus('user123');

      expect(result.hasApplied).toBe(true);
      expect(result.isVerified).toBe(true);
    });

    it('should return false if no application', async () => {
      mockDriverVerificationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkDriverStatus('user123');

      expect(result.hasApplied).toBe(false);
    });
  });

  describe('approveDriver', () => {
    it('should approve driver successfully', async () => {
      const mockApplication = {
        status: 'pending_admin_review',
        isVerified: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockDriverVerificationModel.findOne.mockResolvedValue(mockApplication);

      const result = await service.approveDriver('user123', 'admin123');

      expect(result.success).toBe(true);
      expect(mockApplication.status).toBe('approved');
      expect(mockApplication.isVerified).toBe(true);
    });

    it('should throw if no pending application', async () => {
      mockDriverVerificationModel.findOne.mockResolvedValue(null);

      await expect(
        service.approveDriver('user123', 'admin123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectDriver', () => {
    it('should reject driver with reason', async () => {
      const mockApplication = {
        status: 'pending_admin_review',
        rejectionReason: undefined,
        save: jest.fn().mockResolvedValue(true),
      };

      mockDriverVerificationModel.findOne.mockResolvedValue(mockApplication);

      const result = await service.rejectDriver(
        'user123',
        'admin123',
        'Insurance expired',
      );

      expect(result.success).toBe(true);
      expect(mockApplication.status).toBe('rejected');
      expect(mockApplication.rejectionReason).toBe('Insurance expired');
    });
  });
});

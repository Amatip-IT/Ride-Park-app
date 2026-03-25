import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { MotService } from './mot.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const getFutureExpiryDate = () => {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  return future.toISOString().split('T')[0];
};

describe('MotService', () => {
  let service: MotService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'MOT_API_KEY') return 'test_mot_key';
      return null;
    }),
  };

  const mockAxiosInstance = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MotService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MotService>(MotService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if MOT API key not configured', () => {
    const emptyConfigService = {
      get: jest.fn().mockReturnValue(''),
    };

    expect(
      () => new MotService(emptyConfigService as unknown as ConfigService),
    ).toThrow(InternalServerErrorException);
  });

  describe('getMotHistory', () => {
    it('should get MOT history successfully for a vehicle with valid MOT', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '40000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST122',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMotData);
      expect(result.checks.hasMotHistory).toBe(true);
      expect(result.checks.latestTestPassed).toBe(true);
      expect(result.checks.motNotExpired).toBe(true);
      expect(result.checks.mileageIncreasing).toBe(true);
      expect(result.checks.noDangerousDefects).toBe(true);
      expect(result.latestTest?.testResult).toBe('PASSED');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/registration/AB12CDE',
      );
    });

    it('should handle new vehicle (under 3 years old)', async () => {
      const today = new Date();
      const twoYearsAgo = new Date(today);
      twoYearsAgo.setFullYear(today.getFullYear() - 2);

      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: twoYearsAgo.toISOString().split('T')[0],
        motTests: [], // No MOT tests yet
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true); // New vehicles are valid
      expect(result.vehicleStatus).toBe('NEW_VEHICLE');
      expect(result.checks.requiresMot).toBe(false);
      expect(result.checks.isExempt).toBe(false);
      expect(result.message).toContain('does not require MOT yet');
    });

    it('should handle MOT exempt vehicle (40+ years old) with NO history', async () => {
      const today = new Date();
      const fortyFiveYearsAgo = new Date(today);
      fortyFiveYearsAgo.setFullYear(today.getFullYear() - 45);

      const mockMotData = {
        registration: 'ABC123D',
        make: 'FORD',
        model: 'Cortina',
        primaryColour: 'Red',
        fuelType: 'Petrol',
        firstUsedDate: fortyFiveYearsAgo.toISOString().split('T')[0],
        motTests: [], // May not have recent MOT tests
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('ABC123D');

      expect(result.success).toBe(false); // ← Should reject!
      expect(result.riskLevel).toBe('HIGH');
      expect(result.requiresAdminReview).toBe(true);
      expect(result.vehicleStatus).toBe('MOT_EXEMPT');
      expect(result.checks.requiresMot).toBe(false);
      expect(result.checks.isExempt).toBe(true);
      expect(result.message).toContain('MOT exempt');
      expect(result.message).toContain('NO MOT history');
    });

    it('should reject vehicle that requires MOT but has NO MOT history', async () => {
      const today = new Date();
      const fiveYearsAgo = new Date(today);
      fiveYearsAgo.setFullYear(today.getFullYear() - 5);

      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: fiveYearsAgo.toISOString().split('T')[0],
        motTests: [], // NO MOT history - RED FLAG!
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false); // Should fail
      expect(result.vehicleStatus).toBe('REQUIRES_MOT');
      expect(result.checks.hasMotHistory).toBe(false);
      expect(result.checks.requiresMot).toBe(true);
      expect(result.message).toContain('WARNING');
      expect(result.message).toContain('NO MOT history');
    });

    it('should handle failed MOT test', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'FAILED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.latestTestPassed).toBe(false);
      expect(result.message).toContain('Latest test failed');
    });

    it('should handle expired MOT', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: '2024-01-01',
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.motNotExpired).toBe(false);
      expect(result.message).toContain('MOT expired');
    });

    it('should detect dangerous defects', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [
              {
                text: 'Brake pads worn',
                type: 'DANGEROUS',
                dangerous: true,
              },
            ],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.noDangerousDefects).toBe(false);
      expect(result.message).toContain('Dangerous defects present');
    });

    it('should detect major defects', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [
              {
                text: 'Suspension fault',
                type: 'MAJOR',
                dangerous: false,
              },
            ],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.noDangerousDefects).toBe(false);
      expect(result.message).toContain('Dangerous defects present');
    });

    it('should detect mileage rollback', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '30000', // Decreased from 45000
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST122',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.mileageIncreasing).toBe(false);
      expect(result.message).toContain('Mileage rollback detected');
    });

    it('should allow small mileage decreases (reading errors)', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '44500', // Only 500 miles less
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST122',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.checks.mileageIncreasing).toBe(true);
    });

    it('should return mileage history', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '40000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST122',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.mileageHistory).toEqual([
        { date: '2023-11-15T09:17:46.000Z', mileage: 40000 },
        { date: '2024-11-15T09:17:46.000Z', mileage: 45000 },
      ]);
    });

    it('should handle vehicle not found (404)', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
        },
      };

      (axios.isAxiosError as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(axiosError);

      const result = await service.getMotHistory('NOTFOUND');

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toBe(
        'Vehicle not found in DVLA database. Please check the registration number.',
      );
    });

    it('should throw error on MOT API error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      };

      (axios.isAxiosError as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(axiosError);

      await expect(service.getMotHistory('AB12CDE')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should clean registration number (remove spaces, uppercase)', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      await service.getMotHistory('ab 12 cde'); // lowercase with spaces

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/registration/AB12CDE',
      );
    });

    it('should handle single MOT test (mileage check)', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.checks.mileageIncreasing).toBe(true); // Not enough data to check
    });

    it('should handle vehicle with no defects array', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            // No defects array
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.checks.noDangerousDefects).toBe(true); // Should handle undefined
    });

    it('should handle advisory defects (should pass)', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [
              {
                text: 'Slight oil leak',
                type: 'ADVISORY',
                dangerous: false,
              },
            ],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.getMotHistory('AB12CDE');

      expect(result.success).toBe(true); // Advisory defects don't fail
      expect(result.checks.noDangerousDefects).toBe(true);
    });
  });

  describe('validateVehicleForDriver', () => {
    it('should return valid status for vehicle with valid MOT', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2024-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: getFutureExpiryDate(),
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.validateVehicleForDriver('AB12CDE');

      expect(result.isValid).toBe(true);
      expect(result.vehicleStatus).toBe('REQUIRES_MOT');
      expect(result.reason).toContain('All MOT checks passed');
    });

    it('should return invalid status for vehicle with expired MOT', async () => {
      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: '2020-01-15',
        motTests: [
          {
            completedDate: '2023-11-15T09:17:46.000Z',
            testResult: 'PASSED',
            expiryDate: '2024-01-01',
            odometerValue: '45000',
            odometerUnit: 'mi',
            motTestNumber: 'TEST123',
            defects: [],
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.validateVehicleForDriver('AB12CDE');

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('MOT expired');
    });

    it('should return valid status for new vehicle (under 3 years)', async () => {
      const today = new Date();
      const twoYearsAgo = new Date(today);
      twoYearsAgo.setFullYear(today.getFullYear() - 2);

      const mockMotData = {
        registration: 'AB12CDE',
        make: 'TOYOTA',
        model: 'Corolla',
        primaryColour: 'Blue',
        fuelType: 'Petrol',
        firstUsedDate: twoYearsAgo.toISOString().split('T')[0],
        motTests: [],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMotData });

      const result = await service.validateVehicleForDriver('AB12CDE');

      expect(result.isValid).toBe(true);
      expect(result.vehicleStatus).toBe('NEW_VEHICLE');
      expect(result.reason).toContain('does not require MOT yet');
    });
  });
});

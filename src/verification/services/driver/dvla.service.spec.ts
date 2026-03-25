import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { DvlaService } from './dvla.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DvlaService', () => {
  let service: DvlaService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DVLA_API_KEY') return 'test_dvla_key';
      return null;
    }),
  };

  const mockAxiosInstance = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DvlaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DvlaService>(DvlaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if DVLA API key not configured', () => {
    const emptyConfigService = {
      get: jest.fn().mockReturnValue(''),
    };

    expect(
      () => new DvlaService(emptyConfigService as unknown as ConfigService),
    ).toThrow(InternalServerErrorException);
  });

  describe('checkVehicle', () => {
    it('should check vehicle successfully', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        taxDueDate: '2025-12-01',
        motStatus: 'Valid',
        make: 'TOYOTA',
        monthOfFirstRegistration: '2020-01',
        yearOfManufacture: 2020,
        engineCapacity: 1500,
        co2Emissions: 120,
        fuelType: 'Petrol',
        markedForExport: false,
        colour: 'Blue',
        typeApproval: 'M1',
        wheelplan: '2 AXLE RIGID BODY',
        revenueWeight: 1500,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      const result = await service.checkVehicle('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockVehicleData);
      expect(result.checks.vehicleExists).toBe(true);
      expect(result.checks.taxed).toBe(true);
      expect(result.checks.motValid).toBe(true);
      expect(result.checks.notMarkedForExport).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/vehicle-enquiry/v1/vehicles',
        { registrationNumber: 'AB12CDE' },
      );
    });

    it('should handle vehicle not taxed', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Untaxed',
        motStatus: 'Valid',
        markedForExport: false,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      const result = await service.checkVehicle('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.taxed).toBe(false);
      expect(result.message).toBe('Vehicle checks failed');
    });

    it('should handle vehicle with expired MOT', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        motStatus: 'Expired',
        markedForExport: false,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      const result = await service.checkVehicle('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.motValid).toBe(false);
    });

    it('should handle vehicle marked for export', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        motStatus: 'Valid',
        markedForExport: true,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      const result = await service.checkVehicle('AB12CDE');

      expect(result.success).toBe(false);
      expect(result.checks.notMarkedForExport).toBe(false);
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
      mockAxiosInstance.post.mockRejectedValue(axiosError);

      const result = await service.checkVehicle('NOTFOUND');

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toBe(
        'Vehicle not found with this registration number',
      );
      expect(result.checks.vehicleExists).toBe(false);
    });

    it('should throw error on DVLA API error', async () => {
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
      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(service.checkVehicle('AB12CDE')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should clean registration number (remove spaces, uppercase)', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        motStatus: 'Valid',
        markedForExport: false,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      await service.checkVehicle('ab 12 cde'); // lowercase with spaces

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/vehicle-enquiry/v1/vehicles',
        { registrationNumber: 'AB12CDE' },
      );
    });

    it('should accept "No details held by DVLA" as valid MOT status', async () => {
      const mockVehicleData = {
        registrationNumber: 'AB12CDE',
        taxStatus: 'Taxed',
        motStatus: 'No details held by DVLA',
        markedForExport: false,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockVehicleData });

      const result = await service.checkVehicle('AB12CDE');

      expect(result.success).toBe(true);
      expect(result.checks.motValid).toBe(true);
    });
  });

  describe('validateRegistrationFormat', () => {
    it('should validate current format (AB12CDE)', () => {
      expect(service.validateRegistrationFormat('AB12CDE')).toBe(true);
      expect(service.validateRegistrationFormat('XY99ZZZ')).toBe(true);
    });

    it('should validate prefix format (A123BCD)', () => {
      expect(service.validateRegistrationFormat('A123BCD')).toBe(true);
      expect(service.validateRegistrationFormat('X1ABC')).toBe(true);
    });

    it('should validate suffix format (ABC123D)', () => {
      expect(service.validateRegistrationFormat('ABC123D')).toBe(true);
      expect(service.validateRegistrationFormat('XYZ1A')).toBe(true);
    });

    it('should accept lowercase and spaces', () => {
      expect(service.validateRegistrationFormat('ab 12 cde')).toBe(true);
      expect(service.validateRegistrationFormat('a 123 bcd')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(service.validateRegistrationFormat('INVALID')).toBe(false);
      expect(service.validateRegistrationFormat('12345')).toBe(false);
      expect(service.validateRegistrationFormat('A')).toBe(false);
      expect(service.validateRegistrationFormat('')).toBe(false);
    });
  });
});

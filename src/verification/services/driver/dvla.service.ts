import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface DvlaVehicleData {
  registrationNumber: string;
  taxStatus: string;
  taxDueDate: string | null;
  motStatus: string;
  make: string;
  monthOfFirstRegistration: string;
  yearOfManufacture: number;
  engineCapacity: number;
  co2Emissions: number;
  fuelType: string;
  markedForExport: boolean;
  colour: string;
  typeApproval: string;
  wheelplan: string;
  revenueWeight: number;
}

@Injectable()
export class DvlaService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DVLA_API_KEY') || '';

    if (!this.apiKey) {
      console.warn('⚠️ DVLA API key not configured. DVLA features will fail if called.');
      return;
    }

    // DETECT TEST/LIVE MODE
    const isTestMode =
      this.configService.get<string>('NODE_ENV') !== 'production';
    const baseURL = isTestMode
      ? 'https://uat.driver-vehicle-licensing.api.gov.uk'
      : 'https://driver-vehicle-licensing.api.gov.uk';

    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log(
      `DVLA service initialized (${isTestMode ? 'TEST' : 'LIVE'} mode)`,
    );
  }

  /**
   * Check vehicle details by registration number
   * @param registrationNumber - UK vehicle registration (e.g., "AB12CDE")
   * @returns Vehicle information from DVLA
   */
  async checkVehicle(registrationNumber: string): Promise<{
    success: boolean;
    data: DvlaVehicleData | null;
    message: string;
    checks: {
      vehicleExists: boolean;
      taxed: boolean;
      motValid: boolean;
      notMarkedForExport: boolean;
    };
  }> {
    try {
      // Remove spaces and convert to uppercase
      const cleanedReg = registrationNumber.replace(/\s+/g, '').toUpperCase();

      const response = await this.axiosInstance.post<DvlaVehicleData>(
        '/vehicle-enquiry/v1/vehicles',
        {
          registrationNumber: cleanedReg,
        },
      );

      const vehicleData = response.data;

      // Perform checks
      const checks = {
        vehicleExists: !!vehicleData,
        taxed: vehicleData.taxStatus === 'Taxed',
        motValid:
          vehicleData.motStatus === 'Valid' ||
          vehicleData.motStatus === 'No details held by DVLA',
        notMarkedForExport: !vehicleData.markedForExport,
      };

      const allChecksPassed = Object.values(checks).every(
        (check) => check === true,
      );

      return {
        success: allChecksPassed,
        data: vehicleData,
        message: allChecksPassed
          ? 'Vehicle checks passed'
          : 'Vehicle checks failed',
        checks,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            success: false,
            data: null,
            message: 'Vehicle not found with this registration number',
            checks: {
              vehicleExists: false,
              taxed: false,
              motValid: false,
              notMarkedForExport: false,
            },
          };
        }

        console.error('DVLA API error:', error.response?.data);
        throw new InternalServerErrorException(
          `DVLA API error: ${error.message}. Status: ${error.response?.status || 'unknown'}`,
        );
      }

      console.error('DVLA service error:', error);
      throw new InternalServerErrorException(
        'Failed to communicate with DVLA service.',
      );
    }
  }

  /**
   * Validate UK registration number format
   * @param registrationNumber - Registration to validate
   * @returns boolean
   */
  validateRegistrationFormat(registrationNumber: string): boolean {
    // Remove spaces and convert to uppercase
    const cleaned = registrationNumber.replace(/\s+/g, '').toUpperCase();

    // UK registration formats:
    // Current format (2001-present): AB12CDE
    // Prefix format (1983-2001): A123BCD
    // Suffix format (1963-1983): ABC123D
    const currentFormat = /^[A-Z]{2}\d{2}[A-Z]{3}$/; // AB12CDE
    const prefixFormat = /^[A-Z]\d{1,3}[A-Z]{3}$/; // A123BCD
    const suffixFormat = /^[A-Z]{3}\d{1,3}[A-Z]$/; // ABC123D

    return (
      currentFormat.test(cleaned) ||
      prefixFormat.test(cleaned) ||
      suffixFormat.test(cleaned)
    );
  }
}

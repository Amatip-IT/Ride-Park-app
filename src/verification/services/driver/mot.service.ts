import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface Defect {
  text: string;
  type: string;
  dangerous?: boolean;
}

interface MotTest {
  completedDate: string;
  testResult: string;
  expiryDate: string;
  odometerValue: string;
  odometerUnit: string;
  motTestNumber: string;
  defects?: Defect[];
}

interface MotHistoryData {
  registration: string;
  make: string;
  model: string;
  primaryColour: string;
  fuelType: string;
  manufactureDate?: string;
  firstUsedDate?: string;
  registrationDate?: string;
  engineSize?: string;
  hasOutstandingRecall?: string;
  motTests: MotTest[];
}

export enum VehicleStatus {
  NEW_VEHICLE = 'NEW_VEHICLE', // Under 3 years
  MOT_EXEMPT = 'MOT_EXEMPT', // 40+ years or historic
  REQUIRES_MOT = 'REQUIRES_MOT', // 3-40 years
  UNKNOWN = 'UNKNOWN',
}

@Injectable()
export class MotService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private clientId: string;
  private clientSecret: string;
  private scopeURL: string;
  private tenantId: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly MOT_AGE_THRESHOLD = 3; // Years before first MOT required
  private readonly MOT_EXEMPT_AGE = 40; // Years for historic vehicle exemption

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MOT_API_KEY') || '';
    this.clientId = this.configService.get<string>('MOT_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('MOT_CLIENT_SECRET') || '';
    this.scopeURL = this.configService.get<string>('MOT_SCOPE_URL') || '';
    this.tenantId = this.configService.get<string>('MOT_TENANT_ID') || '';

    if (
      !this.apiKey ||
      !this.clientId ||
      !this.clientSecret ||
      !this.scopeURL ||
      !this.tenantId
    ) {
      console.warn('⚠️ MOT API credentials not configured. MOT features will fail if called.');
      return;
    }

    // Using the official MOT History API endpoint
    this.axiosInstance = axios.create({
      baseURL: 'https://history.mot.api.gov.uk/v1/trade/vehicles',
      timeout: 10000,
    });

    console.log('MOT service initialized');
  }

  /**
   * Get OAuth2 access token from Microsoft
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('scope', this.scopeURL);

      const response = await axios.post<{
        access_token: string;
        expires_in: number;
      }>(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const token = response.data.access_token;
      if (!token) {
        throw new Error('No access token received');
      }

      this.accessToken = token;
      // Token expires in 60 minutes, cache for 55 minutes to be safe
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);

      console.log('MOT OAuth2 token obtained successfully');

      return this.accessToken;
    } catch (error) {
      console.error('Failed to get MOT OAuth2 token:', error);
      throw new InternalServerErrorException(
        'Failed to authenticate with MOT API',
      );
    }
  }

  /**
   * Get MOT history for a vehicle
   * @param registrationNumber - UK vehicle registration
   * @returns MOT history and checks
   */
  async getMotHistory(registrationNumber: string): Promise<{
    success: boolean;
    data: MotHistoryData | null;
    message: string;
    vehicleStatus: VehicleStatus;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    requiresAdminReview?: boolean;
    checks: {
      hasMotHistory: boolean;
      latestTestPassed: boolean;
      motNotExpired: boolean;
      mileageIncreasing: boolean;
      noDangerousDefects: boolean;
      vehicleAge?: number;
      requiresMot: boolean;
      isExempt: boolean;
    };
    latestTest?: MotTest;
    mileageHistory?: Array<{ date: string; mileage: number }>;
  }> {
    const cleanedReg = registrationNumber.replace(/\s+/g, '').toUpperCase();

    try {
      // Get access token
      const token = await this.getAccessToken();

      const response = await this.axiosInstance.get<MotHistoryData>(
        `/registration/${cleanedReg}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-API-Key': this.apiKey,
          },
        },
      );

      const motData = response.data;

      if (!motData) {
        return {
          success: false,
          data: null,
          message: 'Vehicle not found in DVLA database',
          vehicleStatus: VehicleStatus.UNKNOWN,
          checks: {
            hasMotHistory: false,
            latestTestPassed: false,
            motNotExpired: false,
            mileageIncreasing: false,
            noDangerousDefects: false,
            requiresMot: true,
            isExempt: false,
          },
        };
      }

      // Calculate vehicle age
      const vehicleAge = this.calculateVehicleAge(
        motData.firstUsedDate ||
          motData.registrationDate ||
          motData.manufactureDate,
      );

      // Determine vehicle status
      const vehicleStatus = this.determineVehicleStatus(vehicleAge);

      // Handle MOT exempt vehicles (40+ years old)
      if (vehicleStatus === VehicleStatus.MOT_EXEMPT) {
        const hasMotHistory = motData.motTests?.length > 0;
        const latestTest = hasMotHistory ? motData.motTests[0] : null;
        const hasValidVoluntaryMot =
          latestTest && new Date(latestTest.expiryDate) > new Date();

        // Check for dangerous defects if they have MOT history
        const hasDangerousDefects = latestTest?.defects?.some(
          (defect) => defect.type === 'DANGEROUS' || defect.type === 'MAJOR',
        );

        // Check mileage if they have history
        const mileageIncreasing = hasMotHistory
          ? this.checkMileageIncreasing(
              motData.motTests
                .map((t) => ({
                  date: t.completedDate,
                  mileage: parseInt(t.odometerValue, 10),
                }))
                .reverse(),
            )
          : true; // No history = can't check = pass

        // RISK ASSESSMENT FOR EXEMPT VEHICLES
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        let success: boolean;
        let message: string;
        let requiresAdminReview = false;

        // SCENARIO 1: Has valid voluntary MOT + no dangerous defects (BEST CASE)
        if (hasValidVoluntaryMot && !hasDangerousDefects && mileageIncreasing) {
          riskLevel = 'LOW';
          success = true;
          message = `Vehicle is ${vehicleAge} years old and MOT exempt, but has valid voluntary MOT until ${new Date(latestTest.expiryDate).toLocaleDateString('en-GB')}. Approved for driver use.`;
        }
        // SCENARIO 2: Has expired voluntary MOT but was clean (ACCEPTABLE)
        else if (
          hasMotHistory &&
          latestTest &&
          !hasDangerousDefects &&
          latestTest.testResult === 'PASSED' &&
          mileageIncreasing
        ) {
          riskLevel = 'MEDIUM';
          success = true;
          message = `Vehicle is ${vehicleAge} years old and MOT exempt. Last voluntary MOT was clean but expired. Consider getting updated voluntary MOT for safety verification.`;
        }
        // SCENARIO 3: Last MOT had dangerous defects (REJECT)
        else if (hasDangerousDefects) {
          riskLevel = 'HIGH';
          success = false;
          message = `Vehicle is MOT exempt but last MOT test revealed dangerous defects. These MUST be repaired before approval. Get voluntary MOT after repairs.`;
        }
        // SCENARIO 4: No MOT history ever (REQUIRES REVIEW)
        else if (!hasMotHistory) {
          riskLevel = 'HIGH';
          success = false;
          requiresAdminReview = true;
          message = `Vehicle is ${vehicleAge} years old and MOT exempt with NO MOT history. Please get voluntary MOT for safety verification, or admin will review manually.`;
        }
        // SCENARIO 5: Failed last MOT or mileage issues (REJECT)
        else {
          riskLevel = 'HIGH';
          success = false;
          message = `Vehicle is MOT exempt but ${!mileageIncreasing ? 'has mileage rollback' : 'failed last MOT'}. Please resolve issues and get voluntary MOT.`;
        }

        return {
          success,
          data: motData,
          message,
          vehicleStatus,
          riskLevel, // Risk level for frontend/admin
          requiresAdminReview, // Flag for manual review
          checks: {
            hasMotHistory,
            latestTestPassed:
              latestTest?.testResult === 'PASSED' || !hasMotHistory,
            motNotExpired: hasValidVoluntaryMot || !hasMotHistory, // Exempt so pass if no history
            mileageIncreasing,
            noDangerousDefects: !hasDangerousDefects,
            vehicleAge,
            requiresMot: false,
            isExempt: true,
          },
          latestTest: latestTest || undefined,
          mileageHistory: hasMotHistory
            ? motData.motTests
                .map((t) => ({
                  date: t.completedDate,
                  mileage: parseInt(t.odometerValue, 10),
                }))
                .reverse()
            : undefined,
        };
      }

      // Handle new vehicles (under 3 years old)
      if (vehicleStatus === VehicleStatus.NEW_VEHICLE) {
        return {
          success: true, // New vehicles are valid
          data: motData,
          message: `Vehicle is ${vehicleAge} year(s) old and does not require MOT yet. First MOT due at 3 years from first registration.`,
          vehicleStatus,
          checks: {
            hasMotHistory: false,
            latestTestPassed: true,
            motNotExpired: true,
            mileageIncreasing: true,
            noDangerousDefects: true,
            vehicleAge,
            requiresMot: false,
            isExempt: false,
          },
        };
      }

      // Vehicle requires MOT (3-40 years old)
      // Handle vehicles that should have MOT but don't (RED FLAG!)
      if (!motData.motTests || motData.motTests.length === 0) {
        return {
          success: false,
          data: motData,
          message: `WARNING: Vehicle is ${vehicleAge} years old and legally requires MOT, but has NO MOT history. This vehicle may be illegal to drive on public roads.`,
          vehicleStatus,
          checks: {
            hasMotHistory: false,
            latestTestPassed: false,
            motNotExpired: false,
            mileageIncreasing: false,
            noDangerousDefects: false,
            vehicleAge,
            requiresMot: true,
            isExempt: false,
          },
        };
      }

      // Get latest test (first in array)
      const latestTest = motData.motTests[0];

      // Extract mileage history
      const mileageHistory = motData.motTests
        .map((test) => ({
          date: test.completedDate,
          mileage: parseInt(test.odometerValue, 10),
        }))
        .reverse(); // Oldest to newest

      // Check if mileage is increasing (no rollback)
      const mileageIncreasing = this.checkMileageIncreasing(mileageHistory);

      // Check for dangerous defects in latest test
      const hasDangerousDefects = latestTest.defects?.some(
        (defect) => defect.type === 'DANGEROUS' || defect.type === 'MAJOR',
      );

      // Check for outstanding safety recalls
      const hasOutstandingRecall = motData.hasOutstandingRecall === 'Yes';

      // Check if MOT is not expired
      const motNotExpired = new Date(latestTest.expiryDate) > new Date();

      const checks = {
        hasMotHistory: true,
        latestTestPassed: latestTest.testResult === 'PASSED',
        motNotExpired,
        mileageIncreasing,
        noDangerousDefects: !hasDangerousDefects,
        noOutstandingRecalls: !hasOutstandingRecall,
        vehicleAge,
        requiresMot: true,
        isExempt: false,
      };

      // Build detailed message
      const failedChecks: string[] = [];
      if (!checks.latestTestPassed) failedChecks.push('Latest test failed');
      if (!checks.motNotExpired) {
        const expiryDate = new Date(latestTest.expiryDate).toLocaleDateString(
          'en-GB',
        );
        failedChecks.push(`MOT expired on ${expiryDate}`);
      }
      if (!checks.mileageIncreasing)
        failedChecks.push('Mileage rollback detected');
      if (!checks.noDangerousDefects)
        failedChecks.push('Dangerous defects present');
      if (!checks.noOutstandingRecalls)
        failedChecks.push('Outstanding safety recall - requires admin review');

      // Determine if admin review is needed (for recalls specifically)
      const requiresAdminReview =
        hasOutstandingRecall && checks.latestTestPassed && checks.motNotExpired;

      const allChecksPassed =
        checks.hasMotHistory &&
        checks.latestTestPassed &&
        checks.motNotExpired &&
        checks.mileageIncreasing &&
        checks.noDangerousDefects &&
        checks.noOutstandingRecalls;

      const message = allChecksPassed
        ? `All MOT checks passed. Vehicle has valid MOT until ${new Date(latestTest.expiryDate).toLocaleDateString('en-GB')}`
        : `MOT checks failed: ${failedChecks.join(', ')}`;

      return {
        success: allChecksPassed,
        data: motData,
        message,
        vehicleStatus,
        riskLevel: hasOutstandingRecall ? 'MEDIUM' : undefined,
        requiresAdminReview,
        checks,
        latestTest,
        mileageHistory,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            success: false,
            data: null,
            message:
              'Vehicle not found in MOT History database. Please check the registration number.',
            vehicleStatus: VehicleStatus.UNKNOWN,
            checks: {
              hasMotHistory: false,
              latestTestPassed: false,
              motNotExpired: false,
              mileageIncreasing: false,
              noDangerousDefects: false,
              requiresMot: true,
              isExempt: false,
            },
          };
        }

        console.error('MOT API error:', error.response?.data);
        throw new InternalServerErrorException(
          'Failed to retrieve MOT history. Please try again later.',
        );
      }

      console.error('MOT service error:', error);
      throw new InternalServerErrorException(
        'Failed to communicate with MOT service.',
      );
    }
  }

  /**
   * Determine vehicle status based on age
   * @param age - Vehicle age in years
   * @returns VehicleStatus enum
   */
  private determineVehicleStatus(age: number): VehicleStatus {
    if (age >= this.MOT_EXEMPT_AGE) {
      return VehicleStatus.MOT_EXEMPT;
    }
    if (age < this.MOT_AGE_THRESHOLD) {
      return VehicleStatus.NEW_VEHICLE;
    }
    if (age >= this.MOT_AGE_THRESHOLD && age < this.MOT_EXEMPT_AGE) {
      return VehicleStatus.REQUIRES_MOT;
    }
    return VehicleStatus.UNKNOWN;
  }

  /**
   * Calculate vehicle age in years
   * @param dateString - First used date or manufacture date
   * @returns Age in years
   */
  private calculateVehicleAge(dateString?: string): number {
    if (!dateString) {
      console.warn('No vehicle date available - assuming vehicle requires MOT');
      return 999; // Unknown age - assume old enough to require MOT
    }

    const vehicleDate = new Date(dateString);
    const today = new Date();
    const ageInMs = today.getTime() - vehicleDate.getTime();
    const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);

    return Math.floor(ageInYears);
  }

  /**
   * Check if mileage is consistently increasing
   * @param mileageHistory - Array of mileage records (oldest to newest)
   * @returns boolean
   */
  private checkMileageIncreasing(
    mileageHistory: Array<{ date: string; mileage: number }>,
  ): boolean {
    if (mileageHistory.length < 2) {
      return true; // Not enough data to check
    }

    for (let i = 1; i < mileageHistory.length; i++) {
      const previous = mileageHistory[i - 1].mileage;
      const current = mileageHistory[i].mileage;

      // Allow small decreases (up to 1000 miles) for reading errors
      if (current < previous - 1000) {
        console.warn(`Mileage rollback detected: ${previous} -> ${current}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a specific registration has valid MOT
   * Quick validation method for driver registration
   * @param registrationNumber - UK vehicle registration
   * @returns Simple yes/no with reason
   */
  async validateVehicleForDriver(registrationNumber: string): Promise<{
    isValid: boolean;
    reason: string;
    vehicleStatus: VehicleStatus;
  }> {
    const result = await this.getMotHistory(registrationNumber);

    return {
      isValid: result.success,
      reason: result.message,
      vehicleStatus: result.vehicleStatus,
    };
  }
}

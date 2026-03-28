import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { What3WordsService } from 'src/utility/what3words.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(ParkingSpace.name) private parkingSpaceModel: Model<ParkingSpaceDocument>,
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly what3wordsService: What3WordsService,
  ) {}

  /**
   * Search parking spaces by location query (postcode, town name, etc.)
   * Searches our own database — no external API.
   */
  async searchParkingSpaces(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const cleanQuery = query.trim();

      if (!cleanQuery) {
        return { success: false, message: 'Please enter a location or postcode to search' };
      }

      // Build a flexible search filter:
      // 1. Exact postcode match (case-insensitive)
      // 2. Town/name partial match (case-insensitive regex)
      const searchFilter = {
        isAvailable: true,
        $or: [
          { postCode: { $regex: new RegExp(`^${cleanQuery}`, 'i') } },
          { town: { $regex: new RegExp(cleanQuery, 'i') } },
          { name: { $regex: new RegExp(cleanQuery, 'i') } },
          { county: { $regex: new RegExp(cleanQuery, 'i') } },
          { nearestPlace: { $regex: new RegExp(cleanQuery, 'i') } },
        ],
      };

      const [spaces, total] = await Promise.all([
        this.parkingSpaceModel
          .find(searchFilter)
          .populate('owner', 'firstName lastName')
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .exec(),
        this.parkingSpaceModel.countDocuments(searchFilter).exec(),
      ]);

      if (spaces.length === 0) {
        return {
          success: true,
          data: [],
          message: `No parking spaces found near "${cleanQuery}"`,
        };
      }

      return {
        success: true,
        data: spaces,
        message: `Found ${total} parking space(s) near "${cleanQuery}"`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Search parking spaces near the user's GPS coordinates.
   * Uses what3words to get the nearest place name, then searches the database.
   */
  async searchParkingByLocation(
    lat: number,
    lng: number,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      // Step 1: Use what3words API to reverse-geocode coordinates
      const w3wResult = await this.what3wordsService.convertToThreeWordAddress(lat, lng);

      if (!w3wResult) {
        // Fallback: Try basic coordinate proximity search if we have parking spaces with coordinates
        return this.fallbackCoordinateSearch(lat, lng, page, limit);
      }

      const { words, nearestPlace, country } = w3wResult;

      // Step 2: Search parking spaces using the nearestPlace from what3words
      // Try multiple search strategies
      const searchFilter = {
        isAvailable: true,
        $or: [
          // Match by what3words address
          { what3words: words },
          // Match by nearest place name
          ...(nearestPlace ? [{ nearestPlace: { $regex: new RegExp(nearestPlace, 'i') } }] : []),
          // Match by town (nearestPlace often matches town)
          ...(nearestPlace ? [{ town: { $regex: new RegExp(nearestPlace.split(',')[0].trim(), 'i') } }] : []),
          // Match by county if nearestPlace includes it
          ...(nearestPlace && nearestPlace.includes(',')
            ? [{ county: { $regex: new RegExp(nearestPlace.split(',').pop()!.trim(), 'i') } }]
            : []),
          // Match by country
          ...(country ? [{ country: { $regex: new RegExp(country, 'i') } }] : []),
        ],
      };

      const skip = (page - 1) * limit;
      const [spaces, total] = await Promise.all([
        this.parkingSpaceModel
          .find(searchFilter)
          .populate('owner', 'firstName lastName')
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .exec(),
        this.parkingSpaceModel.countDocuments(searchFilter).exec(),
      ]);

      const locationLabel = nearestPlace || words;

      if (spaces.length === 0) {
        return {
          success: true,
          data: [],
          message: `No parking spaces found near "${locationLabel}"`,
          meta: {
            what3words: words,
            nearestPlace,
            country,
            coordinates: { lat, lng },
          },
        };
      }

      return {
        success: true,
        data: spaces,
        message: `Found ${total} parking space(s) near "${locationLabel}"`,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          what3words: words,
          nearestPlace,
          country,
          coordinates: { lat, lng },
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Location search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Fallback: Search by coordinate proximity when what3words is unavailable.
   * Looks for parking spaces within ~50km radius using simple bounding‐box math.
   */
  private async fallbackCoordinateSearch(
    lat: number,
    lng: number,
    page: number,
    limit: number,
  ): Promise<Response> {
    const skip = (page - 1) * limit;
    // ~0.45 degrees ≈ 50 km at equator
    const delta = 0.45;

    const searchFilter = {
      isAvailable: true,
      'coordinates.lat': { $gte: lat - delta, $lte: lat + delta },
      'coordinates.lng': { $gte: lng - delta, $lte: lng + delta },
    };

    const [spaces, total] = await Promise.all([
      this.parkingSpaceModel
        .find(searchFilter)
        .populate('owner', 'firstName lastName')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.parkingSpaceModel.countDocuments(searchFilter).exec(),
    ]);

    if (spaces.length === 0) {
      return {
        success: true,
        data: [],
        message: 'No parking spaces found near your location',
        meta: { coordinates: { lat, lng } },
      };
    }

    return {
      success: true,
      data: spaces,
      message: `Found ${total} parking space(s) near your location`,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        coordinates: { lat, lng },
      },
    };
  }

  /**
   * Search available drivers (chauffeurs for hire) by location.
   * Searches providers with role 'driver' who are verified and available.
   */
  async searchDrivers(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const cleanQuery = query.trim();

      if (!cleanQuery) {
        return { success: false, message: 'Please enter a location to search for drivers' };
      }

      // Find users who are drivers and match the location query
      const driverUsers = await this.userModel
        .find({
          role: 'driver',
          $or: [
            { postCode: { $regex: new RegExp(`^${cleanQuery}`, 'i') } },
            { 'address.town': { $regex: new RegExp(cleanQuery, 'i') } },
            { 'address.county': { $regex: new RegExp(cleanQuery, 'i') } },
          ],
        })
        .select('_id firstName lastName postCode address')
        .exec();

      if (driverUsers.length === 0) {
        return {
          success: true,
          data: [],
          message: `No drivers found near "${cleanQuery}"`,
        };
      }

      const driverUserIds = driverUsers.map((u: any) => u._id);

      // Find verified chauffeur records for those users
      const [drivers, total] = await Promise.all([
        this.chauffeurModel
          .find({
            user: { $in: driverUserIds },
            isVerified: true,
            isActive: true,
            availability: { $in: ['available'] },
          })
          .populate('user', 'firstName lastName postCode address phoneNumber')
          .skip(skip)
          .limit(limit)
          .exec(),
        this.chauffeurModel.countDocuments({
          user: { $in: driverUserIds },
          isVerified: true,
          isActive: true,
          availability: { $in: ['available'] },
        }).exec(),
      ]);

      return {
        success: true,
        data: drivers,
        message: drivers.length
          ? `Found ${total} driver(s) near "${cleanQuery}"`
          : `No available drivers near "${cleanQuery}"`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Search available taxis by location.
   * Searches providers with role 'taxi_driver' who are verified and available.
   */
  async searchTaxis(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const cleanQuery = query.trim();

      if (!cleanQuery) {
        return { success: false, message: 'Please enter a location to search for taxis' };
      }

      // Find users who are taxi drivers and match the location query
      const taxiUsers = await this.userModel
        .find({
          role: 'taxi_driver',
          $or: [
            { postCode: { $regex: new RegExp(`^${cleanQuery}`, 'i') } },
            { 'address.town': { $regex: new RegExp(cleanQuery, 'i') } },
            { 'address.county': { $regex: new RegExp(cleanQuery, 'i') } },
          ],
        })
        .select('_id firstName lastName postCode address')
        .exec();

      if (taxiUsers.length === 0) {
        return {
          success: true,
          data: [],
          message: `No taxis found near "${cleanQuery}"`,
        };
      }

      const taxiUserIds = taxiUsers.map((u: any) => u._id);

      const [taxis, total] = await Promise.all([
        this.taxiModel
          .find({
            user: { $in: taxiUserIds },
            isVerified: true,
            isActive: true,
          })
          .populate('user', 'firstName lastName postCode address phoneNumber')
          .skip(skip)
          .limit(limit)
          .exec(),
        this.taxiModel.countDocuments({
          user: { $in: taxiUserIds },
          isVerified: true,
          isActive: true,
        }).exec(),
      ]);

      return {
        success: true,
        data: taxis,
        message: taxis.length
          ? `Found ${total} taxi(s) near "${cleanQuery}"`
          : `No available taxis near "${cleanQuery}"`,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get a single parking space by ID (detail view)
   */
  async getParkingSpaceById(id: string): Promise<Response> {
    try {
      const space = await this.parkingSpaceModel
        .findById(id)
        .populate('owner', 'firstName lastName phoneNumber')
        .exec();

      if (!space) {
        return { success: false, message: 'Parking space not found' };
      }

      return { success: true, data: space, message: 'Parking space retrieved' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve parking space: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

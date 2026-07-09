import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { What3WordsService } from 'src/utility/what3words.service';

/** Escape special regex characters to prevent ReDoS attacks */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Great-circle distance between two coordinates in kilometres */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type NearbyProviderRecord = {
  _id: unknown;
  location?: { coordinates?: { lat?: number; lng?: number } };
  toObject?: () => Record<string, unknown>;
};

function rankProvidersByDistance<T extends NearbyProviderRecord>(
  providers: T[],
  lat: number,
  lng: number,
  radiusKm: number,
): Array<T & { distanceKm: number }> {
  return providers
    .map((provider) => {
      const coords = provider.location?.coordinates;
      if (coords?.lat == null || coords?.lng == null) {
        return null;
      }
      const distanceKm = haversineKm(lat, lng, coords.lat, coords.lng);
      if (distanceKm > radiusKm) {
        return null;
      }
      const base =
        typeof provider.toObject === 'function' ? (provider.toObject() as T) : provider;
      return { ...base, distanceKm };
    })
    .filter((item): item is T & { distanceKm: number } => item != null)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

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

      // Build a flexible search filter:
      const searchFilter: any = {
        isAvailable: true,
        isVerified: true, // Only show admin-approved parking spaces
      };

      if (cleanQuery) {
        const escaped = escapeRegex(cleanQuery);
        searchFilter.$or = [
          { postCode: { $regex: new RegExp(`^${escaped}`, 'i') } },
          { town: { $regex: new RegExp(escaped, 'i') } },
          { name: { $regex: new RegExp(escaped, 'i') } },
          { county: { $regex: new RegExp(escaped, 'i') } },
          { nearestPlace: { $regex: new RegExp(escaped, 'i') } },
        ];
      }

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
        isVerified: true,
        $or: [
          { what3words: words },
          ...(nearestPlace ? [{ nearestPlace: { $regex: new RegExp(escapeRegex(nearestPlace), 'i') } }] : []),
          ...(nearestPlace ? [{ town: { $regex: new RegExp(escapeRegex(nearestPlace.split(',')[0].trim()), 'i') } }] : []),
          ...(nearestPlace && nearestPlace.includes(',')
            ? [{ county: { $regex: new RegExp(escapeRegex(nearestPlace.split(',').pop()!.trim()), 'i') } }]
            : []),
          ...(country ? [{ country: { $regex: new RegExp(escapeRegex(country), 'i') } }] : []),
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
      isVerified: true, // Only show admin-approved parking spaces
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
   * Search available drivers (chauffeurs for hire) by location or driver number.
   */
  async searchDrivers(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const cleanQuery = query.trim();

      let filter: any = {
        isVerified: true,
        isActive: true,
      };

      if (cleanQuery) {
        const isDriverNumber = /^\d+$/.test(cleanQuery);
        
        if (isDriverNumber) {
          filter.driverNumber = cleanQuery.padStart(3, '0');
        } else {
          const escaped = escapeRegex(cleanQuery);
          const driverUsers = await this.userModel
            .find({
              role: 'driver',
              $or: [
                { postCode: { $regex: new RegExp(`^${escaped}`, 'i') } },
                { 'address.town': { $regex: new RegExp(escaped, 'i') } },
                { 'address.county': { $regex: new RegExp(escaped, 'i') } },
                { firstName: { $regex: new RegExp(escaped, 'i') } },
                { lastName: { $regex: new RegExp(escaped, 'i') } },
              ],
            })
            .select('_id')
            .exec();

          if (driverUsers.length === 0) {
            return {
              success: true,
              data: [],
              message: `No drivers found matching "${cleanQuery}"`,
            };
          }
          filter.user = { $in: driverUsers.map(u => u._id) };
        }
      }

      const [drivers, total] = await Promise.all([
        this.chauffeurModel
          .find(filter)
          .populate('user', 'firstName lastName postCode address phoneNumber')
          .skip(skip)
          .limit(limit)
          .exec(),
        this.chauffeurModel.countDocuments(filter).exec(),
      ]);

      return {
        success: true,
        data: drivers,
        message: drivers.length
          ? (cleanQuery ? `Found ${total} driver(s)` : `Loaded all ${total} driver(s)`)
          : (cleanQuery ? `No drivers found` : `No drivers available`),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async searchDriversByLocation(
    lat: number,
    lng: number,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const baseFilter = {
        status: 'approved',
        isVerified: true,
        isActive: true,
        availability: 'online',
        'location.coordinates.lat': { $exists: true, $ne: null },
        'location.coordinates.lng': { $exists: true, $ne: null },
      };

      const onlineDrivers = await this.chauffeurModel
        .find(baseFilter)
        .populate('user', 'firstName lastName postCode address phoneNumber')
        .exec();

      let ranked = rankProvidersByDistance(onlineDrivers, lat, lng, 25);
      if (ranked.length === 0) {
        ranked = rankProvidersByDistance(onlineDrivers, lat, lng, 50);
      }

      if (ranked.length > 0) {
        const total = ranked.length;
        const pageItems = ranked.slice(skip, skip + limit);
        return {
          success: true,
          data: pageItems,
          message: `Found ${total} chauffeur(s) nearby`,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            coordinates: { lat, lng },
            searchMode: 'gps',
          },
        };
      }

      return this.searchDriversByTownFallback(lat, lng, page, limit);
    } catch (error) {
      return { success: false, message: 'Location search failed' };
    }
  }

  private async searchDriversByTownFallback(
    lat: number,
    lng: number,
    page: number,
    limit: number,
  ): Promise<Response> {
    const skip = (page - 1) * limit;
    const w3wResult = await this.what3wordsService.convertToThreeWordAddress(lat, lng);
    if (!w3wResult || !w3wResult.nearestPlace) {
      return {
        success: true,
        data: [],
        message: 'No chauffeurs online nearby. Ask drivers to go online with location enabled.',
        meta: { coordinates: { lat, lng }, searchMode: 'town_fallback' },
      };
    }

    const nearestPlace = w3wResult.nearestPlace;
    const townMatch = escapeRegex(nearestPlace.split(',')[0].trim());

    const driverUsers = await this.userModel
      .find({
        role: 'driver',
        'address.town': { $regex: new RegExp(townMatch, 'i') },
      })
      .select('_id')
      .exec();

    if (driverUsers.length === 0) {
      return {
        success: true,
        data: [],
        message: `No chauffeurs online near ${townMatch}`,
        meta: { coordinates: { lat, lng }, searchMode: 'town_fallback' },
      };
    }

    const [drivers, total] = await Promise.all([
      this.chauffeurModel
        .find({
          user: { $in: driverUsers.map((u) => u._id) },
          status: 'approved',
          isVerified: true,
          isActive: true,
          availability: 'online',
        })
        .populate('user', 'firstName lastName postCode address phoneNumber')
        .skip(skip)
        .limit(limit)
        .exec(),
      this.chauffeurModel.countDocuments({
        user: { $in: driverUsers.map((u) => u._id) },
        status: 'approved',
        isVerified: true,
        isActive: true,
        availability: 'online',
      }).exec(),
    ]);

    return {
      success: true,
      data: drivers,
      message: drivers.length
        ? `Found ${total} chauffeur(s) near ${townMatch}`
        : `No chauffeurs online near ${townMatch}`,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        coordinates: { lat, lng },
        searchMode: 'town_fallback',
      },
    };
  }

  /**
   * Search available taxis by location or driver number.
   */
  async searchTaxis(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const cleanQuery = query.trim();

      let filter: any = {
        isVerified: true,
        isActive: true,
      };

      if (cleanQuery) {
        const isDriverNumber = /^\d+$/.test(cleanQuery);
        
        if (isDriverNumber) {
          filter.driverNumber = cleanQuery.padStart(3, '0');
        } else {
          const escaped = escapeRegex(cleanQuery);
          const taxiUsers = await this.userModel
            .find({
              role: 'taxi_driver',
              $or: [
                { postCode: { $regex: new RegExp(`^${escaped}`, 'i') } },
                { 'address.town': { $regex: new RegExp(escaped, 'i') } },
                { 'address.county': { $regex: new RegExp(escaped, 'i') } },
                { firstName: { $regex: new RegExp(escaped, 'i') } },
                { lastName: { $regex: new RegExp(escaped, 'i') } },
              ],
            })
            .select('_id')
            .exec();

          if (taxiUsers.length === 0) {
            return {
              success: true,
              data: [],
              message: `No taxis found matching "${cleanQuery}"`,
            };
          }
          filter.user = { $in: taxiUsers.map(u => u._id) };
        }
      }

      const [taxis, total] = await Promise.all([
        this.taxiModel
          .find(filter)
          .populate('user', 'firstName lastName postCode address phoneNumber')
          .skip(skip)
          .limit(limit)
          .exec(),
        this.taxiModel.countDocuments(filter).exec(),
      ]);

      return {
        success: true,
        data: taxis,
        message: taxis.length
          ? (cleanQuery ? `Found ${total} taxi(s)` : `Loaded all ${total} taxi(s)`)
          : (cleanQuery ? `No taxis found` : `No taxis available`),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async searchTaxisByLocation(
    lat: number,
    lng: number,
    page = 1,
    limit = 20,
  ): Promise<Response> {
    try {
      const skip = (page - 1) * limit;
      const baseFilter = {
        status: 'approved',
        isVerified: true,
        isActive: true,
        availability: 'online',
        'location.coordinates.lat': { $exists: true, $ne: null },
        'location.coordinates.lng': { $exists: true, $ne: null },
      };

      const onlineTaxis = await this.taxiModel
        .find(baseFilter)
        .populate('user', 'firstName lastName postCode address phoneNumber')
        .exec();

      let ranked = rankProvidersByDistance(onlineTaxis, lat, lng, 25);
      if (ranked.length === 0) {
        ranked = rankProvidersByDistance(onlineTaxis, lat, lng, 50);
      }

      if (ranked.length > 0) {
        const total = ranked.length;
        const pageItems = ranked.slice(skip, skip + limit);
        return {
          success: true,
          data: pageItems,
          message: `Found ${total} taxi(s) nearby`,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            coordinates: { lat, lng },
            searchMode: 'gps',
          },
        };
      }

      return this.searchTaxisByTownFallback(lat, lng, page, limit);
    } catch (error) {
      return { success: false, message: 'Location search failed' };
    }
  }

  private async searchTaxisByTownFallback(
    lat: number,
    lng: number,
    page: number,
    limit: number,
  ): Promise<Response> {
    const skip = (page - 1) * limit;
    const w3wResult = await this.what3wordsService.convertToThreeWordAddress(lat, lng);
    if (!w3wResult || !w3wResult.nearestPlace) {
      return {
        success: true,
        data: [],
        message: 'No taxis online nearby. Ask drivers to go online with location enabled.',
        meta: { coordinates: { lat, lng }, searchMode: 'town_fallback' },
      };
    }

    const nearestPlace = w3wResult.nearestPlace;
    const townMatch = escapeRegex(nearestPlace.split(',')[0].trim());

    const taxiUsers = await this.userModel
      .find({
        role: 'taxi_driver',
        'address.town': { $regex: new RegExp(townMatch, 'i') },
      })
      .select('_id')
      .exec();

    if (taxiUsers.length === 0) {
      return {
        success: true,
        data: [],
        message: `No taxis online near ${townMatch}`,
        meta: { coordinates: { lat, lng }, searchMode: 'town_fallback' },
      };
    }

    const [taxis, total] = await Promise.all([
      this.taxiModel
        .find({
          user: { $in: taxiUsers.map((u) => u._id) },
          status: 'approved',
          isVerified: true,
          isActive: true,
          availability: 'online',
        })
        .populate('user', 'firstName lastName postCode address phoneNumber')
        .skip(skip)
        .limit(limit)
        .exec(),
      this.taxiModel.countDocuments({
        user: { $in: taxiUsers.map((u) => u._id) },
        status: 'approved',
        isVerified: true,
        isActive: true,
        availability: 'online',
      }).exec(),
    ]);

    return {
      success: true,
      data: taxis,
      message: taxis.length
        ? `Found ${total} taxi(s) near ${townMatch}`
        : `No taxis online near ${townMatch}`,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        coordinates: { lat, lng },
        searchMode: 'town_fallback',
      },
    };
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

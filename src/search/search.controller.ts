import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { RoutesService } from './routes.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { ReviewsService } from 'src/reviews/reviews.service';
import { Response } from 'src/common/interfaces/response.interface';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly reviewsService: ReviewsService,
    private readonly routesService: RoutesService,
  ) {}

  /**
   * GET /search/route?fromLat=..&fromLng=..&toLat=..&toLng=..
   * Driving route polyline + distance/duration for the in-app maps.
   */
  @Get('route')
  @UseGuards(AuthGuard)
  async getRoute(
    @Query('fromLat') fromLat: string,
    @Query('fromLng') fromLng: string,
    @Query('toLat') toLat: string,
    @Query('toLng') toLng: string,
  ): Promise<Response> {
    const values = [fromLat, fromLng, toLat, toLng].map((v) => parseFloat(v));
    const valid =
      values.every((v) => Number.isFinite(v)) &&
      Math.abs(values[0]) <= 90 &&
      Math.abs(values[2]) <= 90 &&
      Math.abs(values[1]) <= 180 &&
      Math.abs(values[3]) <= 180;
    if (!valid) {
      throw new HttpException(
        { message: 'fromLat, fromLng, toLat and toLng must be valid coordinates' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const [fLat, fLng, tLat, tLng] = values;
    const route = await this.routesService.getDrivingRoute(
      { lat: fLat, lng: fLng },
      { lat: tLat, lng: tLng },
    );
    return { success: true, data: route, message: 'Route calculated' };
  }

  private async withRatings(
    serviceType: 'parking' | 'driver' | 'taxi',
    result: Response,
  ): Promise<Response> {
    if (!result?.success || result.data == null) return result;
    if (Array.isArray(result.data)) {
      return {
        ...result,
        data: await this.reviewsService.decorateListings(serviceType, result.data),
      };
    }
    const [item] = await this.reviewsService.decorateListings(serviceType, [
      result.data,
    ]);
    return { ...result, data: item };
  }

  /**
   * GET /search/parking?q=bournemouth&page=1&limit=10
   * Searches parking spaces from the database by location/postcode
   */
  @Get('parking')
  async searchParking(
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      throw new HttpException(
        { message: 'Search query (q) is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.withRatings(
      'parking',
      await this.searchService.searchParkingSpaces(
        query,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  /**
   * GET /search/parking/nearby?lat=51.521&lng=-0.203&page=1&limit=10
   * Searches parking spaces near the user's GPS coordinates using what3words
   */
  @Get('parking/nearby')
  async searchParkingNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!lat || !lng) {
      throw new HttpException(
        { message: 'Both lat and lng query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new HttpException(
        { message: 'lat and lng must be valid numbers' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.withRatings(
      'parking',
      await this.searchService.searchParkingByLocation(
        parsedLat,
        parsedLng,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  /**
   * GET /search/drivers?q=london&page=1&limit=10
   * Searches available drivers from the database by location
   */
  @Get('drivers')
  async searchDrivers(
    @Query('q') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const q = query || '';

    return this.withRatings(
      'driver',
      await this.searchService.searchDrivers(
        q,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  @Get('drivers/nearby')
  async searchDriversNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!lat || !lng) {
      throw new HttpException(
        { message: 'Both lat and lng query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new HttpException(
        { message: 'lat and lng must be valid numbers' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.withRatings(
      'driver',
      await this.searchService.searchDriversByLocation(
        parsedLat,
        parsedLng,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  /**
   * GET /search/taxis?q=manchester&page=1&limit=10
   * Searches available taxis from the database by location
   */
  @Get('taxis')
  async searchTaxis(
    @Query('q') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const q = query || '';

    return this.withRatings(
      'taxi',
      await this.searchService.searchTaxis(
        q,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  @Get('taxis/nearby')
  async searchTaxisNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!lat || !lng) {
      throw new HttpException(
        { message: 'Both lat and lng query parameters are required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new HttpException(
        { message: 'lat and lng must be valid numbers' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.withRatings(
      'taxi',
      await this.searchService.searchTaxisByLocation(
        parsedLat,
        parsedLng,
        parseInt(page || '1', 10),
        parseInt(limit || '20', 10),
      ),
    );
  }

  /**
   * GET /search/parking/:id
   * Get detailed information about a specific parking space
   */
  @Get('parking/:id')
  async getParkingDetail(@Param('id') id: string) {
    const result = await this.searchService.getParkingSpaceById(id);
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.withRatings('parking', result);
  }
}

import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

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

    return this.searchService.searchParkingSpaces(
      query,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
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

    return this.searchService.searchParkingByLocation(
      parsedLat,
      parsedLng,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  /**
   * GET /search/drivers?q=london&page=1&limit=10
   * Searches available drivers from the database by location
   */
  @Get('drivers')
  async searchDrivers(
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

    return this.searchService.searchDrivers(
      query,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  /**
   * GET /search/taxis?q=manchester&page=1&limit=10
   * Searches available taxis from the database by location
   */
  @Get('taxis')
  async searchTaxis(
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

    return this.searchService.searchTaxis(
      query,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
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
    return result;
  }
}

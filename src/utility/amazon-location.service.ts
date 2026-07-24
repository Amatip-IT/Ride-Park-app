import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
  municipality?: string;
  postalCode?: string;
  country?: string;
}

@Injectable()
export class AmazonLocationService {
  private readonly logger = new Logger(AmazonLocationService.name);
  private readonly apiKey: string;
  private readonly region: string;
  private readonly placeIndex: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AWS_LOCATION_KEY') || '';
    this.region = this.configService.get<string>('AWS_REGION') || 'eu-west-2';
    this.placeIndex =
      this.configService.get<string>('AWS_PLACE_INDEX') || 'AmatipPlaceIndex';

    if (!this.apiKey) {
      this.logger.warn(
        'AWS_LOCATION_KEY is not set — address geocoding will be limited',
      );
    }
  }

  /**
   * Forward-geocode a free-text address using Amazon Location Service.
   */
  async searchByText(
    query: string,
    options?: { biasPosition?: { lat: number; lng: number } },
  ): Promise<GeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return null;
    if (!this.apiKey) return null;

    const endpoint = `https://places.geo.${this.region}.amazonaws.com/places/v0/indexes/${this.placeIndex}/search/text?key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      Text: trimmed,
      MaxResults: 1,
    };

    if (options?.biasPosition) {
      body.BiasPosition = [options.biasPosition.lng, options.biasPosition.lat];
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        this.logger.warn(
          `Amazon Location text search failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();
      const place = data?.Results?.[0]?.Place;
      const point = place?.Geometry?.Point;

      if (!place || !point?.[0] || !point?.[1]) return null;

      return {
        lat: point[1],
        lng: point[0],
        label: place.Label || trimmed,
        municipality: place.Municipality,
        postalCode: place.PostalCode,
        country: place.Country,
      };
    } catch (error) {
      this.logger.warn(
        `Amazon Location text search error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Build a geocoding query from address parts and resolve coordinates.
   */
  async geocodeAddressParts(
    address?: string,
    postcode?: string,
    options?: { biasPosition?: { lat: number; lng: number } },
  ): Promise<GeocodeResult | null> {
    const parts = [address, postcode].filter(Boolean).map((p) => p!.trim());
    if (parts.length === 0) return null;
    return this.searchByText(parts.join(', '), options);
  }
}

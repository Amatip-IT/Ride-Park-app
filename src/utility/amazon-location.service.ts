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

  /** Fallback bias when GPS is unavailable (central London). */
  private readonly defaultBias: [number, number] = [-0.1278, 51.5074];

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AWS_LOCATION_KEY') || '';
    // Places API v2 keys for this project are authorized in us-east-1
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';

    if (!this.apiKey) {
      this.logger.warn(
        'AWS_LOCATION_KEY is not set — address geocoding will be limited',
      );
    }
  }

  private placesBaseUrl() {
    return `https://places.geo.${this.region}.amazonaws.com`;
  }

  /**
   * Forward-geocode a free-text address using Amazon Location Places API v2.
   */
  async searchByText(
    query: string,
    options?: { biasPosition?: { lat: number; lng: number } },
  ): Promise<GeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return null;
    if (!this.apiKey) return null;

    const endpoint = `${this.placesBaseUrl()}/v2/search-text?key=${this.apiKey}`;
    const bias: [number, number] =
      options?.biasPosition?.lat != null && options?.biasPosition?.lng != null
        ? [options.biasPosition.lng, options.biasPosition.lat]
        : this.defaultBias;

    const body: Record<string, unknown> = {
      QueryText: trimmed,
      MaxResults: 1,
      BiasPosition: bias,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.logger.warn(
          `Amazon Location text search failed: ${response.status} ${response.statusText} ${errText.slice(0, 180)}`,
        );
        return null;
      }

      const data = await response.json();
      const item = data?.ResultItems?.[0];
      const position = item?.Position; // [lng, lat]
      if (!item || !Array.isArray(position) || position.length < 2) return null;

      const address = item.Address || {};
      return {
        lat: position[1],
        lng: position[0],
        label: address.Label || item.Title || trimmed,
        municipality: address.Locality,
        postalCode: address.PostalCode,
        country: address.Country?.Name || address.Country?.Code3,
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

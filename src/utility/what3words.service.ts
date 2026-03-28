import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface W3WConvertResult {
  words: string;
  nearestPlace: string;
  country: string;
  coordinates: { lat: number; lng: number };
}

@Injectable()
export class What3WordsService {
  private readonly logger = new Logger(What3WordsService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.what3words.com/v3';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('WHAT3WORDS_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('WHAT3WORDS_API_KEY is not set — location features will be limited');
    }
  }

  /**
   * Convert lat/lng coordinates to a what3words address.
   * Returns the 3-word address, nearest place, country, and coordinates.
   */
  async convertToThreeWordAddress(lat: number, lng: number): Promise<W3WConvertResult | null> {
    if (!this.apiKey) return null;

    try {
      const url = `${this.baseUrl}/convert-to-3wa?key=${this.apiKey}&coordinates=${lat}%2C${lng}&language=en&format=json`;
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(`what3words API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      if (data.error) {
        this.logger.error(`what3words API error: ${data.error.code} — ${data.error.message}`);
        return null;
      }

      return {
        words: data.words,
        nearestPlace: data.nearestPlace,
        country: data.country,
        coordinates: { lat: data.coordinates.lat, lng: data.coordinates.lng },
      };
    } catch (error) {
      this.logger.error(`Failed to call what3words API: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Convert a what3words address back to coordinates.
   */
  async convertToCoordinates(words: string): Promise<W3WConvertResult | null> {
    if (!this.apiKey) return null;

    try {
      const cleanWords = words.replace(/^\/\/\//, ''); // Remove leading ///
      const url = `${this.baseUrl}/convert-to-coordinates?key=${this.apiKey}&words=${encodeURIComponent(cleanWords)}&format=json`;
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(`what3words API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      if (data.error) {
        this.logger.error(`what3words API error: ${data.error.code} — ${data.error.message}`);
        return null;
      }

      return {
        words: data.words,
        nearestPlace: data.nearestPlace,
        country: data.country,
        coordinates: { lat: data.coordinates.lat, lng: data.coordinates.lng },
      };
    } catch (error) {
      this.logger.error(`Failed to call what3words API: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}

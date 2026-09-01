import axios from 'axios';

const AWS_API_KEY = process.env.EXPO_PUBLIC_AWS_LOCATION_KEY;
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'eu-west-2';
const AWS_PLACE_INDEX = process.env.EXPO_PUBLIC_AWS_PLACE_INDEX || 'AmatipPlaceIndex';

export interface PlaceSuggestion {
  label: string;
  addressNumber?: string;
  street?: string;
  neighborhood?: string;
  municipality?: string;
  postalCode?: string;
  country?: string;
  point?: { lat: number; lng: number };
}

export interface LocationSearchOptions {
  /** Bias results toward this position (user's GPS). */
  biasPosition?: { lat: number; lng: number };
  /** ISO 3166-1 alpha-3 country codes, e.g. ['GBR', 'NGA']. Omit for worldwide. */
  filterCountries?: string[];
  maxResults?: number;
}

/**
 * Searches for places by text using Amazon Location Service.
 * Results are biased toward the user's position when provided.
 */
export const searchLocationByText = async (
  query: string,
  options: LocationSearchOptions = {},
): Promise<PlaceSuggestion[]> => {
  if (!AWS_API_KEY) {
    console.warn('Amazon Location Service API key is missing.');
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const endpoint = `https://places.geo.${AWS_REGION}.amazonaws.com/places/v0/indexes/${AWS_PLACE_INDEX}/search/text?key=${AWS_API_KEY}`;

  const body: Record<string, unknown> = {
    Text: trimmed,
    MaxResults: options.maxResults ?? 8,
  };

  if (options.biasPosition) {
    body.BiasPosition = [options.biasPosition.lng, options.biasPosition.lat];
  }

  if (options.filterCountries?.length) {
    body.FilterCountries = options.filterCountries;
  }

  try {
    const response = await axios.post(endpoint, body, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data?.Results) {
      return response.data.Results.map((result: any) => ({
        label: result.Place.Label,
        addressNumber: result.Place.AddressNumber,
        street: result.Place.Street,
        neighborhood: result.Place.Neighborhood,
        municipality: result.Place.Municipality,
        postalCode: result.Place.PostalCode,
        country: result.Place.Country,
        point: {
          lng: result.Place.Geometry?.Point?.[0],
          lat: result.Place.Geometry?.Point?.[1],
        },
      }));
    }
    return [];
  } catch (error: any) {
    if (error.response?.status === 403) {
      console.warn('Amazon Location Service: Forbidden. Check API key and Place Index name.');
    } else {
      console.error('Amazon Location search failed:', error.response?.data || error.message);
    }
    return [];
  }
};

export interface ReverseGeocodeResult {
  label: string;
  addressNumber?: string;
  street?: string;
  neighborhood?: string;
  municipality?: string;
  postalCode?: string;
  country?: string;
  point?: { lat: number; lng: number };
}

/**
 * Reverse geocodes coordinates using Amazon Location Service,
 * with automatic fallback to expo-location's device geocoder.
 */
export const searchLocationByPosition = async (lat: number, lng: number): Promise<ReverseGeocodeResult | null> => {
  // Try Amazon Location first (if configured)
  if (AWS_API_KEY) {
    try {
      const endpoint = `https://places.geo.${AWS_REGION}.amazonaws.com/places/v0/indexes/${AWS_PLACE_INDEX}/search/position?key=${AWS_API_KEY}`;
      const response = await axios.post(
        endpoint,
        { Position: [lng, lat], MaxResults: 1 },
        { headers: { 'Content-Type': 'application/json' } },
      );

      if (response.data?.Results?.length > 0) {
        const place = response.data.Results[0].Place;
        return {
          label: place.Label,
          addressNumber: place.AddressNumber,
          street: place.Street,
          neighborhood: place.Neighborhood,
          municipality: place.Municipality,
          postalCode: place.PostalCode,
          country: place.Country,
          point: { lat, lng },
        };
      }
    } catch (error: any) {
      console.warn('Amazon Location reverse-geocode failed, trying device geocoder:', error.message);
    }
  }

  // Fallback: use device's native reverse geocoder (Apple Maps / Google)
  try {
    const Location = await import('expo-location');
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });

    if (results && results.length > 0) {
      const geo = results[0];
      const streetParts = [geo.streetNumber, geo.street].filter(Boolean).join(' ');
      const label = [streetParts, geo.city, geo.region, geo.postalCode, geo.country]
        .filter(Boolean)
        .join(', ');

      return {
        label,
        addressNumber: geo.streetNumber || undefined,
        street: geo.street || undefined,
        neighborhood: geo.district || undefined,
        municipality: geo.city || undefined,
        postalCode: geo.postalCode || undefined,
        country: geo.country || undefined,
        point: { lat, lng },
      };
    }
  } catch (fallbackErr: any) {
    console.error('Device reverse-geocode also failed:', fallbackErr.message);
  }

  return null;
};

export default {
  searchLocationByText,
  searchLocationByPosition,
};

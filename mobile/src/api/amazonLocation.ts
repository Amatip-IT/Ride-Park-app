import axios from 'axios';

const AWS_API_KEY = process.env.EXPO_PUBLIC_AWS_LOCATION_KEY;
/** Places API keys are regional — this project key is authorized in us-east-1. */
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1';

/** Fallback bias when GPS is unavailable (central London). Suggest/search-text require a bias. */
const DEFAULT_BIAS: [number, number] = [-0.1278, 51.5074];

export interface PlaceSuggestion {
  label: string;
  placeId?: string;
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

function placesBaseUrl() {
  return `https://places.geo.${AWS_REGION}.amazonaws.com`;
}

function biasLngLat(options: LocationSearchOptions): [number, number] {
  if (options.biasPosition?.lat != null && options.biasPosition?.lng != null) {
    return [options.biasPosition.lng, options.biasPosition.lat];
  }
  return DEFAULT_BIAS;
}

function mapResultItem(item: any): PlaceSuggestion {
  const address = item.Address || {};
  const position = item.Position; // [lng, lat]
  return {
    label: address.Label || item.Title || '',
    placeId: item.PlaceId,
    addressNumber: address.AddressNumber,
    street: address.Street,
    neighborhood: address.District || address.Neighborhood,
    municipality: address.Locality || address.Municipality,
    postalCode: address.PostalCode,
    country: address.Country?.Name || address.Country?.Code3 || address.Country,
    point:
      Array.isArray(position) && position.length >= 2
        ? { lng: position[0], lat: position[1] }
        : undefined,
  };
}

/**
 * Resolve full place details (including coordinates) by PlaceId.
 */
export const getPlaceById = async (placeId: string): Promise<PlaceSuggestion | null> => {
  if (!AWS_API_KEY || !placeId) return null;
  try {
    const endpoint = `${placesBaseUrl()}/v2/place/${encodeURIComponent(placeId)}?key=${AWS_API_KEY}`;
    const response = await axios.get(endpoint);
    return mapResultItem(response.data);
  } catch (error: any) {
    console.error('Amazon Location getPlace failed:', error.response?.data || error.message);
    return null;
  }
};

/**
 * Searches for places by text using Amazon Location Places API v2.
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

  const endpoint = `${placesBaseUrl()}/v2/search-text?key=${AWS_API_KEY}`;
  const body: Record<string, unknown> = {
    QueryText: trimmed,
    MaxResults: options.maxResults ?? 8,
    BiasPosition: biasLngLat(options),
  };

  if (options.filterCountries?.length) {
    body.Filter = { IncludeCountries: options.filterCountries };
  }

  try {
    const response = await axios.post(endpoint, body, {
      headers: { 'Content-Type': 'application/json' },
    });

    const items = response.data?.ResultItems;
    if (!Array.isArray(items)) return [];
    return items.map(mapResultItem).filter((p: PlaceSuggestion) => !!p.label);
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 403 || status === 401) {
      console.warn(
        'Amazon Location Service: unauthorized. Check API key, region (us-east-1), and Places API v2 permissions.',
      );
    } else {
      console.error('Amazon Location search failed:', error.response?.data || error.message);
    }
    return [];
  }
};

export interface ReverseGeocodeResult {
  label: string;
  placeId?: string;
  addressNumber?: string;
  street?: string;
  neighborhood?: string;
  municipality?: string;
  postalCode?: string;
  country?: string;
  point?: { lat: number; lng: number };
}

/**
 * Reverse geocodes coordinates using Amazon Location Places API v2,
 * with automatic fallback to expo-location's device geocoder.
 */
export const searchLocationByPosition = async (
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> => {
  if (AWS_API_KEY) {
    try {
      const endpoint = `${placesBaseUrl()}/v2/reverse-geocode?key=${AWS_API_KEY}`;
      const response = await axios.post(
        endpoint,
        { QueryPosition: [lng, lat], MaxResults: 1 },
        { headers: { 'Content-Type': 'application/json' } },
      );

      const item = response.data?.ResultItems?.[0];
      if (item) {
        const mapped = mapResultItem(item);
        return { ...mapped, point: mapped.point || { lat, lng } };
      }
    } catch (error: any) {
      console.warn(
        'Amazon Location reverse-geocode failed, trying device geocoder:',
        error.response?.data || error.message,
      );
    }
  }

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

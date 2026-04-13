import axios from 'axios';

const AWS_API_KEY = process.env.EXPO_PUBLIC_AWS_LOCATION_KEY;
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'eu-west-2';
// We assume default names if not provided, but they should be configured in .env
const AWS_PLACE_INDEX = process.env.EXPO_PUBLIC_AWS_PLACE_INDEX || 'AmatipPlaceIndex';

/**
 * Searches for a place by text using Amazon Location Service REST API via API Key.
 * @param query The text to search for (e.g. "Waterloo Station", "SW1A 1AA")
 * @returns Array of place results
 */
export const searchLocationByText = async (query: string) => {
  if (!AWS_API_KEY) {
    console.warn('Amazon Location Service API key is missing.');
    return [];
  }

  const endpoint = `https://places.geo.${AWS_REGION}.amazonaws.com/places/v0/indexes/${AWS_PLACE_INDEX}/search/text?key=${AWS_API_KEY}`;

  try {
    const response = await axios.post(
      endpoint,
      {
        Text: query,
        MaxResults: 5,
        FilterCountries: ['GBR'], // Restrict to UK
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && response.data.Results) {
      return response.data.Results.map((result: any) => ({
        label: result.Place.Label,
        addressNumber: result.Place.AddressNumber,
        street: result.Place.Street,
        neighborhood: result.Place.Neighborhood,
        municipality: result.Place.Municipality, // Usually Town/City
        postalCode: result.Place.PostalCode,
        country: result.Place.Country,
        point: {
          lng: result.Place.Geometry?.Point?.[0], // Longitude is first
          lat: result.Place.Geometry?.Point?.[1], // Latitude is second
        },
      }));
    }
    return [];
  } catch (error: any) {
    if (error.response?.status === 403) {
      console.warn('Amazon Location Service: Forbidden. Please check if your API Key and Place Index name are correct.');
    } else {
      console.error('Amazon Location search failed:', error.response?.data || error.message);
    }
    return [];
  }
};

/**
 * Reverse geocodes coordinates to find an address using Amazon Location Service.
 */
export const searchLocationByPosition = async (lat: number, lng: number) => {
  if (!AWS_API_KEY) {
    console.warn('Amazon Location Service API key is missing.');
    return null;
  }

  const endpoint = `https://places.geo.${AWS_REGION}.amazonaws.com/places/v0/indexes/${AWS_PLACE_INDEX}/search/position?key=${AWS_API_KEY}`;

  try {
    const response = await axios.post(
      endpoint,
      {
        Position: [lng, lat],
        MaxResults: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && response.data.Results && response.data.Results.length > 0) {
      const place = response.data.Results[0].Place;
      return {
        label: place.Label,
        municipality: place.Municipality,
        postalCode: place.PostalCode,
      };
    }
    return null;
  } catch (error: any) {
    console.error('Amazon Location reverse-geocode failed:', error.response?.data || error.message);
    return null;
  }
};

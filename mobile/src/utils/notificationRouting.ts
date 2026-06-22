import { navigate } from '@/navigation/navigationRef';

type NotificationData = Record<string, any> | undefined;

/**
 * Navigate based on push/in-app notification payload.
 */
export function handleNotificationNavigation(
  type?: string,
  data?: NotificationData,
) {
  if (!data) return;

  const bookingId = data.bookingId as string | undefined;
  const rideId = data.rideId as string | undefined;
  const requestId = data.requestId as string | undefined;
  const serviceType = data.serviceType as string | undefined;

  switch (type) {
    case 'booking':
      if (bookingId) {
        if (serviceType === 'parking' || serviceType === 'driver') {
          navigate('ConsumerApp', {
            screen: 'TripReceipt',
            params: { bookingId },
          });
        } else {
          navigate('ConsumerApp', {
            screen: 'ConsumerTabs',
            params: { screen: 'Bookings' },
          });
        }
      } else {
        navigate('ConsumerApp', {
          screen: 'ConsumerTabs',
          params: { screen: 'Bookings' },
        });
      }
      break;

    case 'ride':
    case 'payment': {
      const id = requestId || rideId;
      if (id) {
        navigate('ConsumerApp', {
          screen: 'PassengerTracking',
          params: { requestId: id },
        });
      }
      break;
    }

    case 'dispute':
      navigate('Disputes');
      break;

    case 'system':
      navigate('Notifications');
      break;

    default:
      navigate('Notifications');
      break;
  }
}

// Stub for @stripe/stripe-react-native on web platform
// These features are not supported on web
module.exports = {
  StripeProvider: ({ children }) => children,
  useStripe: () => ({}),
  CardField: () => null,
  usePaymentSheet: () => ({ initPaymentSheet: async () => {}, presentPaymentSheet: async () => {} }),
};

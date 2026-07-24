import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ridesApi, taxiBookingsApi, bookingsApi } from '@/api';
import { formatCurrency, formatDate, getApiErrorMessage } from '@/utils/helpers';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type ParamList = {
  TripReceipt: { requestId?: string; rideId?: string; bookingId?: string };
};

type ReceiptData = {
  rideId?: string;
  bookingId?: string;
  requestId?: string;
  role: 'passenger' | 'driver' | 'provider';
  serviceType: string;
  serviceName?: string;
  completedAt?: string;
  startedAt?: string;
  startDate?: string;
  endDate?: string;
  requester?: { name?: string; email?: string };
  provider?: { name?: string; email?: string };
  passenger?: { name?: string; email?: string };
  driver?: { name?: string; email?: string };
  quotedPrice?: number;
  pricingUnit?: string;
  pickup?: { address?: string; lat?: number; lng?: number };
  dropoff?: { address?: string; lat?: number; lng?: number };
  distanceMiles?: number;
  durationMinutes?: number;
  distanceCost?: number;
  timeCost?: number;
  totalCost?: number;
  ratePerMile?: number;
  ratePerMinute?: number;
  paymentStatus?: string;
  paymentNote?: string;
  vehicle?: {
    make?: string;
    model?: string;
    color?: string;
    plateNumber?: string;
  } | null;
  estimatedCost?: number;
};

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReceiptHtml(receipt: ReceiptData, isBookingReceipt: boolean): string {
  const total = formatCurrency(receipt.totalCost ?? receipt.quotedPrice ?? receipt.estimatedCost ?? 0);
  const receiptRef = (receipt.bookingId || receipt.rideId || receipt.requestId || '').slice(-8).toUpperCase();
  const title = isBookingReceipt ? 'Booking Receipt' : 'Trip Receipt';

  const vehicleLine = receipt.vehicle
    ? [receipt.vehicle.color, receipt.vehicle.make, receipt.vehicle.model, receipt.vehicle.plateNumber ? `(${receipt.vehicle.plateNumber})` : '']
        .filter(Boolean)
        .join(' ')
    : null;

  const rows: string[] = [];

  const addRow = (label: string, value?: string | number | null) => {
    if (value == null || value === '') return;
    rows.push(`<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`);
  };

  if (receipt.completedAt) addRow('Completed', formatDate(receipt.completedAt));
  if (receipt.startedAt) addRow('Started', formatDate(receipt.startedAt));
  if (receipt.startDate) addRow('Start', formatDate(receipt.startDate));
  if (receipt.endDate) addRow('End', formatDate(receipt.endDate));
  if (receipt.serviceName) addRow('Service', receipt.serviceName);

  if (!isBookingReceipt) {
    addRow('Pickup', receipt.pickup?.address || 'Pickup location');
    addRow('Drop-off', receipt.dropoff?.address || 'Destination');
  }

  if (vehicleLine) addRow('Vehicle', vehicleLine);

  if (!isBookingReceipt && receipt.distanceMiles != null) {
    addRow('Distance', `${receipt.distanceMiles.toFixed(2)} mi`);
  }
  if (!isBookingReceipt && receipt.durationMinutes != null) {
    addRow('Duration', `${Math.round(receipt.durationMinutes)} min`);
  }
  if (!isBookingReceipt && receipt.distanceCost != null) {
    addRow('Distance charge', formatCurrency(receipt.distanceCost));
  }
  if (!isBookingReceipt && receipt.timeCost != null) {
    addRow('Time charge', formatCurrency(receipt.timeCost));
  }
  if (isBookingReceipt && receipt.quotedPrice != null) {
    const unit = receipt.pricingUnit === 'per_hour' ? ' / hour' : receipt.pricingUnit === 'per_day' ? ' / day' : '';
    addRow('Rate', `${formatCurrency(receipt.quotedPrice)}${unit}`);
  }
  addRow('Total', total);

  if (isBookingReceipt) {
    addRow('Customer', receipt.requester?.name || '—');
    addRow('Provider', receipt.provider?.name || '—');
  } else {
    addRow('Passenger', (receipt as any).passenger?.name || '—');
    addRow('Driver', (receipt as any).driver?.name || '—');
  }

  if (receipt.paymentNote) addRow('Payment', receipt.paymentNote);

  return `<html><head><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a}
    h1{color:#00B4A0;margin-bottom:4px}
    .subtitle{color:#666;margin-bottom:20px}
    .total{font-size:28px;font-weight:bold;color:#00B4A0;margin:16px 0}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:14px}
    th{background:#00B4A0;color:#fff}
    .footer{margin-top:32px;color:#999;font-size:12px}
  </style></head><body>
    <h1>Gleezip</h1>
    <p class="subtitle">${escapeHtml(title)}</p>
    <p><strong>Receipt #${escapeHtml(receiptRef)}</strong></p>
    <p class="total">${escapeHtml(total)}</p>
    <table><thead><tr><th>Detail</th><th>Value</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
    <p class="footer">Generated on ${escapeHtml(new Date().toLocaleString('en-GB'))}</p>
  </body></html>`;
}

export function TripReceiptScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'TripReceipt'>>();
  const { requestId, rideId, bookingId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = bookingId
          ? await bookingsApi.getReceipt(bookingId)
          : requestId
          ? await taxiBookingsApi.getReceipt(requestId)
          : rideId
            ? await ridesApi.getReceipt(rideId)
            : null;

        if (!res) {
          if (!cancelled) setError('Missing trip reference');
          return;
        }

        if (res.data?.success && res.data.data) {
          if (!cancelled) setReceipt(res.data.data as ReceiptData);
        } else if (!cancelled) {
          setError(res.data?.message || 'Could not load receipt');
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Could not load receipt'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [requestId, rideId, bookingId]);

  const isBookingReceipt = !!receipt?.bookingId || receipt?.serviceType === 'parking' || receipt?.serviceType === 'driver';

  const handleDownloadPdf = async () => {
    if (!receipt) return;
    setDownloading(true);
    try {
      const html = buildReceiptHtml(receipt, isBookingReceipt);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch {
      Alert.alert('Error', 'Failed to generate receipt PDF');
    } finally {
      setDownloading(false);
    }
  };

  const vehicleLine = receipt?.vehicle
    ? [
        receipt.vehicle.color,
        receipt.vehicle.make,
        receipt.vehicle.model,
        receipt.vehicle.plateNumber ? `(${receipt.vehicle.plateNumber})` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isBookingReceipt ? 'Booking receipt' : 'Trip receipt'}</Text>
        {receipt ? (
          <TouchableOpacity
            onPress={handleDownloadPdf}
            style={styles.downloadBtn}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={COLORS.electricTeal} />
            ) : (
              <Ionicons name="download-outline" size={24} color={COLORS.textPrimary} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.coralRed} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : receipt ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{isBookingReceipt ? 'Total paid' : 'Total fare'}</Text>
            <Text style={styles.totalAmount}>
              {formatCurrency(receipt.totalCost ?? receipt.quotedPrice ?? receipt.estimatedCost ?? 0)}
            </Text>
            {receipt.paymentNote ? (
              <Text style={styles.paymentNote}>{receipt.paymentNote}</Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isBookingReceipt ? 'Booking' : 'Trip'}</Text>
            {receipt.completedAt && (
              <ReceiptRow label="Completed" value={formatDate(receipt.completedAt)} />
            )}
            {receipt.startedAt && (
              <ReceiptRow label="Started" value={formatDate(receipt.startedAt)} />
            )}
            {receipt.startDate && (
              <ReceiptRow label="Start" value={formatDate(receipt.startDate)} />
            )}
            {receipt.endDate && (
              <ReceiptRow label="End" value={formatDate(receipt.endDate)} />
            )}
            {receipt.serviceName && (
              <ReceiptRow label="Service" value={receipt.serviceName} />
            )}
            {!isBookingReceipt && (
              <>
                <ReceiptRow
                  label="Pickup"
                  value={receipt.pickup?.address || 'Pickup location'}
                />
                <ReceiptRow
                  label="Drop-off"
                  value={receipt.dropoff?.address || 'Destination'}
                />
              </>
            )}
            {vehicleLine ? <ReceiptRow label="Vehicle" value={vehicleLine} /> : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isBookingReceipt ? 'Charges' : 'Fare breakdown'}</Text>
            {!isBookingReceipt && receipt.distanceMiles != null && (
              <ReceiptRow label="Distance" value={`${receipt.distanceMiles.toFixed(2)} mi`} />
            )}
            {!isBookingReceipt && receipt.durationMinutes != null && (
              <ReceiptRow label="Duration" value={`${Math.round(receipt.durationMinutes)} min`} />
            )}
            {!isBookingReceipt && receipt.distanceCost != null && (
              <ReceiptRow label="Distance charge" value={formatCurrency(receipt.distanceCost)} />
            )}
            {!isBookingReceipt && receipt.timeCost != null && (
              <ReceiptRow label="Time charge" value={formatCurrency(receipt.timeCost)} />
            )}
            {isBookingReceipt && receipt.quotedPrice != null && (
              <ReceiptRow
                label="Rate"
                value={`${formatCurrency(receipt.quotedPrice)}${receipt.pricingUnit === 'per_hour' ? ' / hour' : receipt.pricingUnit === 'per_day' ? ' / day' : ''}`}
              />
            )}
            {(receipt.totalCost != null || receipt.quotedPrice != null) && (
              <ReceiptRow label="Total" value={formatCurrency(receipt.totalCost ?? receipt.quotedPrice ?? 0)} />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People</Text>
            {isBookingReceipt ? (
              <>
                <ReceiptRow label="Customer" value={receipt.requester?.name || '—'} />
                <ReceiptRow label="Provider" value={receipt.provider?.name || '—'} />
              </>
            ) : (
              <>
                <ReceiptRow label="Passenger" value={(receipt as any).passenger?.name || '—'} />
                <ReceiptRow label="Driver" value={(receipt as any).driver?.name || '—'} />
              </>
            )}
          </View>

          <Text style={styles.receiptId}>
            Receipt #{(receipt.bookingId || receipt.rideId || receipt.requestId || '').slice(-8).toUpperCase()}
          </Text>

          <TouchableOpacity
            style={styles.downloadFooterBtn}
            onPress={handleDownloadPdf}
            disabled={downloading}
            activeOpacity={0.8}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#FFF" />
                <Text style={styles.downloadFooterText}>Download PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: SPACING.sm },
  downloadBtn: { padding: SPACING.sm, width: 40, alignItems: 'center' },
  headerTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  errorText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 15,
  },
  scroll: { padding: SPACING.xl, paddingBottom: SPACING['2xl'] },
  totalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalLabel: { color: COLORS.textSecondary, fontSize: 14 },
  totalAmount: {
    color: COLORS.electricTeal,
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.sm,
  },
  paymentNote: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowLabel: { color: COLORS.textSecondary, fontSize: 14, flex: 1 },
  rowValue: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1.2,
    textAlign: 'right',
  },
  receiptId: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  downloadFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
  },
  downloadFooterText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

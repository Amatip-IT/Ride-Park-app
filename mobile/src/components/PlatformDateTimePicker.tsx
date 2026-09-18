import React, { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

type Props = {
  value: Date;
  visible: boolean;
  onClose: () => void;
  onChange: (next: Date) => void;
  minimumDate?: Date;
};

/**
 * iOS supports mode="datetime". Android crashes on it — use date then time.
 */
export function PlatformDateTimePicker({
  value,
  visible,
  onClose,
  onChange,
  minimumDate,
}: Props) {
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');
  const [androidVisible, setAndroidVisible] = useState(true);

  useEffect(() => {
    if (visible) {
      setAndroidStep('date');
      setAndroidVisible(true);
    }
  }, [visible]);

  const handleChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'dismissed') {
          setAndroidStep('date');
          setAndroidVisible(true);
          onClose();
          return;
        }
        if (!selected) {
          setAndroidStep('date');
          setAndroidVisible(true);
          onClose();
          return;
        }

        if (androidStep === 'date') {
          const next = new Date(value);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          onChange(next);
          setAndroidVisible(false);
          setAndroidStep('time');
          setTimeout(() => setAndroidVisible(true), 50);
          return;
        }

        const next = new Date(value);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        onChange(next);
        setAndroidStep('date');
        setAndroidVisible(true);
        onClose();
        return;
      }

      if (selected) onChange(selected);
      if (event.type === 'set' || event.type === 'dismissed') {
        onClose();
      }
    },
    [androidStep, onChange, onClose, value],
  );

  if (!visible) return null;
  if (Platform.OS === 'android' && !androidVisible) return null;

  return (
    <DateTimePicker
      value={value}
      mode={Platform.OS === 'android' ? androidStep : 'datetime'}
      is24Hour
      minimumDate={
        Platform.OS === 'android' && androidStep === 'time' ? undefined : minimumDate
      }
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={handleChange}
    />
  );
}

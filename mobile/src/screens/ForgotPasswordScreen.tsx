import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { authService } from '@/api/authService';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { Ionicons } from '@expo/vector-icons';

type ForgotPasswordStep = 'email' | 'reset';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  const [step, setStep] = useState<ForgotPasswordStep>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRequestOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authService.forgotPassword(email);
      if (res.success || res.message?.toLowerCase().includes('successfully')) {
        setStep('reset');
        Alert.alert('OTP Sent', 'Please check your email for the verification code.');
      } else {
        setError(res.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      setError('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authService.resetPassword(email, otp, newPassword);
      if (res.success || res.message?.toLowerCase().includes('successfully')) {
        Alert.alert('Success', 'Your password has been reset successfully. You can now login.', [
          { text: 'OK', onPress: () => navigation.navigate('Auth', { isLogin: true }) }
        ]);
      } else {
        setError(res.message || 'Failed to reset password');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 'reset' ? setStep('email') : navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Forgot Password</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {step === 'email' ? (
          <>
            <Text style={styles.instruction}>
              Enter the email address associated with your account. We will send you a 6-digit code to reset your password.
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={COLORS.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRequestOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.buttonText}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.instruction}>
              Enter the 6-digit code sent to {email} and your new password.
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="6-Digit OTP Code"
                placeholderTextColor={COLORS.textTertiary}
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="numeric"
                maxLength={6}
                editable={!loading}
              />
            </View>

            <View style={[styles.inputWrapper, { position: 'relative' }]}>
              <TextInput
                style={styles.input}
                placeholder="New Password (min 8 chars)"
                placeholderTextColor={COLORS.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeIcon} 
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.inputWrapper, { position: 'relative' }]}>
              <TextInput
                style={styles.input}
                placeholder="Confirm New Password"
                placeholderTextColor={COLORS.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                style={styles.eyeIcon} 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleRequestOtp}
              disabled={loading}
            >
              <Text style={styles.resendText}>Didn't receive a code? Resend</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  instruction: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 22,
    textAlign: 'center',
  },
  inputWrapper: {
    marginBottom: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 15,
  },
  button: {
    backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.bold,
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.small,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  resendButton: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  resendText: {
    color: COLORS.electricTeal,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

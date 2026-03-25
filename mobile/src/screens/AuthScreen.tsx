import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '@/constants/theme';
import { useEmailOtp } from '@/api/useOtpHooks';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/api/authService';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation/RootNavigator';

type AuthStep = 'register' | 'otp' | 'login';

export function AuthScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const initialIsLogin = route.params?.isLogin ?? false;
  const initialRole = route.params?.role ?? 'user';

  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [currentStep, setCurrentStep] = useState<AuthStep>(initialIsLogin ? 'login' : 'register');
  
  const [otp, setOtp] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phoneNumber: '',
    password: '',
    role: initialRole as import('@/types').UserRole,
  });

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });

  const { sendOtp, verifyOtp, formatTime, error, loading, otpAttempts, clearError } =
    useEmailOtp();
  const { login: storeLogin, setIsLoading, setError: setStoreError } = useAuthStore();

  const handleRegister = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      Alert.alert('Error', 'Please enter your first and last name'); return;
    }
    if (!formData.username.trim()) {
      Alert.alert('Error', 'Please enter a username'); return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address'); return;
    }
    if (!formData.phoneNumber.trim() || formData.phoneNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number'); return;
    }
    if (!formData.password.trim() || formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters'); return;
    }

    setIsLoading(true);
    try {
      const response = await authService.register(formData);

      if (!response.success) {
        setStoreError(response.message || 'Registration failed');
        Alert.alert('Error', response.message || 'Failed to register');
        return;
      }

      // Registration is successful! User is now in DB.
      // Now, send OTP to their email for verification.
      const otpSent = await sendOtp(formData.email);
      if (otpSent) {
        setCurrentStep('otp');
      } else {
        Alert.alert('Notice', 'Registered successfully, but failed to send verification email. Try logging in.');
        setCurrentStep('login');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Registration failed';
      setStoreError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    const emailToVerify = currentStep === 'register' || currentStep === 'otp' ? formData.email : loginData.email;
    const success = await verifyOtp(emailToVerify, otp);
    
    if (success) {
      setIsLoading(true);
      try {
        const loginRes = await authService.login({
          email: formData.email,
          password: formData.password,
        });

        const res: any = loginRes;
        if (res.success && res.token && res.data) {
          await storeLogin(res.data as any, res.token);
        } else {
          Alert.alert('Notice', 'Verified! Please sign in.');
          setCurrentStep('login');
        }
      } catch (err) {
        setCurrentStep('login');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleLogin = async () => {
    if (!loginData.email.trim() || !loginData.password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.login(loginData);

      if (!response.success) {
        setStoreError(response.message || 'Login failed');
        Alert.alert('Error', response.message || 'Failed to login');
        return;
      }

      const res: any = response;
      if (res.token && res.data) {
        await storeLogin(res.data as any, res.token);
      } else {
        setStoreError('Invalid server payload structure');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Login failed';
      setStoreError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    await sendOtp(formData.email);
  };

  const toggleAuthMode = () => {
    const newIsLogin = !isLogin;
    setIsLogin(newIsLogin);
    setCurrentStep(newIsLogin ? 'login' : 'register');
    setOtp('');
    setFormData({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      phoneNumber: '',
      password: '',
      role: initialRole as import('@/types').UserRole,
    });
    setLoginData({ email: '', password: '' });
    clearError();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.appName}>Ride & Park</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Sign In to your account' : `Create your ${initialRole === 'user' ? 'account' : 'provider account'}`}
          </Text>
        </View>

        {currentStep === 'register' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Complete Your Profile</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="First Name"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.firstName}
                onChangeText={(text) => setFormData({ ...formData, firstName: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Last Name"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.lastName}
                onChangeText={(text) => setFormData({ ...formData, lastName: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.username}
                onChangeText={(text) => setFormData({ ...formData, username: text })}
              />
            </View>
            
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Phone Number (e.g. +44...)"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.phoneNumber}
                onChangeText={(text) => setFormData({ ...formData, phoneNumber: text })}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Password (min 6 chars)"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                secureTextEntry
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.deepNavy} />
              ) : (
                <Text style={styles.buttonText}>Register & Verify Email</Text>
              )}
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <Text style={styles.toggleText}>Already have an account? </Text>
              <TouchableOpacity onPress={toggleAuthMode}>
                <Text style={styles.toggleLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentStep === 'otp' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Verify Email</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to {formData.email}
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="000000"
                placeholderTextColor={COLORS.cloudWhite}
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="numeric"
                maxLength={6}
                editable={!loading}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>Expires in: {formatTime()}</Text>
              {otpAttempts > 0 && (
                <Text style={styles.attemptsText}>Attempts: {otpAttempts}/3</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.deepNavy} />
              ) : (
                <Text style={styles.buttonText}>Verify Code & Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResendOtp}>
              <Text style={styles.resendLink}>Resend Verification Email</Text>
            </TouchableOpacity>
          </View>
        )}

        {currentStep === 'login' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Sign In</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.cloudWhite}
                value={loginData.email}
                onChangeText={(text) => setLoginData({ ...loginData, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.cloudWhite}
                value={loginData.password}
                onChangeText={(text) => setLoginData({ ...loginData, password: text })}
                secureTextEntry
              />
            </View>
            
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.deepNavy} />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <Text style={styles.toggleText}>Don't have an account? </Text>
              <TouchableOpacity onPress={toggleAuthMode}>
                <Text style={styles.toggleLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deepNavy },
  scrollContent: { flexGrow: 1, padding: SPACING.lg, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: SPACING.xl, marginTop: Platform.OS === 'ios' ? 40 : 20 },
  appName: { fontSize: FONT_SIZES.section, fontWeight: '700', color: COLORS.electricTeal, marginBottom: SPACING.sm },
  subtitle: { fontSize: FONT_SIZES.body, color: COLORS.cloudWhite },
  formContainer: { width: '100%' },
  label: { fontSize: FONT_SIZES.section, fontWeight: '600', color: COLORS.cloudWhite, marginBottom: SPACING.md },
  inputWrapper: { marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.steelBlue, borderRadius: 12, padding: SPACING.md, color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: COLORS.softSlate },
  button: { backgroundColor: COLORS.electricTeal, borderRadius: 12, padding: SPACING.lg, alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.md },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.deepNavy, fontSize: FONT_SIZES.label, fontWeight: '700' },
  error: { color: COLORS.coralRed, fontSize: FONT_SIZES.small, marginBottom: SPACING.md, marginTop: -SPACING.md },
  timerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.steelBlue, borderRadius: 8 },
  timerText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: '600' },
  attemptsText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.small },
  resendLink: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, textAlign: 'center', textDecorationLine: 'underline', marginTop: SPACING.md },
  toggleContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  toggleText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body },
  toggleLink: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: '600' },
});

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
import { Ionicons } from '@expo/vector-icons';
import PhoneInput from 'react-native-phone-number-input';
import { Picker } from '@react-native-picker/picker';
import { useRef } from 'react';

type AuthStep = 'register_step1' | 'register_step2' | 'otp' | 'login';

export function AuthScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const initialIsLogin = route.params?.isLogin ?? false;
  const initialRole = route.params?.role ?? 'user';

  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [currentStep, setCurrentStep] = useState<AuthStep>(initialIsLogin ? 'login' : 'register_step1');
  
  const [otp, setOtp] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    postCode: '',
    street: '',
    county: '',
    town: '',
    country: 'United Kingdom',
    role: initialRole as import('@/types').UserRole,
  });

  const phoneInput = useRef<PhoneInput>(null);

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });

  const { sendOtp, verifyOtp, formatTime, error, loading, otpAttempts, clearError } =
    useEmailOtp();
  const { login: storeLogin, setIsLoading, setError: setStoreError } = useAuthStore();

  // ── Step 1 validation ──
  const handleStep1Next = () => {
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
    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match'); return;
    }
    setCurrentStep('register_step2');
  };

  // ── Step 2 submit (full registration) ──
  const handleRegister = async () => {
    if (!formData.postCode.trim()) {
      Alert.alert('Error', 'Please enter your post code'); return;
    }
    if (!formData.town.trim()) {
      Alert.alert('Error', 'Please enter your town'); return;
    }
    if (!formData.country.trim()) {
      Alert.alert('Error', 'Please enter your country'); return;
    }
    if (!termsAccepted) {
      Alert.alert('Error', 'You must agree to the Terms & Conditions to continue'); return;
    }

    setIsLoading(true);
    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        password: formData.password,
        role: formData.role,
        postCode: formData.postCode,
        address: {
          street: formData.street || undefined,
          county: formData.county || undefined,
          town: formData.town,
          country: formData.country,
        },
        termsAccepted: true,
      };

      const response = await authService.register(payload);

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

    const emailToVerify = formData.email;
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
    setCurrentStep(newIsLogin ? 'login' : 'register_step1');
    setOtp('');
    setTermsAccepted(false);
    setFormData({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      postCode: '',
      street: '',
      county: '',
      town: '',
      country: 'United Kingdom',
      role: initialRole as import('@/types').UserRole,
    });
    setLoginData({ email: '', password: '' });
    clearError();
  };

  // ── Step indicator ──
  const StepIndicator = ({ currentStepNum, totalSteps }: { currentStepNum: number; totalSteps: number }) => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View key={i} style={styles.stepRow}>
          <View style={[styles.stepDot, i < currentStepNum && styles.stepDotActive, i === currentStepNum - 1 && styles.stepDotCurrent]}>
            {i < currentStepNum - 1 && <Ionicons name="checkmark" size={12} color={COLORS.deepNavy} />}
            {i === currentStepNum - 1 && <Text style={styles.stepDotText}>{i + 1}</Text>}
            {i >= currentStepNum && <Text style={styles.stepDotTextInactive}>{i + 1}</Text>}
          </View>
          {i < totalSteps - 1 && (
            <View style={[styles.stepLine, i < currentStepNum - 1 && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );

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

        {/* ════════════ REGISTER STEP 1: Personal Details ════════════ */}
        {currentStep === 'register_step1' && (
          <View style={styles.formContainer}>
            <StepIndicator currentStepNum={1} totalSteps={2} />
            <Text style={styles.label}>Personal Details</Text>

            <View style={styles.row}>
              <View style={[styles.inputWrapper, styles.halfInput]}>
                <TextInput
                  style={styles.input}
                  placeholder="First Name"
                  placeholderTextColor={COLORS.cloudWhite}
                  value={formData.firstName}
                  onChangeText={(text) => setFormData({ ...formData, firstName: text })}
                />
              </View>
              <View style={[styles.inputWrapper, styles.halfInput]}>
                <TextInput
                  style={styles.input}
                  placeholder="Last Name"
                  placeholderTextColor={COLORS.cloudWhite}
                  value={formData.lastName}
                  onChangeText={(text) => setFormData({ ...formData, lastName: text })}
                />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.username}
                onChangeText={(text) => setFormData({ ...formData, username: text })}
                autoCapitalize="none"
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

            <View style={styles.phoneInputWrapper}>
              <PhoneInput
                ref={phoneInput}
                defaultValue={formData.phoneNumber}
                defaultCode="GB"
                layout="first"
                onChangeFormattedText={(text) => {
                  setFormData({ ...formData, phoneNumber: text });
                }}
                containerStyle={styles.phoneContainer}
                textContainerStyle={styles.phoneTextContainer}
                textInputStyle={styles.phoneTextInput}
                codeTextStyle={styles.phoneCodeText}
                withDarkTheme
                withShadow={false}
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

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.confirmPassword}
                onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
                secureTextEntry
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={styles.button}
              onPress={handleStep1Next}
            >
              <Text style={styles.buttonText}>Next — Address Details</Text>
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <Text style={styles.toggleText}>Already have an account? </Text>
              <TouchableOpacity onPress={toggleAuthMode}>
                <Text style={styles.toggleLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ════════════ REGISTER STEP 2: Address & Terms ════════════ */}
        {currentStep === 'register_step2' && (
          <View style={styles.formContainer}>
            <StepIndicator currentStepNum={2} totalSteps={2} />
            <Text style={styles.label}>Address & Terms</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Post Code"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.postCode}
                onChangeText={(text) => setFormData({ ...formData, postCode: text })}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Street Address"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.street}
                onChangeText={(text) => setFormData({ ...formData, street: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Town / City"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.town}
                onChangeText={(text) => setFormData({ ...formData, town: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="County (optional)"
                placeholderTextColor={COLORS.cloudWhite}
                value={formData.county}
                onChangeText={(text) => setFormData({ ...formData, county: text })}
              />
            </View>

            <View style={[styles.inputWrapper, { padding: 0, overflow: 'hidden', height: 50, justifyContent: 'center', backgroundColor: COLORS.steelBlue, borderRadius: 12, borderWidth: 1, borderColor: COLORS.softSlate }]}>
              <Picker
                selectedValue={formData.country}
                onValueChange={(itemValue) => setFormData({ ...formData, country: itemValue })}
                dropdownIconColor={COLORS.cloudWhite}
                style={{ color: COLORS.cloudWhite, height: 50, width: '100%' }}
              >
                <Picker.Item label="United Kingdom" value="United Kingdom" />
                <Picker.Item label="Nigeria" value="Nigeria" />
                <Picker.Item label="United States" value="United States" />
                <Picker.Item label="Canada" value="Canada" />
                <Picker.Item label="Australia" value="Australia" />
                <Picker.Item label="South Africa" value="South Africa" />
                <Picker.Item label="Other" value="Other" />
              </Picker>
            </View>

            {/* ── Terms & Conditions checkbox ── */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={16} color={COLORS.deepNavy} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink}>Terms & Conditions</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>

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

            <TouchableOpacity
              style={styles.backStepButton}
              onPress={() => setCurrentStep('register_step1')}
            >
              <Ionicons name="arrow-back" size={18} color={COLORS.softSlate} />
              <Text style={styles.backStepText}>Back to Personal Details</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════ OTP VERIFICATION ════════════ */}
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

        {/* ════════════ LOGIN ════════════ */}
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

  // Step indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.steelBlue,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.softSlate,
  },
  stepDotActive: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  stepDotCurrent: { borderColor: COLORS.electricTeal, backgroundColor: COLORS.electricTeal },
  stepDotText: { color: COLORS.deepNavy, fontSize: 12, fontWeight: '700' },
  stepDotTextInactive: { color: COLORS.softSlate, fontSize: 12, fontWeight: '600' },
  stepLine: { width: 40, height: 2, backgroundColor: COLORS.softSlate, marginHorizontal: 4 },
  stepLineActive: { backgroundColor: COLORS.electricTeal },

  // Input fields
  row: { flexDirection: 'row', gap: SPACING.sm },
  halfInput: { flex: 1 },
  inputWrapper: { marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.steelBlue, borderRadius: 12,
    padding: SPACING.md, color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: COLORS.softSlate,
    height: 50,
  },
  phoneInputWrapper: {
    marginBottom: SPACING.md,
  },
  phoneContainer: {
    width: '100%',
    backgroundColor: COLORS.steelBlue,
    borderRadius: 12,
    borderWidth: 1, 
    borderColor: COLORS.softSlate,
    height: 50,
  },
  phoneTextContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.softSlate,
  },
  phoneTextInput: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body,
    height: 50, padding: 0,
  },
  phoneCodeText: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body,
  },

  // Terms & conditions
  termsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.lg, marginTop: SPACING.sm,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.softSlate,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SPACING.sm, marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal,
  },
  termsText: { flex: 1, color: COLORS.cloudWhite, fontSize: FONT_SIZES.small, lineHeight: 20 },
  termsLink: { color: COLORS.electricTeal, textDecorationLine: 'underline' },

  // Buttons
  button: {
    backgroundColor: COLORS.electricTeal, borderRadius: 12,
    padding: SPACING.lg, alignItems: 'center',
    marginTop: SPACING.lg, marginBottom: SPACING.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.deepNavy, fontSize: FONT_SIZES.label, fontWeight: '700' },

  // Back step
  backStepButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md, padding: SPACING.sm,
  },
  backStepText: { color: COLORS.softSlate, fontSize: FONT_SIZES.body, marginLeft: SPACING.xs },

  // Misc
  error: { color: COLORS.coralRed, fontSize: FONT_SIZES.small, marginBottom: SPACING.md, marginTop: -SPACING.md },
  timerContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginVertical: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.steelBlue, borderRadius: 8,
  },
  timerText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: '600' },
  attemptsText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.small },
  resendLink: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.body,
    textAlign: 'center', textDecorationLine: 'underline', marginTop: SPACING.md,
  },
  toggleContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  toggleText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body },
  toggleLink: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: '600' },
});

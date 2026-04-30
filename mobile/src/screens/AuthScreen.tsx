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
  Image,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { useEmailOtp } from '@/api/useOtpHooks';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/api/authService';
import { RouteProp, useRoute, useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { Ionicons } from '@expo/vector-icons';
import PhoneInput from 'react-native-phone-number-input';
import { Picker } from '@react-native-picker/picker';
import { useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';

type AuthStep = 'register_step1' | 'register_step2' | 'register_step3' | 'otp' | 'login';

const ID_TYPE_OPTIONS = [
  { label: 'UK Driver\'s Licence', value: 'driver_license' },
  { label: 'Passport', value: 'passport' },
  { label: 'National Identity Card', value: 'national_identity_card' },
];

const PROOF_OF_ADDRESS_INFO = 'Upload a utility bill, bank statement, or council tax letter dated within the last 3 months.';

export function AuthScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const initialIsLogin = route.params?.isLogin ?? false;
  const initialRole = route.params?.role ?? 'user';

  const isProvider = ['parking_provider', 'driver', 'taxi_driver'].includes(initialRole);

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
    taxiType: 'Normal car',
    vehicleMake: '',
    vehicleModel: '',
    vehicleColor: '',
    plateNumber: '',
  });

  // Identity verification state (Step 3 for providers)
  const [idType, setIdType] = useState('');
  const [identityDocUri, setIdentityDocUri] = useState('');
  const [proofOfAddressUri, setProofOfAddressUri] = useState('');

  const phoneInput = useRef<PhoneInput>(null);

  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const { sendOtp, sendLoginOtp, verifyOtp, formatTime, error, loading, otpAttempts, clearError } =
    useEmailOtp();
  const { login: storeLogin, setIsLoading, setError: setStoreError } = useAuthStore();

  const totalSteps = isProvider ? 3 : 2;

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
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(formData.password)) {
      Alert.alert('Error', 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'); return;
    }
    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match'); return;
    }
    setCurrentStep('register_step2');
  };

  // ── Step 2 validation ──
  const handleStep2Next = () => {
    if (!formData.postCode.trim()) {
      Alert.alert('Error', 'Please enter your post code'); return;
    }
    if (!formData.town.trim()) {
      Alert.alert('Error', 'Please enter your town'); return;
    }
    if (!formData.country.trim()) {
      Alert.alert('Error', 'Please enter your country'); return;
    }

    if (formData.role === 'taxi_driver') {
      if (!formData.vehicleMake.trim()) {
        Alert.alert('Error', 'Please enter your vehicle make'); return;
      }
      if (!formData.vehicleModel.trim()) {
        Alert.alert('Error', 'Please enter your vehicle model'); return;
      }
      if (!formData.vehicleColor.trim()) {
        Alert.alert('Error', 'Please enter your vehicle color'); return;
      }
      if (!formData.plateNumber.trim()) {
        Alert.alert('Error', 'Please enter your plate number'); return;
      }
    }

    if (!termsAccepted) {
      Alert.alert('Error', 'You must agree to the Terms & Conditions to continue'); return;
    }

    if (isProvider) {
      // Go to Step 3 for providers
      setCurrentStep('register_step3');
    } else {
      // Regular users: register directly
      handleRegister();
    }
  };

  // ── Image picker helper ──
  const pickImage = async (setter: (uri: string) => void) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setter(result.assets[0].uri);
    }
  };

  // ── Step 3 validation (providers only) ──
  const handleStep3Register = () => {
    if (!idType) {
      Alert.alert('Error', 'Please select your ID document type'); return;
    }
    if (!identityDocUri) {
      Alert.alert('Error', 'Please upload your ID document'); return;
    }
    if (!proofOfAddressUri) {
      Alert.alert('Error', 'Please upload your proof of address'); return;
    }
    handleRegister();
  };

  // ── Full registration (called from Step 2 for users, Step 3 for providers) ──
  const handleRegister = async () => {
    setIsLoading(true);
    try {
      const payload: any = {
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
        taxiType: formData.role === 'taxi_driver' ? formData.taxiType : undefined,
        vehicleMake: formData.role === 'taxi_driver' ? formData.vehicleMake : undefined,
        vehicleModel: formData.role === 'taxi_driver' ? formData.vehicleModel : undefined,
        vehicleColor: formData.role === 'taxi_driver' ? formData.vehicleColor : undefined,
        plateNumber: formData.role === 'taxi_driver' ? formData.plateNumber : undefined,
        termsAccepted: true,
      };

      // Add identity verification data for providers
      if (isProvider) {
        payload.idType = idType;
        payload.identityDocumentUrl = identityDocUri;
        payload.proofOfAddressUrl = proofOfAddressUri;
        payload.identityStatus = 'pending';
      }

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

    if (isLogin) {
      setIsLoading(true);
      try {
        const loginRes = await authService.login({
          email: loginData.email,
          password: loginData.password,
          otp: otp
        });

        const res: any = loginRes;
        if (res.success && res.token && res.data) {
          await storeLogin(res.data as any, res.token);
        } else {
          setStoreError(res.message || 'OTP verification failed');
          Alert.alert('Error', res.message || 'OTP verification failed');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'OTP verification failed';
        setStoreError(errorMsg);
        Alert.alert('Error', errorMsg);
      } finally {
        setIsLoading(false);
      }
    } else {
      const emailToVerify = formData.email;
      const success = await verifyOtp(emailToVerify, otp);
      
      if (success) {
        Alert.alert('Success', 'Email verified! Please sign in.');
        setLoginData({ email: formData.email, password: formData.password });
        setIsLogin(true);
        setCurrentStep('login');
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

      const res: any = response;
      if (!res.success) {
        setStoreError(res.message || 'Login failed');
        Alert.alert('Error', res.message || 'Failed to login');
        return;
      }

      if (res.requiresOTP) {
        Alert.alert('Notice', res.message || 'OTP verification required');
        setOtp('');
        setCurrentStep('otp');
        return;
      }

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
    if (isLogin) {
      await sendLoginOtp(loginData.email);
    } else {
      await sendOtp(formData.email);
    }
  };

  const toggleAuthMode = () => {
    const newIsLogin = !isLogin;
    setIsLogin(newIsLogin);
    setCurrentStep(newIsLogin ? 'login' : 'register_step1');
    setOtp('');
    setTermsAccepted(false);
    setIdType('');
    setIdentityDocUri('');
    setProofOfAddressUri('');
    // Only clear if successful and not going to Step 3
    if (!isProvider) {
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
        taxiType: 'Normal car',
        vehicleMake: '',
        vehicleModel: '',
        vehicleColor: '',
        plateNumber: '',
      });
    }
    setLoginData({ email: '', password: '' });
    clearError();
  };

  // ── Step indicator ──
  const StepIndicator = ({ currentStepNum, totalSteps: total }: { currentStepNum: number; totalSteps: number }) => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.stepRow}>
          <View style={[styles.stepDot, i < currentStepNum && styles.stepDotActive, i === currentStepNum - 1 && styles.stepDotCurrent]}>
            {i < currentStepNum - 1 && <Ionicons name="checkmark" size={12} color="#FFF" />}
            {i === currentStepNum - 1 && <Text style={styles.stepDotText}>{i + 1}</Text>}
            {i >= currentStepNum && <Text style={styles.stepDotTextInactive}>{i + 1}</Text>}
          </View>
          {i < total - 1 && (
            <View style={[styles.stepLine, i < currentStepNum - 1 && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );

  // ── Upload Button Component ──
  const UploadButton = ({ label, uri, onPress }: { label: string; uri: string; onPress: () => void }) => (
    <TouchableOpacity style={styles.uploadBtn} onPress={onPress} activeOpacity={0.7}>
      {uri ? (
        <View style={styles.uploadPreviewRow}>
          <Image source={{ uri }} style={styles.uploadPreview} />
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadLabelDone}>{label}</Text>
            <Text style={styles.uploadStatusDone}>Document uploaded ✓</Text>
          </View>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
        </View>
      ) : (
        <View style={styles.uploadPlaceholderRow}>
          <View style={styles.uploadIconContainer}>
            <Ionicons name="cloud-upload-outline" size={28} color={COLORS.electricTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadLabel}>{label}</Text>
            <Text style={styles.uploadHint}>Tap to select from gallery</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
        </View>
      )}
    </TouchableOpacity>
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
          <Image 
            source={require('../../assets/images/logo.jpg')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>
            {isLogin ? 'Sign In to your account' : `Create your ${initialRole === 'user' ? 'account' : 'provider account'}`}
          </Text>
        </View>

        {/* ════════════ REGISTER STEP 1: Personal Details ════════════ */}
        {currentStep === 'register_step1' && (
          <View style={styles.formContainer}>
            <StepIndicator currentStepNum={1} totalSteps={totalSteps} />
            <Text style={styles.label}>Personal Details</Text>

            <View style={styles.row}>
              <View style={[styles.inputWrapper, styles.halfInput]}>
                <TextInput
                  style={styles.input}
                  placeholder="First Name"
                  placeholderTextColor={COLORS.textTertiary}
                  value={formData.firstName}
                  onChangeText={(text) => setFormData({ ...formData, firstName: text })}
                />
              </View>
              <View style={[styles.inputWrapper, styles.halfInput]}>
                <TextInput
                  style={styles.input}
                  placeholder="Last Name"
                  placeholderTextColor={COLORS.textTertiary}
                  value={formData.lastName}
                  onChangeText={(text) => setFormData({ ...formData, lastName: text })}
                />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.username}
                onChangeText={(text) => setFormData({ ...formData, username: text })}
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor={COLORS.textTertiary}
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

            <View style={[styles.inputWrapper, { position: 'relative' }]}>
              <TextInput
                style={styles.input}
                placeholder="Password (min 8 chars)"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity 
                style={{ position: 'absolute', right: 15, top: 15 }} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.inputWrapper, { position: 'relative' }]}>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.confirmPassword}
                onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity 
                style={{ position: 'absolute', right: 15, top: 15 }} 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
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
            <StepIndicator currentStepNum={2} totalSteps={totalSteps} />
            <Text style={styles.label}>Address & Terms</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Post Code"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.postCode}
                onChangeText={(text) => setFormData({ ...formData, postCode: text })}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Street Address"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.street}
                onChangeText={(text) => setFormData({ ...formData, street: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Town / City"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.town}
                onChangeText={(text) => setFormData({ ...formData, town: text })}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="County (optional)"
                placeholderTextColor={COLORS.textTertiary}
                value={formData.county}
                onChangeText={(text) => setFormData({ ...formData, county: text })}
              />
            </View>

            <View style={[styles.inputWrapper, { padding: 0, overflow: 'hidden', height: 50, justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border }]}>
              <Picker
                selectedValue={formData.country}
                onValueChange={(itemValue) => setFormData({ ...formData, country: itemValue })}
                dropdownIconColor={COLORS.textSecondary}
                style={{ color: COLORS.textPrimary, height: 50, width: '100%' }}
              >
                <Picker.Item label="United Kingdom" value="United Kingdom" color={COLORS.textPrimary} />
                <Picker.Item label="Nigeria" value="Nigeria" color={COLORS.textPrimary} />
                <Picker.Item label="United States" value="United States" color={COLORS.textPrimary} />
                <Picker.Item label="Canada" value="Canada" color={COLORS.textPrimary} />
                <Picker.Item label="Australia" value="Australia" color={COLORS.textPrimary} />
                <Picker.Item label="South Africa" value="South Africa" color={COLORS.textPrimary} />
                <Picker.Item label="Other" value="Other" color={COLORS.textPrimary} />
              </Picker>
            </View>

            {initialRole === 'taxi_driver' && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Taxi Type & Capacity</Text>
                <View style={[styles.inputWrapper, { padding: 0, overflow: 'hidden', height: 50, justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border }]}>
                  <Picker
                    selectedValue={formData.taxiType}
                    onValueChange={(itemValue) => setFormData({ ...formData, taxiType: itemValue })}
                    dropdownIconColor={COLORS.textSecondary}
                    style={{ color: COLORS.textPrimary, height: 50, width: '100%' }}
                  >
                    <Picker.Item label="Normal car ➔ 4 seats" value="Normal car" color={COLORS.textPrimary} />
                    <Picker.Item label="Mini Bus ➔ 6 seats" value="Mini Bus" color={COLORS.textPrimary} />
                    <Picker.Item label="Bus ➔ 8 seats" value="Bus" color={COLORS.textPrimary} />
                  </Picker>
                </View>

                {/* Additional Vehicle Details */}
                <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Vehicle Details</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="car-outline" size={20} color={COLORS.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Vehicle Make (e.g. Toyota)"
                    placeholderTextColor={COLORS.textTertiary}
                    value={formData.vehicleMake}
                    onChangeText={(t) => setFormData({ ...formData, vehicleMake: t })}
                  />
                </View>
                <View style={[styles.inputWrapper, { marginTop: SPACING.md }]}>
                  <Ionicons name="car-sport-outline" size={20} color={COLORS.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Vehicle Model (e.g. Prius)"
                    placeholderTextColor={COLORS.textTertiary}
                    value={formData.vehicleModel}
                    onChangeText={(t) => setFormData({ ...formData, vehicleModel: t })}
                  />
                </View>
                <View style={[styles.inputWrapper, { marginTop: SPACING.md }]}>
                  <Ionicons name="color-palette-outline" size={20} color={COLORS.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Vehicle Color (e.g. Silver)"
                    placeholderTextColor={COLORS.textTertiary}
                    value={formData.vehicleColor}
                    onChangeText={(t) => setFormData({ ...formData, vehicleColor: t })}
                  />
                </View>
                <View style={[styles.inputWrapper, { marginTop: SPACING.md }]}>
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Plate Number"
                    placeholderTextColor={COLORS.textTertiary}
                    value={formData.plateNumber}
                    onChangeText={(t) => setFormData({ ...formData, plateNumber: t.toUpperCase() })}
                    autoCapitalize="characters"
                  />
                </View>
              </>
            )}

            {/* ── Terms & Conditions checkbox ── */}
            <View style={styles.termsRow}>
              <TouchableOpacity
                onPress={() => setTermsAccepted(!termsAccepted)}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                  {termsAccepted && <Ionicons name="checkmark" size={16} color="#FFF" />}
                </View>
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text 
                  style={styles.termsLink} 
                  onPress={() => navigation.navigate('LegalDocument', { documentType: 'terms' })}
                >
                  Terms & Conditions
                </Text>
                {' '}and{' '}
                <Text 
                  style={styles.termsLink} 
                  onPress={() => navigation.navigate('LegalDocument', { documentType: 'privacy' })}
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleStep2Next}
              disabled={loading}
            >
              {loading && !isProvider ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isProvider ? 'Next — Identity Verification' : 'Register & Verify Email'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backStepButton}
              onPress={() => setCurrentStep('register_step1')}
            >
              <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
              <Text style={styles.backStepText}>Back to Personal Details</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════ REGISTER STEP 3: Identity Verification (Providers Only) ════════════ */}
        {currentStep === 'register_step3' && (
          <View style={styles.formContainer}>
            <StepIndicator currentStepNum={3} totalSteps={3} />
            <Text style={styles.label}>Identity Verification</Text>
            <Text style={styles.step3Subtitle}>
              To verify your identity as a provider, please upload the following documents.
            </Text>

            {/* ID Type Selection */}
            <Text style={styles.fieldLabel}>Select ID Document Type</Text>
            <View style={styles.idTypeContainer}>
              {ID_TYPE_OPTIONS.map((option) => {
                const isSelected = idType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.idTypeOption, isSelected && styles.idTypeOptionActive]}
                    onPress={() => setIdType(option.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={[styles.idTypeLabel, isSelected && styles.idTypeLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Upload ID Document */}
            <Text style={styles.fieldLabel}>
              Upload {idType ? ID_TYPE_OPTIONS.find(o => o.value === idType)?.label : 'ID Document'}
            </Text>
            <UploadButton
              label={idType ? ID_TYPE_OPTIONS.find(o => o.value === idType)?.label || 'ID Document' : 'ID Document'}
              uri={identityDocUri}
              onPress={() => pickImage(setIdentityDocUri)}
            />

            {/* Upload Proof of Address */}
            <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>Proof of Address</Text>
            <Text style={styles.proofHint}>{PROOF_OF_ADDRESS_INFO}</Text>
            <UploadButton
              label="Proof of Address"
              uri={proofOfAddressUri}
              onPress={() => pickImage(setProofOfAddressUri)}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleStep3Register}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <View style={styles.buttonRow}>
                  <Ionicons name="shield-checkmark" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>Register & Verify Email</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backStepButton}
              onPress={() => setCurrentStep('register_step2')}
            >
              <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
              <Text style={styles.backStepText}>Back to Address Details</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════ OTP VERIFICATION ════════════ */}
        {currentStep === 'otp' && (
          <View style={styles.formContainer}>
            <Text style={styles.label}>Verify Email</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to {isLogin ? loginData.email : formData.email}
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="000000"
                placeholderTextColor={COLORS.textTertiary}
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
                <ActivityIndicator color="#FFF" />
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
                placeholderTextColor={COLORS.textTertiary}
                value={loginData.email}
                onChangeText={(text) => setLoginData({ ...loginData, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={[styles.inputWrapper, { position: 'relative' }]}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.textTertiary}
                value={loginData.password}
                onChangeText={(text) => setLoginData({ ...loginData, password: text })}
                secureTextEntry={!showLoginPassword}
              />
              <TouchableOpacity 
                style={{ position: 'absolute', right: 15, top: 15 }} 
                onPress={() => setShowLoginPassword(!showLoginPassword)}
              >
                <Ionicons name={showLoginPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={{ alignSelf: 'flex-end', marginBottom: SPACING.md }}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={{ color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium }}>
                Forgot Password?
              </Text>
            </TouchableOpacity>
            
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
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
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, padding: SPACING.lg, justifyContent: 'center' },
  inputIcon: { marginRight: SPACING.sm },
  eyeIcon: { padding: SPACING.xs },
  header: { alignItems: 'center', marginBottom: SPACING.xl, marginTop: Platform.OS === 'ios' ? 40 : 20 },
  logoImage: { width: 220, height: 70, marginBottom: SPACING.sm },
  appName: { fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold, color: COLORS.electricTeal, marginBottom: SPACING.sm },
  subtitle: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary },
  formContainer: { width: '100%' },
  label: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary, marginBottom: SPACING.md },

  // Step indicator
  stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.border,
  },
  stepDotActive: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  stepDotCurrent: { borderColor: COLORS.electricTeal, backgroundColor: COLORS.electricTeal },
  stepDotText: { color: COLORS.background, fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  stepDotTextInactive: { color: COLORS.textSecondary, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  stepLine: { width: 40, height: 2, backgroundColor: COLORS.border, marginHorizontal: 4 },
  stepLineActive: { backgroundColor: COLORS.electricTeal },

  // Input fields
  row: { flexDirection: 'row', gap: SPACING.sm },
  halfInput: { flex: 1 },
  inputWrapper: { marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: COLORS.border,
    height: 50,
  },
  phoneInputWrapper: {
    marginBottom: SPACING.md,
  },
  phoneContainer: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, 
    borderColor: COLORS.border,
    height: 50,
  },
  phoneTextContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  phoneTextInput: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    height: 50, padding: 0,
  },
  phoneCodeText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
  },

  // Terms & conditions
  termsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.lg, marginTop: SPACING.sm,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SPACING.sm, marginTop: 2,
    backgroundColor: COLORS.surface,
  },
  checkboxChecked: {
    backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal,
  },
  termsText: { flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 20 },
  termsLink: { color: COLORS.electricTeal, textDecorationLine: 'underline' },

  // Buttons
  button: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, alignItems: 'center',
    marginTop: SPACING.lg, marginBottom: SPACING.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  // Back step
  backStepButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md, padding: SPACING.sm,
  },
  backStepText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginLeft: SPACING.xs },

  // Step 3 - Identity Verification
  step3Subtitle: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.body,
    lineHeight: 22, marginBottom: SPACING.xl,
  },
  fieldLabel: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },
  proofHint: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small,
    lineHeight: 18, marginBottom: SPACING.md,
  },

  // ID Type radio buttons
  idTypeContainer: {
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  idTypeOption: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  idTypeOptionActive: {
    borderColor: COLORS.electricTeal,
    backgroundColor: 'rgba(0, 194, 168, 0.08)',
  },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
    marginRight: SPACING.md,
    backgroundColor: COLORS.background,
  },
  radioOuterActive: {
    borderColor: COLORS.electricTeal,
  },
  radioInner: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.electricTeal,
  },
  idTypeLabel: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  idTypeLabelActive: {
    color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold,
  },

  // Upload buttons
  uploadBtn: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1.5,
    borderColor: COLORS.border, borderStyle: 'dashed',
    marginBottom: SPACING.sm,
  },
  uploadPlaceholderRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  uploadIconContainer: {
    width: 48, height: 48, borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(0, 194, 168, 0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  uploadLabel: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  uploadHint: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small,
    marginTop: 2,
  },
  uploadPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  uploadPreview: {
    width: 48, height: 48, borderRadius: BORDER_RADIUS.sm,
  },
  uploadLabelDone: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  uploadStatusDone: {
    color: COLORS.success, fontSize: FONT_SIZES.small,
    marginTop: 2, fontWeight: FONT_WEIGHTS.medium,
  },

  // Misc
  error: { color: COLORS.coralRed, fontSize: FONT_SIZES.small, marginBottom: SPACING.md, marginTop: -SPACING.md },
  timerContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginVertical: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  timerText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
  attemptsText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  resendLink: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.body,
    textAlign: 'center', textDecorationLine: 'underline', marginTop: SPACING.md,
  },
  toggleContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  toggleText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body },
  toggleLink: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
});

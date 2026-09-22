import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

export default function LoginScreen() {
    const [correo, setCorreo] = useState('');
    const [contrasena, setContrasena] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signIn } = useAuth();
    const router = useRouter();

    const handleLogin = async () => {
        setError('');

        if (!correo.trim() || !contrasena.trim()) {
            setError('Por favor complete todos los campos.');
            return;
        }

        setLoading(true);
        const { error: signInError } = await signIn(correo.trim(), contrasena);
        setLoading(false);

        if (signInError) {
            setError(signInError);
        }
        // Navigation is handled automatically by the root layout guard
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoText}>AP</Text>
                        </View>
                    </View>
                    <Text style={styles.appName}>AcaPlan</Text>
                    <Text style={styles.subtitle}>
                        Gestión de Horarios Académicos
                    </Text>
                    <Text style={styles.institution}>
                        UNAN-Managua · CUR-Chontales
                    </Text>
                </View>

                {/* Form Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Iniciar Sesión</Text>

                    {error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>⚠ {error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Correo institucional</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="correo@unan.edu.ni"
                            placeholderTextColor={Colors.textTertiary}
                            value={correo}
                            onChangeText={setCorreo}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Contraseña</Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                style={[styles.input, styles.passwordInput]}
                                placeholder="••••••••"
                                placeholderTextColor={Colors.textTertiary}
                                value={contrasena}
                                onChangeText={setContrasena}
                                secureTextEntry={!showPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color={Colors.white} />
                        ) : (
                            <Text style={styles.buttonText}>Acceder</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.forgotButton}
                        onPress={() => router.push('/(auth)/forgot-password')}
                        disabled={loading}
                    >
                        <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>
                    © 2026 CUR-Chontales "Cornelio Silva Argüello"
                </Text>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.primary,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.xxxl,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xxxl,
    },
    logoContainer: {
        marginBottom: Spacing.lg,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    logoText: {
        fontSize: Typography.sizes.xxl,
        fontWeight: '700',
        color: Colors.white,
        letterSpacing: 2,
    },
    appName: {
        fontSize: Typography.sizes.xxxl,
        fontWeight: '700',
        color: Colors.white,
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: Typography.sizes.md,
        color: 'rgba(255,255,255,0.8)',
        marginTop: Spacing.xs,
    },
    institution: {
        fontSize: Typography.sizes.sm,
        color: 'rgba(255,255,255,0.6)',
        marginTop: Spacing.xs,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        ...Shadows.lg,
    },
    cardTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.xl,
        textAlign: 'center',
    },
    errorContainer: {
        backgroundColor: '#FEF2F2',
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
        borderLeftWidth: 3,
        borderLeftColor: Colors.error,
    },
    errorText: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
    },
    inputGroup: {
        marginBottom: Spacing.lg,
    },
    label: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md + 2,
        fontSize: Typography.sizes.md,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    passwordContainer: {
        position: 'relative',
    },
    passwordInput: {
        paddingRight: 50,
    },
    eyeButton: {
        position: 'absolute',
        right: Spacing.md,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    eyeText: {
        fontSize: 18,
    },
    button: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: Colors.white,
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
    },
    forgotButton: {
        alignItems: 'center',
        marginTop: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    forgotText: {
        color: Colors.textLink,
        fontSize: Typography.sizes.sm,
    },
    footer: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.5)',
        fontSize: Typography.sizes.xs,
        marginTop: Spacing.xxl,
    },
});

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
    View,
} from 'react-native';

export default function ForgotPasswordScreen() {
    const [correo, setCorreo] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const { resetPassword } = useAuth();
    const router = useRouter();

    const handleReset = async () => {
        setError('');

        if (!correo.trim()) {
            setError('Ingrese su correo institucional.');
            return;
        }

        setLoading(true);
        const { error: resetError } = await resetPassword(correo.trim());
        setLoading(false);

        if (resetError) {
            setError(resetError);
        } else {
            setSent(true);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backText}>← Volver</Text>
                </TouchableOpacity>

                <View style={styles.card}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>🔐</Text>
                    </View>

                    <Text style={styles.title}>Recuperar Contraseña</Text>

                    {sent ? (
                        <View style={styles.successContainer}>
                            <Text style={styles.successIcon}>✅</Text>
                            <Text style={styles.successTitle}>Correo enviado</Text>
                            <Text style={styles.successText}>
                                Si el correo está registrado, recibirás un enlace para restablecer
                                tu contraseña. El enlace vence en 30 minutos.
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => router.replace('/(auth)/login')}
                            >
                                <Text style={styles.buttonText}>Volver al inicio</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.description}>
                                Ingresa tu correo institucional y te enviaremos un enlace para
                                restablecer tu contraseña.
                            </Text>

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

                            <TouchableOpacity
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={handleReset}
                                disabled={loading}
                                activeOpacity={0.8}
                            >
                                {loading ? (
                                    <ActivityIndicator color={Colors.white} />
                                ) : (
                                    <Text style={styles.buttonText}>Enviar enlace</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
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
    },
    backButton: {
        position: 'absolute',
        top: 60,
        left: Spacing.xl,
        zIndex: 10,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    backText: {
        color: Colors.white,
        fontSize: Typography.sizes.md,
        fontWeight: '500',
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        ...Shadows.lg,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    icon: {
        fontSize: 48,
    },
    title: {
        fontSize: Typography.sizes.xl,
        fontWeight: '600',
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    description: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
        marginBottom: Spacing.xl,
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
    successContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.lg,
    },
    successIcon: {
        fontSize: 48,
        marginBottom: Spacing.lg,
    },
    successTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.success,
        marginBottom: Spacing.md,
    },
    successText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
        marginBottom: Spacing.xxl,
    },
});

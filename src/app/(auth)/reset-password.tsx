import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResetPasswordScreen() {
    const { passwordRecovery, completePasswordRecovery } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [complete, setComplete] = useState(false);

    const handleSave = async () => {
        setError('');
        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (password !== confirmation) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        const result = await completePasswordRecovery(password);
        setLoading(false);
        if (result.error) {
            setError(result.error);
            return;
        }
        setComplete(true);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.card}>
                    <Text style={styles.icon}>{complete ? '✅' : '🔐'}</Text>
                    <Text style={styles.title}>
                        {complete ? 'Contraseña actualizada' : 'Crear una nueva contraseña'}
                    </Text>

                    {complete ? (
                        <>
                            <Text style={styles.description}>
                                Ya puedes iniciar sesión con tu nueva contraseña.
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => router.replace('/(auth)/login')}
                            >
                                <Text style={styles.buttonText}>Volver al inicio</Text>
                            </TouchableOpacity>
                        </>
                    ) : !passwordRecovery ? (
                        <>
                            <Text style={styles.description}>
                                Este enlace no es válido o ya venció. Solicita uno nuevo para continuar.
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => router.replace('/(auth)/forgot-password')}
                            >
                                <Text style={styles.buttonText}>Solicitar otro enlace</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={styles.description}>
                                Usa al menos 8 caracteres y vuelve a escribir la contraseña para confirmarla.
                            </Text>
                            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

                            <Text style={styles.label}>Nueva contraseña</Text>
                            <TextInput
                                style={styles.input}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                autoCapitalize="none"
                                autoComplete="new-password"
                                textContentType="newPassword"
                                editable={!loading}
                                returnKeyType="next"
                            />

                            <Text style={styles.label}>Confirmar contraseña</Text>
                            <TextInput
                                style={styles.input}
                                value={confirmation}
                                onChangeText={setConfirmation}
                                secureTextEntry
                                autoCapitalize="none"
                                autoComplete="new-password"
                                textContentType="newPassword"
                                editable={!loading}
                                returnKeyType="done"
                                onSubmitEditing={() => void handleSave()}
                            />

                            <TouchableOpacity
                                style={[styles.button, loading && styles.buttonDisabled]}
                                onPress={() => void handleSave()}
                                disabled={loading}
                                activeOpacity={0.8}
                            >
                                {loading
                                    ? <ActivityIndicator color={Colors.white} />
                                    : <Text style={styles.buttonText}>Guardar contraseña</Text>}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.primary,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
    },
    icon: {
        fontSize: 42,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    title: {
        color: Colors.textPrimary,
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    description: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    label: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        marginBottom: Spacing.xs,
    },
    input: {
        backgroundColor: Colors.background,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        color: Colors.textPrimary,
        fontSize: Typography.sizes.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.lg,
    },
    error: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
        marginBottom: Spacing.md,
    },
    button: {
        alignItems: 'center',
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.sm,
        paddingVertical: Spacing.lg,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: Colors.white,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
});

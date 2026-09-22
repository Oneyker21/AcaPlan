import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DocenteHomeScreen() {
    const { profile } = useAuth();

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.content}>
                {/* Welcome */}
                <View style={styles.welcomeCard}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>
                            {profile?.nombre?.charAt(0)?.toUpperCase() || 'D'}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.welcomeLabel}>Bienvenido/a</Text>
                        <Text style={styles.welcomeName}>{profile?.nombre || 'Docente'}</Text>
                    </View>
                </View>

                {/* Placeholder for Sprint 4 */}
                <View style={styles.placeholderCard}>
                    <Text style={styles.placeholderIcon}>📅</Text>
                    <Text style={styles.placeholderTitle}>Tu horario semanal</Text>
                    <Text style={styles.placeholderText}>
                        La consulta de horarios estará disponible próximamente.{'\n'}
                        Se mostrará aquí tu horario del período activo.
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    welcomeCard: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xxl,
        ...Shadows.md,
    },
    avatarCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.lg,
    },
    avatarText: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.white,
    },
    welcomeLabel: {
        fontSize: Typography.sizes.sm,
        color: 'rgba(255,255,255,0.7)',
    },
    welcomeName: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.white,
        marginTop: 2,
    },
    placeholderCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xxxl,
        alignItems: 'center',
        ...Shadows.sm,
    },
    placeholderIcon: {
        fontSize: 56,
        marginBottom: Spacing.lg,
    },
    placeholderTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    placeholderText: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: Typography.sizes.sm * Typography.lineHeights.relaxed,
    },
});

import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DocenteProfileScreen() {
    const { profile, signOut } = useAuth();

    const handleSignOut = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro de que deseas cerrar sesión? Se eliminarán los datos locales.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cerrar Sesión',
                    style: 'destructive',
                    onPress: signOut,
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>
                            {profile?.nombre?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                    </View>
                    <Text style={styles.profileName}>{profile?.nombre || '—'}</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleText}>👨‍🏫 Docente</Text>
                    </View>
                </View>

                {/* Info */}
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Información de la cuenta</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>📧 Correo</Text>
                        <Text style={styles.infoValue}>{profile?.correo || '—'}</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>🪪 Cédula</Text>
                        <Text style={styles.infoValue}>{profile?.cedula || '—'}</Text>
                    </View>
                </View>

                {/* Sign Out */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.8}
                >
                    <Text style={styles.signOutText}>🚪 Cerrar Sesión</Text>
                </TouchableOpacity>

                <Text style={styles.footer}>
                    AcaPlan v1.0.0 · UNAN-Managua, CUR-Chontales
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: Spacing.lg,
        paddingBottom: Spacing.huge,
    },
    profileCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xxl,
        alignItems: 'center',
        marginBottom: Spacing.lg,
        ...Shadows.sm,
    },
    avatarCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    avatarText: {
        fontSize: Typography.sizes.xxxl,
        fontWeight: '700',
        color: Colors.white,
    },
    profileName: {
        fontSize: Typography.sizes.xl,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    roleBadge: {
        backgroundColor: Colors.success + '15',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs + 2,
        borderRadius: BorderRadius.full,
    },
    roleText: {
        color: Colors.success,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
    },
    infoCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        marginBottom: Spacing.xxl,
        ...Shadows.sm,
    },
    infoTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.lg,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    infoLabel: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },
    infoValue: {
        fontSize: Typography.sizes.sm,
        fontWeight: '500',
        color: Colors.textPrimary,
        flex: 1,
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.borderLight,
        marginVertical: Spacing.sm,
    },
    signOutButton: {
        backgroundColor: Colors.error + '10',
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.error + '20',
        marginBottom: Spacing.xxl,
    },
    signOutText: {
        color: Colors.error,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
    footer: {
        textAlign: 'center',
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
    },
});

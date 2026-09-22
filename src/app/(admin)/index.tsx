import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminDashboard() {
    const { profile } = useAuth();

    const stats = [
        { label: 'Docentes', value: '—', icon: '👨‍🏫', color: '#4A90D9' },
        { label: 'Asignaturas', value: '—', icon: '📚', color: '#2ECC71' },
        { label: 'Aulas', value: '—', icon: '🏫', color: '#F39C12' },
        { label: 'Secciones', value: '—', icon: '📋', color: '#E74C3C' },
    ];

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Welcome Section */}
                <View style={styles.welcomeCard}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>
                            {profile?.nombre?.charAt(0)?.toUpperCase() || 'A'}
                        </Text>
                    </View>
                    <View style={styles.welcomeTextContainer}>
                        <Text style={styles.welcomeLabel}>Bienvenido/a</Text>
                        <Text style={styles.welcomeName}>{profile?.nombre || 'Administrador'}</Text>
                    </View>
                </View>

                {/* Stats Grid */}
                <Text style={styles.sectionTitle}>Resumen General</Text>
                <View style={styles.statsGrid}>
                    {stats.map((stat, index) => (
                        <View key={index} style={styles.statCard}>
                            <View style={[styles.statIconBg, { backgroundColor: stat.color + '15' }]}>
                                <Text style={styles.statIcon}>{stat.icon}</Text>
                            </View>
                            <Text style={styles.statValue}>{stat.value}</Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                {/* Quick Actions */}
                <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                <View style={styles.actionsContainer}>
                    {[
                        { label: 'Gestionar Cuentas', icon: '👥', desc: 'Crear, editar o desactivar' },
                        { label: 'Períodos Académicos', icon: '📅', desc: 'Configurar período activo' },
                    ].map((action, index) => (
                        <View key={index} style={styles.actionCard}>
                            <Text style={styles.actionIcon}>{action.icon}</Text>
                            <View style={styles.actionTextContainer}>
                                <Text style={styles.actionLabel}>{action.label}</Text>
                                <Text style={styles.actionDesc}>{action.desc}</Text>
                            </View>
                            <Text style={styles.actionArrow}>›</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingBottom: Spacing.huge,
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
    welcomeTextContainer: {
        flex: 1,
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
    sectionTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        marginBottom: Spacing.xxl,
    },
    statCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        width: '47%',
        alignItems: 'center',
        ...Shadows.sm,
    },
    statIconBg: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    statIcon: {
        fontSize: 20,
    },
    statValue: {
        fontSize: Typography.sizes.xxl,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    statLabel: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    actionsContainer: {
        gap: Spacing.md,
    },
    actionCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        ...Shadows.sm,
    },
    actionIcon: {
        fontSize: 28,
        marginRight: Spacing.lg,
    },
    actionTextContainer: {
        flex: 1,
    },
    actionLabel: {
        fontSize: Typography.sizes.md,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    actionDesc: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    actionArrow: {
        fontSize: Typography.sizes.xxl,
        color: Colors.textTertiary,
        fontWeight: '300',
    },
});

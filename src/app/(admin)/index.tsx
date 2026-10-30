import { adminActionGroups } from '@/constants/admin-navigation';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DashboardCounts = {
    docentes: string;
    asignaturas: string;
    aulas: string;
    secciones: string;
};

const emptyCounts: DashboardCounts = {
    docentes: '—',
    asignaturas: '—',
    aulas: '—',
    secciones: '—',
};

export default function AdminDashboard() {
    const { profile } = useAuth();
    const router = useRouter();
    const [counts, setCounts] = useState(emptyCounts);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [countsError, setCountsError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let mounted = true;

        const loadCounts = async () => {
            setLoadingCounts(true);
            setCountsError(false);

            try {
                const results = await Promise.all([
                    supabase.from('usuarios').select('id_usuario', { count: 'exact', head: true }).eq('rol', 'docente'),
                    supabase.from('asignaturas').select('id_asignatura', { count: 'exact', head: true }),
                    supabase.from('aulas').select('id_aula', { count: 'exact', head: true }),
                    supabase.from('secciones').select('id_seccion', { count: 'exact', head: true }),
                ]);

                if (!mounted) return;

                const [docentes, asignaturas, aulas, secciones] = results;
                setCounts({
                    docentes: docentes.error ? '—' : String(docentes.count ?? 0),
                    asignaturas: asignaturas.error ? '—' : String(asignaturas.count ?? 0),
                    aulas: aulas.error ? '—' : String(aulas.count ?? 0),
                    secciones: secciones.error ? '—' : String(secciones.count ?? 0),
                });
                setCountsError(results.some((result) => result.error !== null));
            } catch (error) {
                console.error('No se pudieron cargar los indicadores del administrador.', error);
                if (mounted) {
                    setCounts(emptyCounts);
                    setCountsError(true);
                }
            } finally {
                if (mounted) setLoadingCounts(false);
            }
        };

        void loadCounts();
        return () => {
            mounted = false;
        };
    }, [refreshKey]);

    const stats = [
        { label: 'Docentes', value: counts.docentes, icon: '👨‍🏫', color: Colors.accent },
        { label: 'Asignaturas', value: counts.asignaturas, icon: '📚', color: Colors.success },
        { label: 'Aulas', value: counts.aulas, icon: '🏫', color: Colors.warning },
        { label: 'Secciones', value: counts.secciones, icon: '📋', color: Colors.error },
    ];

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loadingCounts}
                        onRefresh={() => setRefreshKey((current) => current + 1)}
                        tintColor={Colors.primary}
                    />
                }
            >
                <View style={styles.welcomeCard}>
                    <View style={styles.welcomeCopy}>
                        <Text style={styles.eyebrow}>PANEL DE ADMINISTRACIÓN</Text>
                        <Text style={styles.welcomeName}>Hola, {profile?.nombre || 'Administrador'}</Text>
                        <Text style={styles.welcomeDescription}>
                            Gestiona la información académica y la planificación desde un solo lugar.
                        </Text>
                    </View>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>
                            {profile?.nombre?.charAt(0)?.toUpperCase() || 'A'}
                        </Text>
                    </View>
                </View>

                <View style={styles.sectionHeading}>
                    <View>
                        <Text style={styles.sectionTitle}>Resumen institucional</Text>
                        <Text style={styles.sectionSubtitle}>Indicadores generales</Text>
                    </View>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Actualizar indicadores"
                        style={styles.refreshButton}
                        onPress={() => setRefreshKey((current) => current + 1)}
                    >
                        <Text style={styles.refreshButtonText}>↻</Text>
                    </TouchableOpacity>
                </View>

                {countsError && (
                    <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => setRefreshKey((current) => current + 1)}
                        style={styles.errorBanner}
                    >
                        <Text style={styles.errorText}>
                            No se pudieron cargar algunos indicadores. Toca para volver a intentar.
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={styles.statsGrid}>
                    {stats.map((stat) => (
                        <View key={stat.label} style={styles.statCard}>
                            <View style={[styles.statIconBg, { backgroundColor: `${stat.color}18` }]}>
                                <Text style={styles.statIcon}>{stat.icon}</Text>
                            </View>
                            <Text style={styles.statValue}>
                                {loadingCounts ? '…' : stat.value}
                            </Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.actionsHeading}>
                    <Text style={styles.sectionTitle}>Administración académica</Text>
                    <Text style={styles.sectionSubtitle}>
                        Accesos a todas las herramientas disponibles para tu rol.
                    </Text>
                </View>

                {adminActionGroups.map((group) => (
                    <View key={group.title} style={styles.actionGroup}>
                        <Text style={styles.groupTitle}>{group.title}</Text>
                        <View style={styles.actionsContainer}>
                            {group.actions.map((action) => (
                                <TouchableOpacity
                                    key={action.href}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${action.title}. ${action.description}`}
                                    style={styles.actionCard}
                                    onPress={() => router.push(action.href)}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.actionIconBg}>
                                        <Text style={styles.actionIcon}>{action.icon}</Text>
                                    </View>
                                    <View style={styles.actionTextContainer}>
                                        <Text style={styles.actionLabel}>{action.title}</Text>
                                        <Text style={styles.actionDescription}>{action.description}</Text>
                                    </View>
                                    <Text style={styles.actionArrow}>›</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}
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
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xxl,
        ...Shadows.md,
    },
    welcomeCopy: {
        flex: 1,
        paddingRight: Spacing.md,
    },
    eyebrow: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        letterSpacing: 1,
        color: Colors.accentLight,
        marginBottom: Spacing.sm,
    },
    welcomeName: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.white,
    },
    welcomeDescription: {
        fontSize: Typography.sizes.sm,
        lineHeight: 19,
        color: 'rgba(255,255,255,0.8)',
        marginTop: Spacing.sm,
    },
    avatarCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.white,
    },
    sectionHeading: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    sectionTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    sectionSubtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 3,
    },
    refreshButton: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    refreshButtonText: {
        color: Colors.primary,
        fontSize: Typography.sizes.xxl,
        lineHeight: 30,
    },
    errorBanner: {
        backgroundColor: '#FFF3F1',
        borderColor: Colors.error,
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    errorText: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
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
        flexBasis: '45%',
        flexGrow: 1,
        minWidth: 130,
        ...Shadows.sm,
    },
    statIconBg: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
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
    actionsHeading: {
        marginBottom: Spacing.lg,
    },
    actionGroup: {
        marginBottom: Spacing.xl,
    },
    groupTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: Spacing.sm,
    },
    actionsContainer: {
        gap: Spacing.sm,
    },
    actionCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        padding: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 76,
        ...Shadows.sm,
    },
    actionIconBg: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surfaceElevated,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    actionIcon: {
        fontSize: 22,
    },
    actionTextContainer: {
        flex: 1,
    },
    actionLabel: {
        fontSize: Typography.sizes.md,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    actionDescription: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 3,
    },
    actionArrow: {
        fontSize: Typography.sizes.xxl,
        color: Colors.textTertiary,
        marginLeft: Spacing.sm,
    },
});

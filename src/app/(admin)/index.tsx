import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminDashboard() {
    const { profile } = useAuth();
    const router = useRouter();
    const [counts, setCounts] = useState({ docentes: '—', asignaturas: '—', aulas: '—', secciones: '—' });

    useEffect(() => {
        let mounted = true;
        void Promise.all([
            supabase.from('usuarios').select('id_usuario', { count: 'exact', head: true }).eq('rol', 'docente'),
            supabase.from('asignaturas').select('id_asignatura', { count: 'exact', head: true }),
            supabase.from('aulas').select('id_aula', { count: 'exact', head: true }),
            supabase.from('secciones').select('id_seccion', { count: 'exact', head: true }),
        ]).then(([docentes, asignaturas, aulas, secciones]) => {
            if (!mounted) return;
            setCounts({
                docentes: docentes.error ? '—' : String(docentes.count ?? 0),
                asignaturas: asignaturas.error ? '—' : String(asignaturas.count ?? 0),
                aulas: aulas.error ? '—' : String(aulas.count ?? 0),
                secciones: secciones.error ? '—' : String(secciones.count ?? 0),
            });
        }).catch(() => undefined);
        return () => { mounted = false; };
    }, []);

    const stats = [
        { label: 'Docentes', value: counts.docentes, icon: '👨‍🏫', color: '#4A90D9' },
        { label: 'Asignaturas', value: counts.asignaturas, icon: '📚', color: '#2ECC71' },
        { label: 'Aulas', value: counts.aulas, icon: '🏫', color: '#F39C12' },
        { label: 'Secciones', value: counts.secciones, icon: '📋', color: '#E74C3C' },
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
                        { label: 'Gestionar Cuentas', icon: '👥', desc: 'Crear, editar o desactivar', route: '/(admin)/accounts' },
                        { label: 'Períodos Académicos', icon: '📅', desc: 'Configurar período activo', route: '/(admin)/periods' },
                        { label: 'Secciones Académicas', icon: '📚', desc: 'Gestionar secciones y asignaturas', route: '/(admin)/sections' },
                        { label: 'Bloques de Clase', icon: '⏰', desc: 'Configurar duración y recesos', route: '/(admin)/blocks' },
                        { label: 'Catálogos', icon: '🏫', desc: 'Gestionar carreras, asignaturas, pabellones y aulas', route: '/(admin)/catalogs' },
                        { label: 'Generador de Horarios con IA', icon: '🤖', desc: 'Búsqueda inteligente sin cruces (CSP y optimización)', route: '/(admin)/ai-generator' },
                        { label: 'Planificar Horarios', icon: '🗓️', desc: 'Asignar recursos y publicar horarios', route: '/(admin)/schedule' },
                        { label: 'Consultar Horarios', icon: '👀', desc: 'Revisar propuestas compartidas y horarios oficiales', route: '/(admin)/consultation' },
                        { label: 'Asignación Académica', icon: '🧑‍🏫', desc: 'Registrar grupos, docentes y necesidades', route: '/(admin)/academic-assignments' },
                        { label: 'Importar Asignación', icon: '📥', desc: 'Validar el archivo oficial en vista previa', route: '/(admin)/assignment-import' },
                        { label: 'Departamentos y Jefaturas', icon: '🏛️', desc: 'Gestionar departamentos, jefes y asignaturas', route: '/(admin)/departments' },
                    ].map((action, index) => (
                        <TouchableOpacity key={index} style={styles.actionCard} onPress={() => router.push(action.route as any)} activeOpacity={0.7}>
                            <Text style={styles.actionIcon}>{action.icon}</Text>
                            <View style={styles.actionTextContainer}>
                                <Text style={styles.actionLabel}>{action.label}</Text>
                                <Text style={styles.actionDesc}>{action.desc}</Text>
                            </View>
                            <Text style={styles.actionArrow}>›</Text>
                        </TouchableOpacity>
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

import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DepartmentHeadHomeScreen() {
    const { profile, signOut } = useAuth();

    const handleSignOut = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro de que deseas cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Cerrar Sesión', style: 'destructive', onPress: () => void signOut() },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.kicker}>Jefatura de departamento</Text>
                <Text style={styles.title}>Hola, {profile?.nombre ?? 'bienvenido'}</Text>
                <Text style={styles.subtitle}>Registre únicamente restricciones autorizadas para las carreras asignadas a su cuenta.</Text>
                <Link href={"/(jefatura)/teachers" as any} asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>👩‍🏫</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Docentes del departamento</Text><Text style={styles.cardHint}>Registrar docentes, modalidad (planta/horario) y componentes</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(jefatura)/restrictions" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>🧭</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Restricciones académicas</Text><Text style={styles.cardHint}>Registrar, validar y actualizar condiciones comunicadas</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(jefatura)/schedules" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>🗓️</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Consultar horarios</Text><Text style={styles.cardHint}>Ver las propuestas habilitadas para su perfil</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>

                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
                    <Text style={styles.signOutText}>🚪 Cerrar Sesión</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    content: { padding: Spacing.lg, paddingBottom: Spacing.huge },
    kicker: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700', marginTop: Spacing.xs },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.xl, fontWeight: '700', marginTop: Spacing.xs },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginBottom: Spacing.xl, marginTop: Spacing.sm },
    card: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, flexDirection: 'row', marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    icon: { fontSize: 28, marginRight: Spacing.md },
    copy: { flex: 1 },
    cardTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700' },
    cardHint: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    arrow: { color: Colors.textTertiary, fontSize: Typography.sizes.xxl },
    signOutButton: {
        alignItems: 'center',
        backgroundColor: Colors.white,
        borderColor: Colors.error,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        justifyContent: 'center',
        marginTop: Spacing.lg,
        minHeight: 48,
        paddingHorizontal: Spacing.lg,
    },
    signOutText: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
    },
});

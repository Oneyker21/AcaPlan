import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CoordinationHomeScreen() {
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
                <Text style={styles.kicker}>Coordinación académica</Text>
                <Text style={styles.title}>Hola, {profile?.nombre ?? 'bienvenido'}</Text>
                <Text style={styles.subtitle}>Gestione únicamente las carreras asignadas a su cuenta.</Text>
                <Link href="/(coordinacion)/subjects" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>📘</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Asignaturas</Text><Text style={styles.cardHint}>Registrar y buscar asignaturas de sus carreras</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(coordinacion)/sections" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>📚</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Grupos académicos</Text><Text style={styles.cardHint}>Registrar grupos y vincular sus asignaturas</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(coordinacion)/assignments" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>👩‍🏫</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Asignación académica</Text><Text style={styles.cardHint}>Registrar docentes y necesidades de espacio</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(coordinacion)/restrictions" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>🧭</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Restricciones autorizadas</Text><Text style={styles.cardHint}>Consultar las condiciones comunicadas para sus carreras</Text></View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                </Link>
                <Link href="/(coordinacion)/schedules" asChild>
                    <TouchableOpacity style={styles.card}>
                        <Text style={styles.icon}>🗓️</Text>
                        <View style={styles.copy}><Text style={styles.cardTitle}>Revisar horarios</Text><Text style={styles.cardHint}>Consultar propuestas compartidas y horarios oficiales</Text></View>
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

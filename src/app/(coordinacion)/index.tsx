import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CoordinationHomeScreen() {
    const { profile } = useAuth();
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
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
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    content: { padding: Spacing.lg },
    kicker: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700', marginTop: Spacing.lg },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.xl, fontWeight: '700', marginTop: Spacing.xs },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginBottom: Spacing.xl, marginTop: Spacing.sm },
    card: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, flexDirection: 'row', marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    icon: { fontSize: 28, marginRight: Spacing.md },
    copy: { flex: 1 },
    cardTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700' },
    cardHint: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    arrow: { color: Colors.textTertiary, fontSize: Typography.sizes.xxl },
});

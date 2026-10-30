import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PlanningRoom {
    id_aula: number;
    codigo: string;
    capacidad: number;
    tipo: string;
    estado: 'activo' | 'inactivo';
    id_pabellon: number;
}

interface Pavilion {
    id_pabellon: number;
    nombre: string;
    sede: string;
}

interface RoomResourceLink {
    id_aula: number;
    id_recurso: number;
}

interface Resource {
    id_recurso: number;
    nombre: string;
}

export default function PlanningHomeScreen() {
    const { signOut } = useAuth();
    const [rooms, setRooms] = useState<PlanningRoom[]>([]);
    const [pavilions, setPavilions] = useState<Pavilion[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [roomResources, setRoomResources] = useState<RoomResourceLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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

    const fetchInventory = useCallback(async () => {
        try {
            const [roomsResult, pavilionsResult, resourcesResult, linksResult] = await Promise.all([
                supabase.from('aulas').select('id_aula, codigo, capacidad, tipo, estado, id_pabellon').order('codigo'),
                supabase.from('pabellones').select('id_pabellon, sede, nombre').order('sede').order('nombre'),
                supabase.from('recursos').select('id_recurso, nombre').order('nombre'),
                supabase.from('aula_recurso').select('id_aula, id_recurso'),
            ]);

            if (roomsResult.error || pavilionsResult.error || resourcesResult.error || linksResult.error) {
                throw new Error('No se pudo cargar el inventario de espacios.');
            }
            setRooms((roomsResult.data ?? []) as PlanningRoom[]);
            setPavilions((pavilionsResult.data ?? []) as Pavilion[]);
            setResources((resourcesResult.data ?? []) as Resource[]);
            setRoomResources((linksResult.data ?? []) as RoomResourceLink[]);
        } catch {
            // Keep the last successful inventory visible while the user retries.
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void fetchInventory();
    }, [fetchInventory]);

    const renderRoom = ({ item }: { item: PlanningRoom }) => {
        const pavilion = pavilions.find((entry) => entry.id_pabellon === item.id_pabellon);
        const itemResources = roomResources
            .filter((link) => link.id_aula === item.id_aula)
            .map((link) => resources.find((resource) => resource.id_recurso === link.id_recurso)?.nombre)
            .filter(Boolean);
        return (
            <View style={styles.roomCard}>
                <View style={styles.roomHeader}>
                    <Text style={styles.roomTitle}>{item.codigo} · {item.tipo || 'Espacio'}</Text>
                    <Text style={[styles.status, item.estado === 'activo' ? styles.statusActive : styles.statusInactive]}>
                        {item.estado === 'activo' ? 'Disponible' : 'No disponible'}
                    </Text>
                </View>
                <Text style={styles.roomDetail}>{pavilion?.sede ?? 'Sede sin especificar'} · {pavilion?.nombre ?? 'Pabellón sin especificar'}</Text>
                <Text style={styles.roomDetail}>Capacidad: {item.capacidad}</Text>
                <Text style={styles.roomDetail}>Recursos: {itemResources.join(', ') || 'Sin recursos registrados'}</Text>
            </View>
        );
    };

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <Text style={styles.title}>Planificación</Text>
                <Text style={styles.subtitle}>Inventario institucional de espacios</Text>
                <View style={styles.actions}>
                    <Link href="/(planificacion)/careers" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Carreras</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/subjects" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Asignaturas</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/sections" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Grupos</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/assignments" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Asignaciones</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/assignment-import" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Importar asignación</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/blocks" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Cuadrículas de horario</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/planning-rules" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Reglas del horario</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/schedule" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Borradores de horario</Text></TouchableOpacity></Link>
                    <Link href={"/(planificacion)/ai-generator" as any} asChild><TouchableOpacity style={[styles.actionButton, { backgroundColor: '#1E40AF' }]}><Text style={[styles.actionText, { color: Colors.white }]}>🤖 Generador con IA</Text></TouchableOpacity></Link>
                    <Link href="/(planificacion)/consultation" asChild><TouchableOpacity style={styles.actionButton}><Text style={styles.actionText}>Consultar horarios</Text></TouchableOpacity></Link>
                    <TouchableOpacity style={[styles.actionButton, styles.signOutAction]} onPress={handleSignOut}><Text style={styles.signOutActionText}>🚪 Cerrar Sesión</Text></TouchableOpacity>
                </View>
                <Link href="/(planificacion)/inventory-import" asChild>
                    <TouchableOpacity style={styles.importButton}>
                        <Text style={styles.importButtonText}>Importar inventario oficial</Text>
                    </TouchableOpacity>
                </Link>
            </View>
            <FlatList
                data={rooms}
                renderItem={renderRoom}
                keyExtractor={(item) => String(item.id_aula)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchInventory(); }} />}
                ListEmptyComponent={<Text style={styles.emptyText}>No hay espacios registrados todavía.</Text>}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    header: { padding: Spacing.lg },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.xl, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, marginTop: Spacing.xs },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
    actionButton: { alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: Spacing.md },
    actionText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    signOutAction: { borderColor: Colors.error, backgroundColor: Colors.white },
    signOutActionText: { color: Colors.error, fontSize: Typography.sizes.xs, fontWeight: '700' },
    importButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, marginTop: Spacing.lg, minHeight: 46, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    importButtonText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.huge },
    roomCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    roomHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
    roomTitle: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.md, fontWeight: '700', paddingRight: Spacing.sm },
    status: { fontSize: Typography.sizes.xs, fontWeight: '600' },
    statusActive: { color: Colors.success },
    statusInactive: { color: Colors.textTertiary },
    roomDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, marginTop: Spacing.xs },
    emptyText: { color: Colors.textTertiary, fontSize: Typography.sizes.md, padding: Spacing.xl, textAlign: 'center' },
});

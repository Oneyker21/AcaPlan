import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Periodo } from '@/types/database';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PeriodForm {
    nombre: string;
    ano_lectivo: string;
    fecha_inicio: string;
    fecha_fin: string;
}

const emptyForm: PeriodForm = {
    nombre: '',
    ano_lectivo: new Date().getFullYear().toString(),
    fecha_inicio: '',
    fecha_fin: '',
};

export default function PeriodsScreen() {
    const [periodos, setPeriodos] = useState<Periodo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingPeriod, setEditingPeriod] = useState<Periodo | null>(null);
    const [form, setForm] = useState<PeriodForm>(emptyForm);
    const [saving, setSaving] = useState(false);

    const fetchPeriodos = useCallback(async () => {
        const { data, error } = await supabase
            .from('periodos')
            .select('*')
            .order('ano_lectivo', { ascending: false });

        if (!error && data) {
            setPeriodos(data as Periodo[]);
        }
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        fetchPeriodos();
    }, [fetchPeriodos]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchPeriodos();
    };

    const openCreateModal = () => {
        setEditingPeriod(null);
        setForm(emptyForm);
        setModalVisible(true);
    };

    const openEditModal = (period: Periodo) => {
        setEditingPeriod(period);
        setForm({
            nombre: period.nombre,
            ano_lectivo: period.ano_lectivo.toString(),
            fecha_inicio: period.fecha_inicio,
            fecha_fin: period.fecha_fin,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.nombre.trim() || !form.ano_lectivo.trim() || !form.fecha_inicio.trim() || !form.fecha_fin.trim()) {
            Alert.alert('Error', 'Todos los campos son obligatorios.');
            return;
        }

        // H12-CA1: Start before end
        if (form.fecha_inicio >= form.fecha_fin) {
            Alert.alert('Error', 'La fecha de inicio debe ser anterior a la fecha de fin.');
            return;
        }

        setSaving(true);

        try {
            const data = {
                nombre: form.nombre.trim(),
                ano_lectivo: parseInt(form.ano_lectivo),
                fecha_inicio: form.fecha_inicio,
                fecha_fin: form.fecha_fin,
            };

            if (editingPeriod) {
                const { error } = await supabase
                    .from('periodos')
                    .update(data)
                    .eq('id_periodo', editingPeriod.id_periodo);

                if (error) {
                    Alert.alert('Error', 'No se pudo actualizar el período.');
                    setSaving(false);
                    return;
                }
            } else {
                const { error } = await supabase
                    .from('periodos')
                    .insert({ ...data, es_activo: false });

                if (error) {
                    Alert.alert('Error', 'No se pudo crear el período.');
                    setSaving(false);
                    return;
                }
            }

            setModalVisible(false);
            fetchPeriodos();
        } catch {
            Alert.alert('Error', 'Error de conexión.');
        }

        setSaving(false);
    };

    // H12-CA2: Only one active period
    const handleToggleActive = async (period: Periodo) => {
        if (period.es_activo) {
            // Deactivate
            const { error } = await supabase
                .from('periodos')
                .update({ es_activo: false })
                .eq('id_periodo', period.id_periodo);

            if (!error) fetchPeriodos();
        } else {
            // Deactivate all, then activate this one
            Alert.alert(
                'Activar período',
                `¿Establecer "${period.nombre} ${period.ano_lectivo}" como período activo? Solo puede haber un período activo.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Activar',
                        onPress: async () => {
                            // Deactivate all
                            await supabase
                                .from('periodos')
                                .update({ es_activo: false })
                                .neq('id_periodo', 0);

                            // Activate selected
                            const { error } = await supabase
                                .from('periodos')
                                .update({ es_activo: true })
                                .eq('id_periodo', period.id_periodo);

                            if (!error) fetchPeriodos();
                        },
                    },
                ]
            );
        }
    };

    const renderPeriod = ({ item }: { item: Periodo }) => (
        <View style={[styles.periodCard, item.es_activo && styles.periodCardActive]}>
            <View style={styles.periodHeader}>
                <View>
                    <Text style={styles.periodName}>{item.nombre}</Text>
                    <Text style={styles.periodYear}>Año lectivo: {item.ano_lectivo}</Text>
                </View>
                {item.es_activo && (
                    <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>ACTIVO</Text>
                    </View>
                )}
            </View>

            <View style={styles.dateRow}>
                <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>Inicio</Text>
                    <Text style={styles.dateValue}>{item.fecha_inicio}</Text>
                </View>
                <View style={styles.dateSeparator} />
                <View style={styles.dateItem}>
                    <Text style={styles.dateLabel}>Fin</Text>
                    <Text style={styles.dateValue}>{item.fecha_fin}</Text>
                </View>
            </View>

            <View style={styles.periodActions}>
                <TouchableOpacity
                    style={styles.periodEditBtn}
                    onPress={() => openEditModal(item)}
                >
                    <Text style={styles.periodEditText}>✏️ Editar</Text>
                </TouchableOpacity>

                <View style={styles.toggleContainer}>
                    <Text style={styles.toggleLabel}>
                        {item.es_activo ? 'Activo' : 'Inactivo'}
                    </Text>
                    <Switch
                        value={item.es_activo}
                        onValueChange={() => handleToggleActive(item)}
                        trackColor={{ false: Colors.border, true: Colors.accent + '50' }}
                        thumbColor={item.es_activo ? Colors.accent : Colors.textTertiary}
                    />
                </View>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <FlatList
                data={periodos}
                renderItem={renderPeriod}
                keyExtractor={(item) => item.id_periodo.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📅</Text>
                        <Text style={styles.emptyText}>No hay períodos registrados</Text>
                        <Text style={styles.emptySubtext}>Agrega el primer período académico</Text>
                    </View>
                }
            />

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={openCreateModal} activeOpacity={0.8}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            {/* Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>
                            {editingPeriod ? 'Editar Período' : 'Nuevo Período'}
                        </Text>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Nombre del período</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.nombre}
                                onChangeText={(v) => setForm({ ...form, nombre: v })}
                                placeholder="Ej: I Semestre"
                                placeholderTextColor={Colors.textTertiary}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Año lectivo</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.ano_lectivo}
                                onChangeText={(v) => setForm({ ...form, ano_lectivo: v })}
                                placeholder="2026"
                                placeholderTextColor={Colors.textTertiary}
                                keyboardType="numeric"
                            />
                        </View>

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Fecha inicio</Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={form.fecha_inicio}
                                    onChangeText={(v) => setForm({ ...form, fecha_inicio: v })}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={Colors.textTertiary}
                                />
                            </View>
                            <View style={{ width: Spacing.md }} />
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Fecha fin</Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={form.fecha_fin}
                                    onChangeText={(v) => setForm({ ...form, fecha_fin: v })}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={Colors.textTertiary}
                                />
                            </View>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setModalVisible(false)}
                                disabled={saving}
                            >
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color={Colors.white} size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    listContent: {
        padding: Spacing.lg,
        paddingBottom: 100,
    },
    periodCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        borderLeftWidth: 3,
        borderLeftColor: Colors.border,
        ...Shadows.sm,
    },
    periodCardActive: {
        borderLeftColor: Colors.accent,
    },
    periodHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    periodName: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    periodYear: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    activeBadge: {
        backgroundColor: Colors.accent + '15',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    activeBadgeText: {
        color: Colors.accent,
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    dateItem: {
        flex: 1,
        alignItems: 'center',
    },
    dateSeparator: {
        width: 1,
        height: 30,
        backgroundColor: Colors.border,
        marginHorizontal: Spacing.md,
    },
    dateLabel: {
        fontSize: Typography.sizes.xs,
        color: Colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    dateValue: {
        fontSize: Typography.sizes.md,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    periodActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    periodEditBtn: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
    },
    periodEditText: {
        fontSize: Typography.sizes.sm,
        color: Colors.primary,
        fontWeight: '500',
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    toggleLabel: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.huge,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyText: {
        fontSize: Typography.sizes.md,
        color: Colors.textTertiary,
        fontWeight: '500',
    },
    emptySubtext: {
        fontSize: Typography.sizes.sm,
        color: Colors.textTertiary,
        marginTop: Spacing.xs,
    },
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: Spacing.xxl,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.lg,
    },
    fabText: {
        fontSize: 28,
        color: Colors.white,
        fontWeight: '300',
        marginTop: -2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        padding: Spacing.xxl,
    },
    modalTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.xl,
        textAlign: 'center',
    },
    formGroup: {
        marginBottom: Spacing.lg,
    },
    formRow: {
        flexDirection: 'row',
    },
    formLabel: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
    },
    formInput: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        fontSize: Typography.sizes.md,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modalActions: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.lg,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cancelBtnText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
    saveBtn: {
        flex: 1,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        backgroundColor: Colors.primary,
    },
    saveBtnDisabled: {
        opacity: 0.7,
    },
    saveBtnText: {
        color: Colors.white,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
});

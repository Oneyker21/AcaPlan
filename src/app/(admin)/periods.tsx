import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Periodo } from '@/types/database';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
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
    const [loadError, setLoadError] = useState(false);

    // DateTimePicker States
    const [showInicioPicker, setShowInicioPicker] = useState(false);
    const [showFinPicker, setShowFinPicker] = useState(false);
    const [dateInicio, setDateInicio] = useState(new Date());
    const [dateFin, setDateFin] = useState(new Date());

    // Parseo seguro de fecha
    const getValidDate = (dateString: string) => {
        if (!dateString) return new Date();
        const parsed = new Date(dateString + 'T12:00:00Z');
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const handleDateInitioChange = (event: any, selectedDate?: Date) => {
        const currentDate = selectedDate || dateInicio;
        setShowInicioPicker(Platform.OS === 'ios');
        setDateInicio(currentDate);
        if (event.type !== 'dismissed' && selectedDate) {
            setForm({ ...form, fecha_inicio: currentDate.toISOString().split('T')[0] });
        }
    };

    const handleDateFinChange = (event: any, selectedDate?: Date) => {
        const currentDate = selectedDate || dateFin;
        setShowFinPicker(Platform.OS === 'ios');
        setDateFin(currentDate);
        if (event.type !== 'dismissed' && selectedDate) {
            setForm({ ...form, fecha_fin: currentDate.toISOString().split('T')[0] });
        }
    };

    const fetchPeriodos = useCallback(async () => {
        const { data, error } = await supabase
            .from('periodos')
            .select('*')
            .order('ano_lectivo', { ascending: false });

        if (error || !data) {
            setLoadError(true);
            Alert.alert('Error', 'No se pudieron cargar los períodos académicos. Deslice para volver a intentar.');
        } else {
            setPeriodos(data as Periodo[]);
            setLoadError(false);
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
    const activePeriod = periodos.find((period) => period.es_activo);

    const openCreateModal = () => {
        setEditingPeriod(null);
        setForm(emptyForm);
        setDateInicio(new Date());
        setDateFin(new Date());
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
        setDateInicio(getValidDate(period.fecha_inicio));
        setDateFin(getValidDate(period.fecha_fin));
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.nombre.trim() || !form.ano_lectivo.trim() || !form.fecha_inicio.trim() || !form.fecha_fin.trim()) {
            Alert.alert('Error', 'Todos los campos son obligatorios.');
            return;
        }

        if (form.nombre.trim().length > 50 || !/^\d{4}$/.test(form.ano_lectivo.trim())) {
            Alert.alert('Datos inválidos', 'Use un nombre de hasta 50 caracteres y un año de cuatro dígitos.');
            return;
        }

        const anoLectivo = Number(form.ano_lectivo);
        if (!Number.isInteger(anoLectivo) || anoLectivo < 1900 || anoLectivo > 9999) {
            Alert.alert('Año inválido', 'Ingrese un año académico entre 1900 y 9999.');
            return;
        }

        if (form.fecha_inicio >= form.fecha_fin) {
            Alert.alert('Error', 'La fecha de inicio debe ser anterior a la fecha de fin.');
            return;
        }

        setSaving(true);

        try {
            const data = {
                nombre: form.nombre.trim(),
                ano_lectivo: anoLectivo,
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

    const handleToggleActive = async (period: Periodo) => {
        if (period.es_activo) {
            const { error } = await supabase.rpc('clear_active_period', {
                p_period_id: period.id_periodo,
            });
            if (error) {
                Alert.alert('Error', 'No se pudo desactivar el período. Intente de nuevo.');
                return;
            }
            await fetchPeriodos();
        } else {
            Alert.alert(
                'Activar período',
                `¿Establecer "${period.nombre} ${period.ano_lectivo}" como período activo? Solo puede haber un período activo.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Activar',
                        onPress: async () => {
                            const { error } = await supabase.rpc('set_active_period', {
                                p_period_id: period.id_periodo,
                            });
                            if (error) {
                                Alert.alert('Error', 'No se pudo activar el período. Intente de nuevo.');
                                return;
                            }
                            await fetchPeriodos();
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
                ListHeaderComponent={
                    <View style={styles.listHeader}>
                        <Text style={styles.screenTitle}>Períodos académicos</Text>
                        <Text style={styles.screenSubtitle}>
                            Define el calendario y selecciona el período vigente para la planificación.
                        </Text>

                        <View style={styles.activePeriodCard}>
                            <View style={styles.activePeriodIcon}>
                                <Text style={styles.activePeriodIconText}>📅</Text>
                            </View>
                            <View style={styles.activePeriodCopy}>
                                <Text style={styles.activePeriodLabel}>PERÍODO ACTIVO</Text>
                                <Text style={styles.activePeriodName}>
                                    {activePeriod
                                        ? `${activePeriod.nombre} ${activePeriod.ano_lectivo}`
                                        : 'Sin período activo'}
                                </Text>
                                <Text style={styles.activePeriodDates}>
                                    {activePeriod
                                        ? `${activePeriod.fecha_inicio} — ${activePeriod.fecha_fin}`
                                        : 'Activa un período para establecer el ciclo vigente.'}
                                </Text>
                            </View>
                            <View
                                style={[
                                    styles.activePeriodDot,
                                    !activePeriod && styles.inactivePeriodDot,
                                ]}
                            />
                        </View>

                        <View style={styles.periodSummaryRow}>
                            <View style={styles.periodSummaryCard}>
                                <Text style={styles.periodSummaryValue}>{periodos.length}</Text>
                                <Text style={styles.periodSummaryLabel}>Períodos registrados</Text>
                            </View>
                            <View style={styles.periodSummaryCard}>
                                <Text style={styles.periodSummaryValue}>{activePeriod ? '1' : '0'}</Text>
                                <Text style={styles.periodSummaryLabel}>Período vigente</Text>
                            </View>
                        </View>
                        {loadError && (
                            <Text style={styles.loadError}>
                                No se pudo actualizar la lista. Deslice hacia abajo para reintentar.
                            </Text>
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📅</Text>
                        <Text style={styles.emptyText}>
                            {loadError ? 'No se pudieron cargar los períodos' : 'No hay períodos registrados'}
                        </Text>
                        <Text style={styles.emptySubtext}>
                            {loadError ? 'Deslice hacia abajo para volver a intentar' : 'Agrega el primer período académico'}
                        </Text>
                    </View>
                }
            />

            <TouchableOpacity
                style={styles.fab}
                onPress={openCreateModal}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Crear período académico"
            >
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

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
                                maxLength={50}
                                placeholder="Ej: I Semestre"
                                placeholderTextColor={Colors.textTertiary}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Año lectivo</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.ano_lectivo}
                                onChangeText={(v) => setForm({ ...form, ano_lectivo: v.replace(/\D/g, '').slice(0, 4) })}
                                placeholder="2026"
                                placeholderTextColor={Colors.textTertiary}
                                keyboardType="numeric"
                                maxLength={4}
                            />
                        </View>

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Fecha inicio</Text>
                                <TouchableOpacity
                                    style={styles.formInput}
                                    onPress={() => setShowInicioPicker(true)}
                                >
                                    <Text style={{ color: form.fecha_inicio ? Colors.textPrimary : Colors.textTertiary }}>
                                        {form.fecha_inicio || "YYYY-MM-DD"}
                                    </Text>
                                </TouchableOpacity>
                                {showInicioPicker && (
                                    <DateTimePicker
                                        value={dateInicio}
                                        mode="date"
                                        display="default"
                                        onChange={handleDateInitioChange}
                                    />
                                )}
                            </View>
                            <View style={{ width: Spacing.md }} />
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Fecha fin</Text>
                                <TouchableOpacity
                                    style={styles.formInput}
                                    onPress={() => setShowFinPicker(true)}
                                >
                                    <Text style={{ color: form.fecha_fin ? Colors.textPrimary : Colors.textTertiary }}>
                                        {form.fecha_fin || "YYYY-MM-DD"}
                                    </Text>
                                </TouchableOpacity>
                                {showFinPicker && (
                                    <DateTimePicker
                                        value={dateFin}
                                        mode="date"
                                        display="default"
                                        onChange={handleDateFinChange}
                                        minimumDate={dateInicio}
                                    />
                                )}
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
    listHeader: {
        marginBottom: Spacing.lg,
    },
    screenTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    screenSubtitle: {
        fontSize: Typography.sizes.sm,
        lineHeight: 19,
        color: Colors.textSecondary,
        marginTop: Spacing.xs,
        marginBottom: Spacing.lg,
    },
    activePeriodCard: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        ...Shadows.md,
    },
    activePeriodIcon: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.16)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    activePeriodIconText: {
        fontSize: 22,
    },
    activePeriodCopy: {
        flex: 1,
    },
    activePeriodLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        letterSpacing: 0.7,
        color: Colors.accentLight,
    },
    activePeriodName: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.white,
        marginTop: 3,
    },
    activePeriodDates: {
        fontSize: Typography.sizes.xs,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 3,
    },
    activePeriodDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.success,
        marginLeft: Spacing.sm,
    },
    inactivePeriodDot: {
        backgroundColor: Colors.warning,
    },
    periodSummaryRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.md,
    },
    periodSummaryCard: {
        flex: 1,
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        padding: Spacing.md,
    },
    periodSummaryValue: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.primary,
    },
    periodSummaryLabel: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    loadError: {
        color: Colors.error,
        fontSize: Typography.sizes.sm,
        marginTop: Spacing.md,
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
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 48,
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

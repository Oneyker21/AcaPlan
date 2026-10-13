import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SeleccionOption = { id: string | number; label: string };
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const MODALIDADES = [
    { id: 'regular', label: 'Regular' },
    { id: 'encuentro', label: 'Encuentro' },
    { id: 'salud', label: 'Salud' },
];
const TURNOS = [
    { id: 'matutino', label: 'Matutino' },
    { id: 'vespertino', label: 'Vespertino' },
    { id: 'nocturno', label: 'Nocturno' },
];

export default function BlocksScreen() {
    const [periodos, setPeriodos] = useState<any[]>([]);
    const [periodoSeleccionado, setPeriodoSeleccionado] = useState<any>(null);
    const [bloques, setBloques] = useState<any[]>([]);
    const [diasHabilitados, setDiasHabilitados] = useState<string[]>([]);
    const [modalidad, setModalidad] = useState('regular');
    const [turno, setTurno] = useState('matutino');

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingDays, setSavingDays] = useState(false);
    const [editingBlock, setEditingBlock] = useState<any>(null);

    const [form, setForm] = useState({
        dia: 'Lunes',
        hora_inicio: '',
        hora_fin: '',
        es_receso: false
    });

    const [selectorVisible, setSelectorVisible] = useState(false);
    const [selectorData, setSelectorData] = useState<SeleccionOption[]>([]);
    const [selectorTitle, setSelectorTitle] = useState('');
    const [onSelect, setOnSelect] = useState<(val: string | number) => void>(() => { });

    const fetchPeriodos = useCallback(async () => {
        const { data, error } = await supabase.from('periodos').select('*').order('ano_lectivo', { ascending: false });
        if (data) {
            setPeriodos(data);
            const activo = data.find(p => p.es_activo) || data[0];
            setPeriodoSeleccionado(activo);
        }
        if (error) Alert.alert('Error', 'No se pudieron cargar los períodos académicos.');
        setLoading(false);
    }, []);

    const fetchBloques = useCallback(async () => {
        if (!periodoSeleccionado) {
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const [blocksQuery, enabledDaysQuery] = await Promise.all([
            supabase.from('bloques_clase').select('*').eq('id_periodo', periodoSeleccionado.id_periodo),
            supabase.from('dias_habilitados_periodo').select('dia').eq('id_periodo', periodoSeleccionado.id_periodo).eq('modalidad', modalidad).eq('turno', turno),
        ]);

        if (blocksQuery.data) {
            const ordenados = blocksQuery.data.sort((a, b) => {
                const diaA = DIAS_SEMANA.indexOf(a.dia);
                const diaB = DIAS_SEMANA.indexOf(b.dia);
                if (diaA !== diaB) return diaA - diaB;
                return a.hora_inicio.localeCompare(b.hora_inicio);
            });
            setBloques(ordenados);
        }
        if (enabledDaysQuery.data) setDiasHabilitados(enabledDaysQuery.data.map((row) => row.dia));

        if (blocksQuery.error || enabledDaysQuery.error) Alert.alert('Error', 'No se pudieron cargar los bloques y días habilitados. Aplique la migración de cierre del Sprint 2 y vuelva a intentar.');

        setLoading(false);
        setRefreshing(false);
    }, [periodoSeleccionado, modalidad, turno]);

    useEffect(() => {
        fetchPeriodos();
    }, [fetchPeriodos]);

    useEffect(() => {
        if (periodoSeleccionado) {
            setLoading(true);
            fetchBloques();
        }
    }, [periodoSeleccionado, fetchBloques]);

    const openSelector = (title: string, data: SeleccionOption[], onSelectCallback: (val: string | number) => void) => {
        setSelectorTitle(title);
        setSelectorData(data);
        setOnSelect(() => onSelectCallback);
        setSelectorVisible(true);
    };

    const periodosOptions = periodos.map(p => ({ id: p.id_periodo, label: `${p.nombre} ${p.ano_lectivo}` }));
    const diasOptions = DIAS_SEMANA.filter((day) => diasHabilitados.includes(day)).map(d => ({ id: d, label: d }));

    const handleToggleDay = async (day: string, enabled: boolean) => {
        if (!periodoSeleccionado || savingDays) return;
        const nextDays = enabled
            ? [...new Set([...diasHabilitados, day])]
            : diasHabilitados.filter((current) => current !== day);
        setSavingDays(true);
        const { error } = await supabase.rpc('set_period_enabled_days', {
            p_period_id: periodoSeleccionado.id_periodo,
            p_days: nextDays,
            p_modality: modalidad,
            p_shift: turno,
        });
        setSavingDays(false);
        if (error) {
            Alert.alert('No se pudo cambiar el día', error.message.includes('Delete the blocks')
                ? 'Elimine primero los bloques y recesos de ese día.'
                : 'Aplique la migración de cierre del Sprint 2 y vuelva a intentar.');
            return;
        }
        setDiasHabilitados(nextDays);
        if (!nextDays.includes(form.dia)) setForm((current) => ({ ...current, dia: nextDays[0] ?? '' }));
    };

    const handleDeleteBlock = (block: any) => {
        Alert.alert('Eliminar bloque', `¿Eliminar el bloque de ${block.dia}, ${String(block.hora_inicio).slice(0, 5)}–${String(block.hora_fin).slice(0, 5)}?`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => {
                setSaving(true);
                const { error } = await supabase.from('bloques_clase').delete().eq('id_bloque', block.id_bloque);
                setSaving(false);
                if (error) {
                    Alert.alert('No se pudo eliminar', 'Primero retire o reprograme las asignaciones que usan este bloque.');
                    return;
                }
                await fetchBloques();
            } },
        ]);
    };

    const openEditBlock = async (block: any) => {
        const { data, error } = await supabase.rpc('preview_class_block_revalidation', { p_block_id: block.id_bloque });
        if (error) {
            Alert.alert('No se pudo revisar el bloque', 'Aplique la migración de cuadrículas y vuelva a intentar.');
            return;
        }
        const affected = (data ?? []) as string[];
        const showEditor = () => {
            setEditingBlock(block);
            setForm({
                dia: block.dia,
                hora_inicio: String(block.hora_inicio).slice(0, 5),
                hora_fin: String(block.hora_fin).slice(0, 5),
                es_receso: block.es_receso,
            });
            setModalVisible(true);
        };
        if (!affected.length) {
            showEditor();
            return;
        }
        const labels = affected.slice(0, 6).join('\n');
        const remainder = affected.length > 6 ? `\nY ${affected.length - 6} asignaciones más.` : '';
        Alert.alert(
            'Clases afectadas',
            `El cambio afecta ${affected.length} asignación(es):\n${labels}${remainder}\n\nSe pasarán a borrador y se volverán a validar antes de guardar.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Continuar', onPress: showEditor },
            ],
        );
    };

    const handleSave = async () => {
        if (!periodoSeleccionado) {
            Alert.alert('Error', 'Primero debe crear o seleccionar un período académico.');
            return;
        }
        if (!form.dia || !form.hora_inicio || !form.hora_fin) {
            Alert.alert('Error', 'Todos los campos son obligatorios.');
            return;
        }
        if (!diasHabilitados.includes(form.dia)) {
            Alert.alert('Día no habilitado', 'Habilite el día para este período antes de crear bloques o recesos.');
            return;
        }

        // Regex simple para HH:MM
        const timeRegex = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
        if (!timeRegex.test(form.hora_inicio) || !timeRegex.test(form.hora_fin)) {
            Alert.alert('Error', 'El formato de hora debe ser HH:MM (Ej: 08:00, 14:30)');
            return;
        }

        const toMinutes = (value: string) => {
            const [hours, minutes] = value.split(':').map(Number);
            return hours * 60 + minutes;
        };
        const startMinute = toMinutes(form.hora_inicio);
        const endMinute = toMinutes(form.hora_fin);
        if (startMinute >= endMinute) {
            Alert.alert('Error', 'La hora de inicio debe ser estrictamente anterior a la hora final (H22-CA1)');
            return;
        }

        const durationMinutes = endMinute - startMinute;
        if (turno === 'nocturno' && form.es_receso) {
            Alert.alert('Turno nocturno', 'Los horarios nocturnos no llevan receso.');
            return;
        }
        if (form.dia === 'Viernes' && modalidad !== 'encuentro') {
            Alert.alert('Viernes', 'El viernes se configura dentro de la modalidad Encuentro.');
            return;
        }
        if (modalidad === 'encuentro' && (form.dia !== 'Viernes' || (!form.es_receso && durationMinutes !== 60))) {
            Alert.alert('Modalidad Encuentro', 'Configure Encuentro los viernes con bloques de clase de 60 minutos.');
            return;
        }
        if (!form.es_receso && modalidad === 'regular' && ['matutino', 'vespertino'].includes(turno) && ![45, 90].includes(durationMinutes)) {
            Alert.alert('Duración no permitida', 'Los bloques regulares matutinos y vespertinos usan unidades de 45 minutos; una clase puede ocupar 90 minutos.');
            return;
        }

        const overlaps = bloques.some((block) => {
            if (editingBlock?.id_bloque === block.id_bloque) return false;
            if (block.dia !== form.dia || block.modalidad !== modalidad || block.turno !== turno) return false;
            const blockStart = toMinutes(String(block.hora_inicio).slice(0, 5));
            const blockEnd = toMinutes(String(block.hora_fin).slice(0, 5));
            return startMinute < blockEnd && endMinute > blockStart;
        });
        if (overlaps) {
            Alert.alert('Error', 'El horario se superpone con otro bloque o receso de ese día.');
            return;
        }

        setSaving(true);

        const startTime = `${form.hora_inicio.padStart(5, '0')}:00`;
        const endTime = `${form.hora_fin.padStart(5, '0')}:00`;
        const result = editingBlock
            ? await supabase.rpc('update_class_block_time', {
                p_block_id: editingBlock.id_bloque,
                p_start_time: startTime,
                p_end_time: endTime,
            })
            : await supabase.from('bloques_clase').insert({
                id_periodo: periodoSeleccionado.id_periodo,
                dia: form.dia,
                modalidad,
                turno,
                hora_inicio: startTime,
                hora_fin: endTime,
                es_receso: form.es_receso,
            });

        setSaving(false);
        if (result.error) {
            Alert.alert(
                'Error',
                result.error.code === '23P01'
                    ? 'El horario se superpone con otro bloque o receso de ese día.'
                    : result.error.message.includes('Enable this weekday')
                        ? 'Habilite el día para este período antes de crear bloques o recesos.'
                        : result.error.message.toLowerCase().includes('conflict')
                            ? 'El cambio produjo un cruce de horario. No se aplicó; revise las clases y vuelva a intentarlo.'
                            : 'No se pudo guardar el bloque. Revise los datos e intente de nuevo.'
            );
            return;
        }

        setModalVisible(false);
        setEditingBlock(null);
        setForm({ dia: diasHabilitados[0] ?? '', hora_inicio: '', hora_fin: '', es_receso: false });
        await fetchBloques();
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={[styles.card, item.es_receso && styles.recesoCard]}>
            <View style={styles.cardInfo}>
                <View style={[styles.diaBadge, item.es_receso && { backgroundColor: Colors.accent }]}>
                    <Text style={styles.diaBadgeText}>{item.dia}</Text>
                </View>
                <View style={{ marginLeft: Spacing.md }}>
                    <Text style={styles.horaText}>{item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}</Text>
                    <Text style={styles.recesoLabel}>{item.es_receso ? '🍔 Receso / Libre' : '📚 Bloque de Clases'}</Text>
                </View>
                <View style={styles.blockActions}>
                    <TouchableOpacity style={styles.deleteBlockButton} onPress={() => void openEditBlock(item)} disabled={saving}>
                        <Text style={styles.editBlockText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBlockButton} onPress={() => handleDeleteBlock(item)} disabled={saving}>
                        <Text style={styles.deleteBlockText}>Eliminar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    if (loading && !periodos.length) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.headerArea}>
                <Text style={styles.headerLabel}>Viendo bloques para:</Text>
                <TouchableOpacity style={styles.mainSelector} onPress={() => openSelector('Período Académico', periodosOptions, (val) => {
                    const p = periodos.find(x => x.id_periodo === val);
                    if (p) setPeriodoSeleccionado(p);
                    setSelectorVisible(false);
                })}>
                    <Text style={styles.mainSelectorText}>{periodoSeleccionado ? `${periodoSeleccionado.nombre} ${periodoSeleccionado.ano_lectivo}` : 'Seleccione'}</Text>
                    <Text style={{ color: Colors.white }}>▼</Text>
                </TouchableOpacity>
            </View>

            {periodoSeleccionado ? (
                <View style={styles.daysPanel}>
                <Text style={styles.daysTitle}>Cuadrícula del período</Text>
                <Text style={styles.daysHint}>Seleccione la modalidad y el turno que está configurando.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
                    {MODALIDADES.map((option) => (
                        <TouchableOpacity key={option.id} style={[styles.gridChip, modalidad === option.id && styles.gridChipActive]} onPress={() => setModalidad(option.id)}>
                            <Text style={[styles.gridChipText, modalidad === option.id && styles.gridChipTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
                    {TURNOS.map((option) => (
                        <TouchableOpacity key={option.id} style={[styles.gridChip, turno === option.id && styles.gridChipActive]} onPress={() => setTurno(option.id)}>
                            <Text style={[styles.gridChipText, turno === option.id && styles.gridChipTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={styles.daysTitle}>Días habilitados · {MODALIDADES.find((option) => option.id === modalidad)?.label} {TURNOS.find((option) => option.id === turno)?.label}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
                        {DIAS_SEMANA.map((day) => (
                            <View key={day} style={styles.dayToggle}>
                                <Text style={[styles.dayToggleText, diasHabilitados.includes(day) && styles.dayToggleTextActive]}>{day.slice(0, 3)}</Text>
                                <Switch
                                    value={diasHabilitados.includes(day)}
                                    onValueChange={(value) => void handleToggleDay(day, value)}
                                    disabled={savingDays || loading || modalidad === 'encuentro' && day !== 'Viernes'}
                                    accessibilityLabel={`${day} habilitado`}
                                />
                            </View>
                        ))}
                    </ScrollView>
                    <Text style={styles.daysHint}>Deshabilite un día después de quitar sus bloques y recesos.</Text>
                </View>
            ) : null}

            {loading ? <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} /> : (
                <FlatList
                    data={bloques.filter((block) => block.modalidad === modalidad && block.turno === turno)}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id_bloque.toString()}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBloques(); }} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyIcon}>⏳</Text>
                            <Text style={styles.emptyText}>No hay bloques creados para este período</Text>
                        </View>
                    }
                />
            )}

            <TouchableOpacity
                style={[styles.fab, (!periodoSeleccionado || !diasHabilitados.length || saving) && styles.fabDisabled]}
                onPress={() => {
                    if (!diasHabilitados.length) {
                        Alert.alert('Habilite un día', 'Active al menos un día de la semana para agregar bloques de clase o recesos.');
                        return;
                    }
                    setEditingBlock(null);
                    setForm({ dia: diasHabilitados[0], hora_inicio: '', hora_fin: '', es_receso: false });
                    setModalVisible(true);
                }}
                activeOpacity={0.8}
                disabled={!periodoSeleccionado || saving}
            >
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            {/* Modal Creación de Bloque */}
            <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => { setModalVisible(false); setEditingBlock(null); }}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{editingBlock ? 'Editar hora' : 'Nuevo bloque'} · {MODALIDADES.find((option) => option.id === modalidad)?.label} {TURNOS.find((option) => option.id === turno)?.label}</Text>

                        {!editingBlock ? <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Día de la semana</Text>
                            <TouchableOpacity style={styles.selectorBtn} onPress={() => openSelector('Selecciona el Día', diasOptions, (val) => { setForm((current) => ({ ...current, dia: val.toString() })); setSelectorVisible(false); })}>
                                <Text style={styles.selectorText}>{form.dia || 'Seleccione un día habilitado'}</Text>
                            </TouchableOpacity>
                        </View> : <Text style={styles.daysHint}>{editingBlock.dia} · {editingBlock.es_receso ? 'Receso' : 'Bloque de clase'}</Text>}

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                                <Text style={styles.formLabel}>Hora Inicio</Text>
                                <TextInput style={styles.formInput} value={form.hora_inicio} onChangeText={(v) => setForm({ ...form, hora_inicio: v })} placeholder="08:00" keyboardType="numbers-and-punctuation" />
                            </View>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Hora Fin</Text>
                                <TextInput style={styles.formInput} value={form.hora_fin} onChangeText={(v) => setForm({ ...form, hora_fin: v })} placeholder="09:30" keyboardType="numbers-and-punctuation" />
                            </View>
                        </View>

                        {turno !== 'nocturno' ? <View style={[styles.formGroup, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                            <Text style={styles.formLabel}>¿Es Receso?</Text>
                            <Switch
                                value={form.es_receso}
                                onValueChange={(v) => setForm({ ...form, es_receso: v })}
                                disabled={saving || Boolean(editingBlock)}
                                trackColor={{ false: Colors.border, true: Colors.accent + '50' }}
                                thumbColor={form.es_receso ? Colors.accent : Colors.textTertiary}
                            />
                        </View> : <Text style={styles.daysHint}>Turno nocturno: no se permiten recesos.</Text>}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setEditingBlock(null); }} disabled={saving}><Text style={styles.cancelBtnText}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveBtnText}>{editingBlock ? 'Revalidar' : 'Guardar'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal Selector General */}
            <Modal visible={selectorVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.selectorModalCard}>
                        <Text style={styles.modalTitle}>{selectorTitle}</Text>
                        <FlatList
                            data={selectorData}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.selectorItem} onPress={() => onSelect(item.id)}>
                                    <Text style={styles.selectorItemText}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectorVisible(false)}><Text style={styles.cancelBtnText}>Cerrar</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerArea: { padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerLabel: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
    mainSelector: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    mainSelectorText: { color: Colors.white, fontWeight: '600', fontSize: Typography.sizes.md },
    daysPanel: { backgroundColor: Colors.white, borderBottomColor: Colors.border, borderBottomWidth: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    daysTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    daysRow: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    gridChip: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    gridChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    gridChipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '600' },
    gridChipTextActive: { color: Colors.white },
    dayToggle: { alignItems: 'center', backgroundColor: Colors.background, borderRadius: BorderRadius.md, minWidth: 64, paddingTop: Spacing.xs },
    dayToggleText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '600' },
    dayToggleTextActive: { color: Colors.primary },
    daysHint: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, paddingBottom: Spacing.sm },
    listContent: { padding: Spacing.lg, paddingBottom: 100 },
    card: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    recesoCard: { borderLeftColor: Colors.accent, backgroundColor: Colors.white },
    cardInfo: { flexDirection: 'row', alignItems: 'center' },
    cardText: { flex: 1 },
    diaBadge: { backgroundColor: Colors.primary, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12, width: 80, alignItems: 'center' },
    diaBadgeText: { color: Colors.white, fontWeight: 'bold', fontSize: Typography.sizes.sm },
    horaText: { fontSize: Typography.sizes.lg, fontWeight: '700', color: Colors.textPrimary },
    recesoLabel: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: 4 },
    blockActions: { alignItems: 'flex-end', marginLeft: Spacing.sm },
    deleteBlockButton: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
    editBlockText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    deleteBlockText: { color: Colors.error, fontSize: Typography.sizes.xs, fontWeight: '700' },
    emptyContainer: { alignItems: 'center', paddingVertical: Spacing.huge },
    emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
    emptyText: { fontSize: Typography.sizes.md, color: Colors.textTertiary, textAlign: 'center' },
    fab: { position: 'absolute', right: Spacing.xl, bottom: Spacing.xxl, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.lg },
    fabText: { fontSize: 28, color: Colors.white, marginTop: -2 },
    fabDisabled: { opacity: 0.5 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xxl },
    selectorModalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xxl, maxHeight: '80%' },
    modalTitle: { fontSize: Typography.sizes.xl, fontWeight: 'bold', marginBottom: Spacing.lg, textAlign: 'center' },
    formGroup: { marginBottom: Spacing.md },
    formRow: { flexDirection: 'row' },
    formLabel: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginBottom: 4 },
    formInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: Typography.sizes.md },
    selectorBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, backgroundColor: Colors.background },
    selectorText: { fontSize: Typography.sizes.md, color: Colors.textPrimary },
    selectorItem: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    selectorItemText: { fontSize: Typography.sizes.md, color: Colors.textPrimary },
    modalActions: { flexDirection: 'row', marginTop: Spacing.lg },
    cancelBtn: { flex: 1, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, marginRight: Spacing.sm },
    cancelBtnText: { color: Colors.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, padding: Spacing.md, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
    saveBtnText: { color: Colors.white, fontWeight: '600' }
});

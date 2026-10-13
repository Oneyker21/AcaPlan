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
const MODALIDADES: SeleccionOption[] = [
    { id: 'regular', label: 'Regular' },
    { id: 'encuentro', label: 'Encuentro' },
    { id: 'salud', label: 'Salud' },
];
const TURNOS: SeleccionOption[] = [
    { id: 'matutino', label: 'Matutino' },
    { id: 'vespertino', label: 'Vespertino' },
    { id: 'nocturno', label: 'Nocturno' },
];

export default function SectionsScreen() {
    const [secciones, setSecciones] = useState<any[]>([]);
    const [periodos, setPeriodos] = useState<any[]>([]);
    const [carreras, setCarreras] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingSection, setEditingSection] = useState<any>(null);
    const [search, setSearch] = useState('');

    const [form, setForm] = useState({
        id_periodo: '',
        id_carrera: '',
        codigo: '',
        ano_estudio: '',
        cantidad_estudiantes: '',
        modalidad: 'regular',
        turno: 'matutino',
        sede: '',
    });

    // Para el modal selector
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [selectorData, setSelectorData] = useState<SeleccionOption[]>([]);
    const [selectorTitle, setSelectorTitle] = useState('');
    const [onSelect, setOnSelect] = useState<(val: string | number) => void>(() => { });

    // Mapeo de asignaturas (CA2)
    const [mappingVisible, setMappingVisible] = useState(false);
    const [mappingSection, setMappingSection] = useState<any>(null);
    const [asignaturasPosibles, setAsignaturasPosibles] = useState<any[]>([]);
    const [asignaturasVinculadas, setAsignaturasVinculadas] = useState<Map<number, boolean>>(new Map());
    const [loadingMapping, setLoadingMapping] = useState(false);

    const fetchData = useCallback(async () => {
        const { data: periodosData, error: periodosError } = await supabase.from('periodos').select('*').order('ano_lectivo', { ascending: false });
        const { data: carrerasData, error: carrerasError } = await supabase.from('carreras').select('*').order('nombre', { ascending: true });
        const { data: seccionesData, error } = await supabase
            .from('secciones')
            .select(`
                *,
                periodos ( nombre, ano_lectivo ),
                carreras ( nombre )
            `)
            .order('id_seccion', { ascending: false });

        if (periodosData) setPeriodos(periodosData);
        if (carrerasData) setCarreras(carrerasData);
        if (seccionesData) setSecciones(seccionesData);
        if (periodosError || carrerasError || error) {
            Alert.alert('Error', 'No se pudieron cargar todos los datos. Intente actualizar la lista.');
        }

        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openSelector = (title: string, data: SeleccionOption[], onSelectCallback: (val: string | number) => void) => {
        setSelectorTitle(title);
        setSelectorData(data);
        setOnSelect(() => onSelectCallback);
        setSelectorVisible(true);
    };

    const openCreate = () => {
        setEditingSection(null);
        setForm({ id_periodo: '', id_carrera: '', codigo: '', ano_estudio: '', cantidad_estudiantes: '', modalidad: 'regular', turno: 'matutino', sede: '' });
        setModalVisible(true);
    };

    const openEdit = (section: any) => {
        setEditingSection(section);
        setForm({
            id_periodo: String(section.id_periodo),
            id_carrera: String(section.id_carrera),
            codigo: section.codigo,
            ano_estudio: String(section.ano_estudio),
            cantidad_estudiantes: String(section.cantidad_estudiantes),
            modalidad: section.modalidad,
            turno: section.turno,
            sede: section.sede,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.codigo.trim() || !form.id_carrera || !form.id_periodo || !form.ano_estudio || !form.cantidad_estudiantes || !form.sede.trim()) {
            Alert.alert('Error', 'Todos los campos son obligatorios.');
            return;
        }

        const cantidad = Number(form.cantidad_estudiantes);
        const year = Number(form.ano_estudio);
        if (!Number.isInteger(cantidad) || cantidad <= 0 || !Number.isInteger(year) || year <= 0) {
            Alert.alert('Error', 'El año y la cantidad de estudiantes deben ser enteros positivos.');
            return;
        }
        if (form.codigo.trim().length > 20 || form.sede.trim().length > 150) {
            Alert.alert('Revise los datos', 'El código admite hasta 20 caracteres y la sede hasta 150.');
            return;
        }

        setSaving(true);

        const payload = {
            id_periodo: Number(form.id_periodo),
            id_carrera: Number(form.id_carrera),
            codigo: form.codigo.trim(),
            ano_estudio: year,
            cantidad_estudiantes: cantidad,
            modalidad: form.modalidad,
            turno: form.turno,
            sede: form.sede.trim(),
        };
        const result = editingSection
            ? await supabase.from('secciones').update(payload).eq('id_seccion', editingSection.id_seccion)
            : await supabase.from('secciones').insert(payload);

        setSaving(false);
        if (result.error) {
            Alert.alert(
                'Error',
                result.error.code === '23505'
                    ? 'Ya existe una sección con este código para la misma carrera en este período.'
                    : result.error.message.includes('cannot change its career or study year')
                        ? 'No puede cambiar la carrera o año porque el grupo ya tiene asignaturas vinculadas.'
                        : result.error.message.includes('cannot change its period')
                            ? 'No puede cambiar esos datos mientras el grupo tenga horarios asignados.'
                            : result.error.message.includes('exceeds the capacity')
                                ? 'La cantidad supera la capacidad del aula asignada.'
                                : 'No se pudo guardar la sección.'
            );
            return;
        }

        setModalVisible(false);
        setEditingSection(null);
        setForm({ id_periodo: '', id_carrera: '', codigo: '', ano_estudio: '', cantidad_estudiantes: '', modalidad: 'regular', turno: 'matutino', sede: '' });
        fetchData();
    };

    // CA2 H21 - Lógica Asignaturas
    const openMappingModal = async (seccion: any) => {
        setMappingSection(seccion);
        setLoadingMapping(true);
        setMappingVisible(true);

        const { data: asignaturas, error: asignaturasError } = await supabase
            .from('asignaturas')
            .select('*')
            .eq('id_carrera', seccion.id_carrera)
            .eq('ano_estudio', seccion.ano_estudio)
            .eq('estado', 'activo');

        const { data: vinculadas, error: vinculadasError } = await supabase
            .from('seccion_asignatura')
            .select('id_asignatura')
            .eq('id_seccion', seccion.id_seccion);

        if (asignaturasError || vinculadasError) {
            setLoadingMapping(false);
            setMappingVisible(false);
            Alert.alert('Error', 'No se pudieron cargar las asignaturas de la sección.');
            return;
        }

        if (asignaturas) setAsignaturasPosibles(asignaturas);

        const vinculadasMap = new Map();
        if (vinculadas) {
            vinculadas.forEach(v => vinculadasMap.set(v.id_asignatura, true));
        }
        setAsignaturasVinculadas(vinculadasMap);
        setLoadingMapping(false);
    };

    const toggleAsignatura = (id_asignatura: number, value: boolean) => {
        const newMap = new Map(asignaturasVinculadas);
        newMap.set(id_asignatura, value);
        setAsignaturasVinculadas(newMap);
    };

    const saveMapping = async () => {
        if (!mappingSection) return;
        setSaving(true);
        const subjectIds = [...asignaturasVinculadas]
            .filter(([, linked]) => linked)
            .map(([subjectId]) => subjectId);
        const { error } = await supabase.rpc('replace_section_subjects', {
            p_section_id: mappingSection.id_seccion,
            p_subject_ids: subjectIds,
        });

        if (error) {
            const message = error.message.includes('match the group career and study year')
                ? 'Solo puede vincular asignaturas activas de la misma carrera y año de estudio.'
                : error.message.includes('cannot be removed')
                    ? 'No puede retirar asignaturas que ya tienen clases asignadas.'
                    : 'Hubo un error al guardar las asignaturas de la sección.';
            Alert.alert('Error', message);
            setSaving(false);
            return;
        }

        setSaving(false);
        setMappingVisible(false);
        Alert.alert('Éxito', 'Las asignaturas fueron vinculadas correctamente.');
    };

    const getPeriodoName = (id: string) => periodos.find(p => p.id_periodo.toString() === id)?.nombre || 'Seleccionar Período';
    const getCarreraName = (id: string) => carreras.find(c => c.id_carrera.toString() === id)?.nombre || 'Seleccionar Carrera';

    const periodosOptions = periodos.map(p => ({ id: p.id_periodo, label: `${p.nombre} ${p.ano_lectivo}` }));
    const carrerasOptions = carreras.map(c => ({ id: c.id_carrera, label: c.nombre }));
    const modalidadName = (id: string) => MODALIDADES.find((option) => option.id === id)?.label ?? id;
    const turnoName = (id: string) => TURNOS.find((option) => option.id === id)?.label ?? id;

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.codigo}</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Año {item.ano_estudio}</Text>
                </View>
            </View>
            <Text style={styles.cardSubtitle}>{item.carreras?.nombre} · {item.sede}</Text>

            <View style={styles.detailsRow}>
                <Text style={styles.detailText}>Período: {item.periodos?.nombre} {item.periodos?.ano_lectivo}</Text>
                <Text style={styles.detailText}>{modalidadName(item.modalidad)} · {turnoName(item.turno)} · {item.cantidad_estudiantes} estudiantes</Text>
            </View>

            <TouchableOpacity style={styles.mapBtn} onPress={() => openMappingModal(item)}>
                <Text style={styles.mapBtnText}>🔗 Vincular Asignaturas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSectionButton} onPress={() => openEdit(item)}>
                <Text style={styles.editSectionText}>Editar datos del grupo</Text>
            </TouchableOpacity>
        </View>
    );

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <FlatList
                data={secciones.filter((section) => {
                    const query = search.trim().toLocaleLowerCase();
                    return !query || `${section.codigo} ${section.carreras?.nombre ?? ''} ${section.sede}`.toLocaleLowerCase().includes(query);
                })}
                renderItem={renderItem}
                keyExtractor={(item) => item.id_seccion.toString()}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
                ListHeaderComponent={<TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Buscar por código, carrera o sede" placeholderTextColor={Colors.textTertiary} returnKeyType="search" />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📚</Text>
                        <Text style={styles.emptyText}>No hay secciones registradas</Text>
                    </View>
                }
            />

            <TouchableOpacity style={styles.fab} onPress={openCreate} activeOpacity={0.8}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => { setModalVisible(false); setEditingSection(null); }}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{editingSection ? 'Editar grupo' : 'Nuevo grupo académico'}</Text>
                        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Período</Text>
                            <TouchableOpacity style={styles.selectorBtn} onPress={() => openSelector('Selecciona el Período', periodosOptions, (val) => { setForm({ ...form, id_periodo: val.toString() }); setSelectorVisible(false); })}>
                                <Text style={form.id_periodo ? styles.selectorText : styles.selectorTextPlaceholder}>{form.id_periodo ? getPeriodoName(form.id_periodo) : 'Seleccionar Período'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Carrera</Text>
                            <TouchableOpacity style={styles.selectorBtn} onPress={() => openSelector('Selecciona la Carrera', carrerasOptions, (val) => { setForm({ ...form, id_carrera: val.toString() }); setSelectorVisible(false); })}>
                                <Text style={form.id_carrera ? styles.selectorText : styles.selectorTextPlaceholder}>{form.id_carrera ? getCarreraName(form.id_carrera) : 'Seleccionar Carrera'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Código de Sección</Text>
                            <TextInput style={styles.formInput} value={form.codigo} onChangeText={(v) => setForm({ ...form, codigo: v.toUpperCase() })} placeholder="Ej: INF-2026" autoCapitalize="characters" />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Sede</Text>
                            <TextInput style={styles.formInput} value={form.sede} onChangeText={(v) => setForm({ ...form, sede: v })} placeholder="Ej: CUR-Chontales" maxLength={150} />
                        </View>

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                                <Text style={styles.formLabel}>Modalidad</Text>
                                <TouchableOpacity style={styles.selectorBtn} onPress={() => openSelector('Selecciona modalidad', MODALIDADES, (val) => { setForm({ ...form, modalidad: val.toString() }); setSelectorVisible(false); })}>
                                    <Text style={styles.selectorText}>{modalidadName(form.modalidad)}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Turno</Text>
                                <TouchableOpacity style={styles.selectorBtn} onPress={() => openSelector('Selecciona turno', TURNOS, (val) => { setForm({ ...form, turno: val.toString() }); setSelectorVisible(false); })}>
                                    <Text style={styles.selectorText}>{turnoName(form.turno)}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.formRow}>
                            <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                                <Text style={styles.formLabel}>Año Estudio</Text>
                                <TextInput style={styles.formInput} value={form.ano_estudio} onChangeText={(v) => setForm({ ...form, ano_estudio: v })} keyboardType="numeric" placeholder="1-5" />
                            </View>
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.formLabel}>Estudiantes</Text>
                                <TextInput style={styles.formInput} value={form.cantidad_estudiantes} onChangeText={(v) => setForm({ ...form, cantidad_estudiantes: v })} keyboardType="numeric" placeholder="Ej: 30" />
                            </View>
                        </View>
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setEditingSection(null); }} disabled={saving}><Text style={styles.cancelBtnText}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveBtnText}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal para Vincular Asignaturas */}
            <Modal visible={mappingVisible} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { justifyContent: 'center', padding: Spacing.lg }]}>
                    <View style={[styles.modalCard, { borderRadius: BorderRadius.xl, maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>Asignaturas de: {mappingSection?.codigo}</Text>

                        {loadingMapping ? (
                            <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
                        ) : asignaturasPosibles.length === 0 ? (
                            <Text style={styles.emptyText}>No hay asignaturas registradas para esta carrera en el año {mappingSection?.ano_estudio}.</Text>
                        ) : (
                            <FlatList
                                data={asignaturasPosibles}
                                keyExtractor={(asig) => asig.id_asignatura.toString()}
                                renderItem={({ item }) => {
                                    const isLinked = asignaturasVinculadas.get(item.id_asignatura) || false;
                                    return (
                                        <View style={styles.mappingItem}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.mappingItemTitle}>{item.nombre}</Text>
                                                <Text style={styles.mappingItemSub}>{item.codigo} · Año {item.ano_estudio}</Text>
                                            </View>
                                            <Switch
                                                value={isLinked}
                                                onValueChange={(val) => toggleAsignatura(item.id_asignatura, val)}
                                                trackColor={{ false: Colors.border, true: Colors.accent + '50' }}
                                                thumbColor={isLinked ? Colors.accent : Colors.textTertiary}
                                            />
                                        </View>
                                    );
                                }}
                            />
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMappingVisible(false)} disabled={saving}><Text style={styles.cancelBtnText}>Cerrar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={saveMapping} disabled={saving}>
                                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveBtnText}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Selector General */}
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
    listContent: { padding: Spacing.lg, paddingBottom: 100 },
    card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: Typography.sizes.lg, fontWeight: 'bold', color: Colors.textPrimary },
    cardSubtitle: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginTop: 4, marginBottom: Spacing.sm },
    detailsRow: { flexDirection: 'column', gap: Spacing.xs, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
    detailText: { fontSize: Typography.sizes.sm, color: Colors.textSecondary },
    badge: { backgroundColor: Colors.primary + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: 'bold' },
    mapBtn: { marginTop: Spacing.md, backgroundColor: Colors.accent + '10', padding: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
    mapBtnText: { color: Colors.accent, fontWeight: 'bold', fontSize: Typography.sizes.sm },
    editSectionButton: { alignItems: 'center', borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.sm, padding: Spacing.sm },
    editSectionText: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    searchInput: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, fontSize: Typography.sizes.sm, marginBottom: Spacing.md, minHeight: 44, paddingHorizontal: Spacing.md },
    emptyContainer: { alignItems: 'center', paddingVertical: Spacing.huge },
    emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
    emptyText: { fontSize: Typography.sizes.md, color: Colors.textTertiary, textAlign: 'center' },
    fab: { position: 'absolute', right: Spacing.xl, bottom: Spacing.xxl, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.lg },
    fabText: { fontSize: 28, color: Colors.white, marginTop: -2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '92%', padding: Spacing.xxl },
    formScroll: { flexShrink: 1, maxHeight: '82%' },
    selectorModalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xxl, maxHeight: '80%' },
    modalTitle: { fontSize: Typography.sizes.xl, fontWeight: 'bold', marginBottom: Spacing.lg, textAlign: 'center' },
    formGroup: { marginBottom: Spacing.md },
    formRow: { flexDirection: 'row' },
    formLabel: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, marginBottom: 4 },
    formInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: Typography.sizes.md },
    selectorBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, backgroundColor: Colors.background },
    selectorText: { fontSize: Typography.sizes.md, color: Colors.textPrimary },
    selectorTextPlaceholder: { fontSize: Typography.sizes.md, color: Colors.textTertiary },
    selectorItem: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    selectorItemText: { fontSize: Typography.sizes.md, color: Colors.textPrimary },
    modalActions: { flexDirection: 'row', marginTop: Spacing.lg },
    cancelBtn: { flex: 1, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, marginRight: Spacing.sm },
    cancelBtnText: { color: Colors.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, padding: Spacing.md, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
    saveBtnText: { color: Colors.white, fontWeight: '600' },
    mappingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    mappingItemTitle: { fontSize: Typography.sizes.md, color: Colors.textPrimary, fontWeight: '500' },
    mappingItemSub: { fontSize: Typography.sizes.sm, color: Colors.textTertiary, marginTop: 2 }
});

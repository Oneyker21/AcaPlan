import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type AcademicGroup = {
    id_seccion: number;
    id_periodo: number;
    id_carrera: number;
    codigo: string;
    ano_estudio: number;
    modalidad: 'regular' | 'encuentro' | 'salud';
    turno: 'matutino' | 'vespertino' | 'nocturno';
    sede: string;
    carreras?: { nombre: string };
    periodos?: { nombre: string; ano_lectivo: number };
};
type AcademicSubject = { id_asignatura: number; id_carrera: number; ano_estudio: number; codigo: string; nombre: string; estado: string };
type Teacher = { id_docente: number; nombre: string; especialidad: string | null };
type AcademicResource = { id_recurso: number; nombre: string };
type AcademicAssignment = { id_asignacion_academica: number; id_periodo: number; id_seccion: number; id_asignatura: number; observacion_espacio: string };
type AssignmentComponent = { id_componente: number; id_asignacion_academica: number; tipo_sesion: 'teorica' | 'practica'; sesiones_semana: number; duracion_minutos: number; requiere_espacio_especializado: boolean; observacion_espacio: string };
type Option = { id: number; label: string };

const emptyForm = {
    id_seccion: '',
    id_asignatura: '',
    tipo_sesion: 'teorica' as 'teorica' | 'practica',
    sesiones_semana: '',
    duracion_minutos: '',
    requiere_espacio_especializado: false,
    observacion_espacio: '',
};

export default function AcademicAssignmentsScreen() {
    const { role } = useAuth();
    const router = useRouter();
    const [groups, setGroups] = useState<AcademicGroup[]>([]);
    const [subjects, setSubjects] = useState<AcademicSubject[]>([]);
    const [linkedSubjects, setLinkedSubjects] = useState<Record<number, number[]>>({});
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [teacherNames, setTeacherNames] = useState<Record<number, string>>({});
    const [resources, setResources] = useState<AcademicResource[]>([]);
    const [subjectResources, setSubjectResources] = useState<Record<number, number[]>>({});
    const [assignments, setAssignments] = useState<AcademicAssignment[]>([]);
    const [components, setComponents] = useState<AssignmentComponent[]>([]);
    const [componentTeachers, setComponentTeachers] = useState<Record<number, number[]>>({});
    const [componentResources, setComponentResources] = useState<Record<number, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formVisible, setFormVisible] = useState(false);
    const [choiceVisible, setChoiceVisible] = useState(false);
    const [choiceKind, setChoiceKind] = useState<'group' | 'subject'>('group');
    const [form, setForm] = useState(emptyForm);
    const [selectedTeachers, setSelectedTeachers] = useState<number[]>([]);
    const [selectedResources, setSelectedResources] = useState<number[]>([]);
    const [search, setSearch] = useState('');

    const fetchData = useCallback(async () => {
        const [groupResult, subjectResult, linkResult, resourceResult, resourceLinkResult, assignmentResult, componentResult, teacherLinkResult, componentResourceResult] = await Promise.all([
            supabase.from('secciones').select('id_seccion, id_periodo, id_carrera, codigo, ano_estudio, modalidad, turno, sede, carreras(nombre), periodos(nombre, ano_lectivo)').order('codigo'),
            supabase.from('asignaturas').select('id_asignatura, id_carrera, ano_estudio, codigo, nombre, estado').eq('estado', 'activo').order('nombre'),
            supabase.from('seccion_asignatura').select('id_seccion, id_asignatura'),
            supabase.from('recursos').select('id_recurso, nombre').order('nombre'),
            supabase.from('asignatura_recurso').select('id_asignatura, id_recurso'),
            supabase.from('asignaciones_academicas').select('id_asignacion_academica, id_periodo, id_seccion, id_asignatura, observacion_espacio').order('id_asignacion_academica', { ascending: false }),
            supabase.from('asignacion_componentes').select('id_componente, id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos, requiere_espacio_especializado, observacion_espacio'),
            supabase.from('asignacion_componente_docente').select('id_componente, id_docente'),
            supabase.from('asignacion_componente_recurso').select('id_componente, id_recurso'),
        ]);
        const errors = [groupResult.error, subjectResult.error, linkResult.error, resourceResult.error, resourceLinkResult.error, assignmentResult.error, componentResult.error, teacherLinkResult.error, componentResourceResult.error];
        if (errors.some(Boolean)) {
            Alert.alert('No se cargó la programación', 'Revise las migraciones del Sprint 3 y vuelva a actualizar la pantalla.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const nextGroups = (groupResult.data ?? []) as unknown as AcademicGroup[];
        const nextSubjects = (subjectResult.data ?? []) as AcademicSubject[];
        const nextAssignments = (assignmentResult.data ?? []) as AcademicAssignment[];
        const nextComponents = (componentResult.data ?? []) as AssignmentComponent[];
        const subjectLinks: Record<number, number[]> = {};
        (linkResult.data ?? []).forEach((row) => {
            subjectLinks[row.id_seccion] ??= [];
            subjectLinks[row.id_seccion].push(row.id_asignatura);
        });
        const resourcesBySubject: Record<number, number[]> = {};
        (resourceLinkResult.data ?? []).forEach((row) => {
            resourcesBySubject[row.id_asignatura] ??= [];
            resourcesBySubject[row.id_asignatura].push(row.id_recurso);
        });
        const teachersByComponent: Record<number, number[]> = {};
        (teacherLinkResult.data ?? []).forEach((row) => {
            teachersByComponent[row.id_componente] ??= [];
            teachersByComponent[row.id_componente].push(row.id_docente);
        });
        const resourcesByComponent: Record<number, number[]> = {};
        (componentResourceResult.data ?? []).forEach((row) => {
            resourcesByComponent[row.id_componente] ??= [];
            resourcesByComponent[row.id_componente].push(row.id_recurso);
        });

        setGroups(nextGroups);
        setSubjects(nextSubjects);
        setLinkedSubjects(subjectLinks);
        setResources((resourceResult.data ?? []) as AcademicResource[]);
        setSubjectResources(resourcesBySubject);
        setAssignments(nextAssignments);
        setComponents(nextComponents);
        setComponentTeachers(teachersByComponent);
        setComponentResources(resourcesByComponent);

        const careerIds = [...new Set(nextGroups.map((group) => group.id_carrera))];
        const teacherResults = await Promise.all(careerIds.map((careerId) => supabase.rpc('list_academic_assignment_teachers', { p_career_id: careerId })));
        const names: Record<number, string> = {};
        for (const teacherResult of teacherResults) {
            (teacherResult.data ?? []).forEach((teacher: Teacher) => { names[teacher.id_docente] = teacher.nombre; });
        }
        setTeacherNames(names);
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const selectedGroup = groups.find((group) => String(group.id_seccion) === form.id_seccion) ?? null;
    const selectedSubject = subjects.find((subject) => String(subject.id_asignatura) === form.id_asignatura) ?? null;
    const groupOptions: Option[] = groups.map((group) => ({
        id: group.id_seccion,
        label: `${group.codigo} · ${group.carreras?.nombre ?? 'Carrera'} · ${group.sede} · ${group.modalidad}/${group.turno}`,
    }));
    const subjectOptions: Option[] = subjects
        .filter((subject) => selectedGroup && subject.id_carrera === selectedGroup.id_carrera && subject.ano_estudio === selectedGroup.ano_estudio
            && (linkedSubjects[selectedGroup.id_seccion] ?? []).includes(subject.id_asignatura))
        .map((subject) => ({ id: subject.id_asignatura, label: `${subject.codigo} · ${subject.nombre}` }));
    const options = choiceKind === 'group' ? groupOptions : subjectOptions;

    const loadTeachersForCareer = async (careerId: number) => {
        const { data, error } = await supabase.rpc('list_academic_assignment_teachers', { p_career_id: careerId });
        if (error) {
            Alert.alert('Docentes no disponibles', 'No se pudo consultar la lista de docentes activos de esta carrera.');
            return;
        }
        const available = (data ?? []) as Teacher[];
        setTeachers(available);
        setTeacherNames((current) => ({ ...current, ...Object.fromEntries(available.map((teacher) => [teacher.id_docente, teacher.nombre])) }));
    };

    const openCreate = () => {
        setForm({ ...emptyForm });
        setSelectedTeachers([]);
        setSelectedResources([]);
        setFormVisible(true);
    };

    const openEdit = async (assignment: AcademicAssignment, component: AssignmentComponent) => {
        const group = groups.find((item) => item.id_seccion === assignment.id_seccion);
        if (!group) return;
        await loadTeachersForCareer(group.id_carrera);
        setForm({
            id_seccion: String(assignment.id_seccion),
            id_asignatura: String(assignment.id_asignatura),
            tipo_sesion: component.tipo_sesion,
            sesiones_semana: String(component.sesiones_semana),
            duracion_minutos: String(component.duracion_minutos),
            requiere_espacio_especializado: component.requiere_espacio_especializado,
            observacion_espacio: component.observacion_espacio,
        });
        setSelectedTeachers(componentTeachers[component.id_componente] ?? []);
        setSelectedResources(componentResources[component.id_componente] ?? []);
        setFormVisible(true);
    };

    const chooseOption = async (option: Option) => {
        if (choiceKind === 'group') {
            const group = groups.find((item) => item.id_seccion === option.id);
            setForm((current) => ({
                ...current,
                id_seccion: String(option.id),
                id_asignatura: '',
                sesiones_semana: group?.modalidad === 'regular' && ['matutino', 'vespertino'].includes(group.turno) ? '2' : '',
                duracion_minutos: group?.modalidad === 'regular' && ['matutino', 'vespertino'].includes(group.turno) ? '90' : group?.modalidad === 'encuentro' ? '60' : '',
            }));
            setSelectedTeachers([]);
            setSelectedResources([]);
            if (group) await loadTeachersForCareer(group.id_carrera);
        } else {
            setForm((current) => ({ ...current, id_asignatura: String(option.id) }));
            setSelectedResources(subjectResources[option.id] ?? []);
        }
        setChoiceVisible(false);
    };

    const handleSave = async () => {
        const count = Number(form.sesiones_semana);
        const duration = Number(form.duracion_minutos);
        if (!selectedGroup || !selectedSubject) {
            Alert.alert('Datos incompletos', 'Seleccione un grupo y una asignatura vinculada.');
            return;
        }
        if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(duration) || duration < 1 || duration > 480) {
            Alert.alert('Revise las sesiones', 'Indique sesiones semanales (1–20) y duración por sesión (1–480 minutos). No se usan horas contractuales.');
            return;
        }
        if (selectedTeachers.length === 0) {
            Alert.alert('Faltan docentes', 'Seleccione al menos un docente oficial para este tipo de clase.');
            return;
        }
        if (form.requiere_espacio_especializado && !form.observacion_espacio.trim()) {
            Alert.alert('Falta describir el espacio', 'Indique qué necesita el espacio especializado.');
            return;
        }
        setSaving(true);
        const { error } = await supabase.rpc('save_academic_assignment_component', {
            p_section_id: selectedGroup.id_seccion,
            p_subject_id: selectedSubject.id_asignatura,
            p_component: {
                tipo_sesion: form.tipo_sesion,
                sesiones_semana: count,
                duracion_minutos: duration,
                requiere_espacio_especializado: form.requiere_espacio_especializado,
                observacion_espacio: form.observacion_espacio.trim(),
                docentes: selectedTeachers,
                recursos: selectedResources,
            },
        });
        setSaving(false);
        if (error) {
            const message = error.message.includes('linked to this group')
                ? 'La asignatura debe estar activa y vinculada a la carrera y año de este grupo.'
                : error.message.includes('active official teacher')
                    ? 'Seleccione docentes oficiales activos.'
                    : 'No se pudo guardar la asignación académica. Revise los datos e intente de nuevo.';
            Alert.alert('No se pudo guardar', message);
            return;
        }
        setFormVisible(false);
        await fetchData();
    };

    const assignmentGroups = useMemo(() => new Map(groups.map((group) => [group.id_seccion, group])), [groups]);
    const assignmentSubjects = useMemo(() => new Map(subjects.map((subject) => [subject.id_asignatura, subject])), [subjects]);
    const visibleAssignments = assignments.filter((assignment) => {
        const group = assignmentGroups.get(assignment.id_seccion);
        const subject = assignmentSubjects.get(assignment.id_asignatura);
        const query = search.trim().toLocaleLowerCase();
        return !query || `${group?.codigo ?? ''} ${subject?.codigo ?? ''} ${subject?.nombre ?? ''} ${group?.carreras?.nombre ?? ''}`.toLocaleLowerCase().includes(query);
    });

    const renderAssignment = ({ item }: { item: AcademicAssignment }) => {
        const group = assignmentGroups.get(item.id_seccion);
        const subject = assignmentSubjects.get(item.id_asignatura);
        const assignmentComponents = components.filter((component) => component.id_asignacion_academica === item.id_asignacion_academica);
        return (
            <View style={styles.card}>
                <Text style={styles.cardTitle}>{subject?.codigo ?? 'Asignatura'} · {subject?.nombre ?? ''}</Text>
                <Text style={styles.cardDetail}>{group?.codigo ?? 'Grupo'} · {group?.carreras?.nombre ?? 'Carrera'} · {group?.sede ?? 'Sede pendiente'}</Text>
                <Text style={styles.cardDetail}>{group?.periodos?.nombre} {group?.periodos?.ano_lectivo} · {group?.modalidad} · {group?.turno}</Text>
                {assignmentComponents.map((component) => {
                    const teacherSummary = (componentTeachers[component.id_componente] ?? []).map((id) => teacherNames[id] ?? `Docente ${id}`).join(', ');
                    const resourceSummary = (componentResources[component.id_componente] ?? []).map((id) => resources.find((resource) => resource.id_recurso === id)?.nombre).filter(Boolean).join(', ');
                    return (
                        <View key={component.id_componente} style={styles.componentRow}>
                            <View style={styles.componentCopy}>
                                <Text style={styles.componentTitle}>{component.tipo_sesion === 'teorica' ? 'Teoría' : 'Práctica'} · {component.sesiones_semana} sesiones/semana · {component.duracion_minutos} min</Text>
                                <Text style={styles.cardDetail}>Docentes: {teacherSummary || 'Sin asignar'}</Text>
                                {component.requiere_espacio_especializado || resourceSummary ? <Text style={styles.cardDetail}>Espacio: {component.observacion_espacio || 'Especializado'}{resourceSummary ? ` · ${resourceSummary}` : ''}</Text> : null}
                            </View>
                            <TouchableOpacity style={styles.editButton} onPress={() => void openEdit(item, component)}>
                                <Text style={styles.editText}>Editar</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
                {assignmentComponents.length === 0 ? <Text style={styles.cardDetail}>La asignación necesita componentes de teoría o práctica.</Text> : null}
            </View>
        );
    };

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <Text style={styles.title}>Asignación académica</Text>
                <Text style={styles.subtitle}>Registre sesiones semanales y docentes oficiales. La carga contractual no se convierte en sesiones.</Text>
                <TouchableOpacity style={styles.importButton} onPress={() => router.push((role === 'administrador' ? '/(admin)/assignment-import' : role === 'planificacion' ? '/(planificacion)/assignment-import' : '/(coordinacion)/assignment-import') as never)}>
                    <Text style={styles.importButtonText}>Importar archivo oficial</Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={visibleAssignments}
                renderItem={renderAssignment}
                keyExtractor={(item) => String(item.id_asignacion_academica)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchData(); }} />}
                ListHeaderComponent={<TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Buscar por grupo, asignatura o carrera" placeholderTextColor={Colors.textTertiary} returnKeyType="search" />}
                ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyText}>{groups.length ? 'No hay asignaciones registradas para esta búsqueda.' : 'Registre primero grupos académicos y vincule asignaturas.'}</Text></View>}
            />
            <TouchableOpacity style={styles.fab} onPress={openCreate} accessibilityLabel="Nueva asignación académica"><Text style={styles.fabText}>+</Text></TouchableOpacity>

            <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Asignación de clase</Text>
                        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text style={styles.formLabel}>Grupo y período</Text>
                            <TouchableOpacity style={styles.selectButton} onPress={() => { setChoiceKind('group'); setChoiceVisible(true); }}>
                                <Text numberOfLines={2} style={selectedGroup ? styles.selectText : styles.placeholderText}>{selectedGroup ? `${selectedGroup.codigo} · ${selectedGroup.carreras?.nombre} · ${selectedGroup.sede}` : 'Seleccionar grupo'}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Asignatura vinculada</Text>
                            <TouchableOpacity style={styles.selectButton} onPress={() => { if (!selectedGroup) { Alert.alert('Seleccione un grupo', 'Primero seleccione el grupo académico.'); return; } setChoiceKind('subject'); setChoiceVisible(true); }}>
                                <Text numberOfLines={2} style={selectedSubject ? styles.selectText : styles.placeholderText}>{selectedSubject ? `${selectedSubject.codigo} · ${selectedSubject.nombre}` : 'Seleccionar asignatura'}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Tipo de clase</Text>
                            <View style={styles.chipRow}>
                                {(['teorica', 'practica'] as const).map((type) => (
                                    <TouchableOpacity key={type} style={[styles.chip, form.tipo_sesion === type && styles.chipActive]} onPress={() => setForm((current) => ({ ...current, tipo_sesion: type }))}>
                                        <Text style={[styles.chipText, form.tipo_sesion === type && styles.chipTextActive]}>{type === 'teorica' ? 'Teoría' : 'Práctica'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={styles.formRow}>
                                <View style={styles.formColumn}>
                                    <Text style={styles.formLabel}>Sesiones por semana</Text>
                                    <TextInput style={styles.input} value={form.sesiones_semana} onChangeText={(value) => setForm((current) => ({ ...current, sesiones_semana: value.replace(/\D/g, '') }))} keyboardType="number-pad" placeholder="Ej. 2" maxLength={2} />
                                </View>
                                <View style={styles.formColumn}>
                                    <Text style={styles.formLabel}>Minutos por sesión</Text>
                                    <TextInput style={styles.input} value={form.duracion_minutos} onChangeText={(value) => setForm((current) => ({ ...current, duracion_minutos: value.replace(/\D/g, '') }))} keyboardType="number-pad" placeholder="Ej. 90" maxLength={3} />
                                </View>
                            </View>
                            {selectedGroup ? <Text style={styles.helperText}>
                                {selectedGroup.modalidad === 'regular' && ['matutino', 'vespertino'].includes(selectedGroup.turno)
                                    ? 'Predeterminado para esta cuadrícula: 2 sesiones de 90 minutos. Ajuste si la asignación oficial indica una excepción.'
                                    : selectedGroup.modalidad === 'encuentro'
                                        ? 'Predeterminado para Encuentro: sesiones de 60 minutos. Indique la cantidad oficial.'
                                        : 'Indique cantidad y duración según la asignación oficial; no se infieren de horas contractuales.'}
                            </Text> : null}
                            <View style={styles.switchRow}>
                                <Text style={styles.formLabel}>¿Requiere espacio especializado?</Text>
                                <Switch value={form.requiere_espacio_especializado} onValueChange={(value) => setForm((current) => ({ ...current, requiere_espacio_especializado: value }))} />
                            </View>
                            {form.requiere_espacio_especializado ? (
                                <TextInput style={[styles.input, styles.multiline]} value={form.observacion_espacio} onChangeText={(value) => setForm((current) => ({ ...current, observacion_espacio: value }))} placeholder="Describa el espacio requerido" maxLength={300} multiline />
                            ) : null}
                            <Text style={styles.formLabel}>Equipamiento necesario</Text>
                            {resources.map((resource) => (
                                <View key={resource.id_recurso} style={styles.resourceRow}>
                                    <Text style={styles.resourceName}>{resource.nombre}</Text>
                                    <Switch value={selectedResources.includes(resource.id_recurso)} onValueChange={(enabled) => setSelectedResources((current) => enabled ? [...new Set([...current, resource.id_recurso])] : current.filter((id) => id !== resource.id_recurso))} />
                                </View>
                            ))}
                            <Text style={styles.formLabel}>Docentes oficiales · seleccione todos los que participan</Text>
                            {teachers.map((teacher) => (
                                <View key={teacher.id_docente} style={styles.resourceRow}>
                                    <View style={styles.teacherCopy}>
                                        <Text style={styles.resourceName}>{teacher.nombre}</Text>
                                        {teacher.especialidad ? <Text style={styles.helperText}>{teacher.especialidad}</Text> : null}
                                    </View>
                                    <Switch value={selectedTeachers.includes(teacher.id_docente)} onValueChange={(enabled) => setSelectedTeachers((current) => enabled ? [...new Set([...current, teacher.id_docente])] : current.filter((id) => id !== teacher.id_docente))} />
                                </View>
                            ))}
                            {selectedGroup && !teachers.length ? <Text style={styles.helperText}>No hay docentes activos disponibles para seleccionar.</Text> : null}
                            <Text style={styles.helperText}>Si hay más de un docente en la clase, todos quedan ocupados durante el mismo intervalo. No se gestionan mentorías ni subdivisiones.</Text>
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setFormVisible(false)} disabled={saving}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={() => void handleSave()} disabled={saving}>
                                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Guardar asignación</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={choiceVisible} transparent animationType="fade" onRequestClose={() => setChoiceVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.selectorCard}>
                        <Text style={styles.modalTitle}>{choiceKind === 'group' ? 'Seleccionar grupo' : 'Seleccionar asignatura'}</Text>
                        <FlatList data={options} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<Text style={styles.emptyText}>No hay opciones compatibles.</Text>} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.optionButton} onPress={() => void chooseOption(item)}><Text style={styles.optionText}>{item.label}</Text></TouchableOpacity>
                        )} />
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setChoiceVisible(false)}><Text style={styles.cancelText}>Cerrar</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    header: { padding: Spacing.lg, paddingBottom: Spacing.sm },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    importButton: { alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, marginTop: Spacing.md, minHeight: 42, justifyContent: 'center', paddingHorizontal: Spacing.md },
    importButtonText: { color: Colors.white, fontSize: Typography.sizes.xs, fontWeight: '700' },
    listContent: { flexGrow: 1, padding: Spacing.lg, paddingBottom: 100 },
    searchInput: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, marginBottom: Spacing.md, minHeight: 44, paddingHorizontal: Spacing.md },
    card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    cardTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700' },
    cardDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
    componentRow: { alignItems: 'center', borderTopColor: Colors.border, borderTopWidth: 1, flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md },
    componentCopy: { flex: 1, paddingRight: Spacing.sm },
    componentTitle: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    editButton: { backgroundColor: Colors.primary + '10', borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    editText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.xl },
    emptyText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, textAlign: 'center' },
    fab: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 28, bottom: Spacing.xxl, height: 56, justifyContent: 'center', position: 'absolute', right: Spacing.xl, width: 56, ...Shadows.lg },
    fabText: { color: Colors.white, fontSize: 30, fontWeight: '300', marginTop: -2 },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '94%', padding: Spacing.xl },
    formScroll: { flexShrink: 1, maxHeight: '82%' },
    selectorCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, margin: Spacing.lg, maxHeight: '78%', padding: Spacing.xl },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', marginBottom: Spacing.md, textAlign: 'center' },
    formLabel: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginBottom: Spacing.xs, marginTop: Spacing.md, textTransform: 'uppercase' },
    selectButton: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    selectText: { color: Colors.textPrimary, fontSize: Typography.sizes.sm },
    placeholderText: { color: Colors.textTertiary, fontSize: Typography.sizes.sm },
    chipRow: { flexDirection: 'row', gap: Spacing.sm },
    chip: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    chipTextActive: { color: Colors.white },
    formRow: { flexDirection: 'row', gap: Spacing.md },
    formColumn: { flex: 1 },
    input: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, minHeight: 46, paddingHorizontal: Spacing.md },
    multiline: { minHeight: 80, paddingTop: Spacing.md, textAlignVertical: 'top' },
    helperText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginVertical: Spacing.sm },
    switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    resourceRow: { alignItems: 'center', borderBottomColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 48 },
    teacherCopy: { flex: 1 },
    resourceName: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
    cancelButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.md },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    saveButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.md },
    saveText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    optionButton: { borderBottomColor: Colors.border, borderBottomWidth: 1, paddingVertical: Spacing.md },
    optionText: { color: Colors.textPrimary, fontSize: Typography.sizes.sm },
});

import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
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
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Period = { id_periodo: number; nombre: string; ano_lectivo: number; es_activo: boolean };
type Career = { id_carrera: number; nombre: string };
type Group = { id_seccion: number; id_periodo: number; id_carrera: number; codigo: string };
type Subject = { id_asignatura: number; id_carrera: number; codigo: string; nombre: string };
type Teacher = { id_docente: number; nombre: string; especialidad: string | null };
type Restriction = {
    id_restriccion: number; id_periodo: number; id_carrera: number; tipo_afectado: string; id_afectado: number | null;
    condicion: string; dia: string | null; hora_inicio: string | null; hora_fin: string | null; detalle: string;
    parametros: Record<string, unknown>; creada_por: number; fecha_creacion: string;
};
type Impact = { group_code: string; subject_name: string; teacher_name: string; day_name: string; time_range: string };
type TargetType = 'docente' | 'asignatura' | 'grupo' | 'sede' | 'carrera';
type Condition = 'bloqueo' | 'preferencia' | 'juntas' | 'distribucion';

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const targetLabels: Record<TargetType, string> = { docente: 'Docente', asignatura: 'Asignatura', grupo: 'Grupo', sede: 'Sede', carrera: 'Carrera completa' };
const conditionLabels: Record<Condition, string> = { bloqueo: 'Bloqueo obligatorio', preferencia: 'Preferencia', juntas: 'Clases juntas', distribucion: 'Distribución particular' };

export default function RestrictionsScreen() {
    const { role, profile } = useAuth();
    const canEdit = role === 'jefatura';
    const [periods, setPeriods] = useState<Period[]>([]);
    const [careers, setCareers] = useState<Career[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [restrictions, setRestrictions] = useState<Restriction[]>([]);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [formVisible, setFormVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [editing, setEditing] = useState<Restriction | null>(null);
    const [careerId, setCareerId] = useState<number | null>(null);
    const [targetType, setTargetType] = useState<TargetType>('docente');
    const [affectedId, setAffectedId] = useState<number | null>(null);
    const [condition, setCondition] = useState<Condition>('bloqueo');
    const [day, setDay] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [detail, setDetail] = useState('');
    const [site, setSite] = useState('');
    const [togetherGroups, setTogetherGroups] = useState<number[]>([]);
    const [impacts, setImpacts] = useState<Impact[]>([]);
    const [careerFilter, setCareerFilter] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        const [periodResult, careerResult, groupResult, subjectResult, restrictionResult] = await Promise.all([
            supabase.from('periodos').select('id_periodo, nombre, ano_lectivo, es_activo').order('ano_lectivo', { ascending: false }),
            supabase.from('carreras').select('id_carrera, nombre').order('nombre'),
            supabase.from('secciones').select('id_seccion, id_periodo, id_carrera, codigo').order('codigo'),
            supabase.from('asignaturas').select('id_asignatura, id_carrera, codigo, nombre').order('nombre'),
            supabase.from('restricciones_planificacion').select('id_restriccion, id_periodo, id_carrera, tipo_afectado, id_afectado, condicion, dia, hora_inicio, hora_fin, detalle, parametros, creada_por, fecha_creacion').order('fecha_creacion', { ascending: false }),
        ]);
        if ([periodResult.error, careerResult.error, groupResult.error, subjectResult.error, restrictionResult.error].some(Boolean)) {
            Alert.alert('No se cargaron las restricciones', 'Actualice la pantalla y compruebe que el Sprint 3 de la base de datos esté aplicado.');
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const periodRows = (periodResult.data ?? []) as Period[];
        const careerRows = (careerResult.data ?? []) as Career[];
        setPeriods(periodRows);
        setCareers(careerRows);
        setGroups((groupResult.data ?? []) as Group[]);
        setSubjects((subjectResult.data ?? []) as Subject[]);
        setRestrictions((restrictionResult.data ?? []) as Restriction[]);
        setPeriodId((current) => current ?? periodRows.find((period) => period.es_activo)?.id_periodo ?? periodRows[0]?.id_periodo ?? null);
        if (careerRows.length === 1) setCareerId((current) => current ?? careerRows[0].id_carrera);
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!careerId) { setTeachers([]); return; }
        void supabase.rpc('list_academic_assignment_teachers', { p_career_id: careerId }).then(({ data, error }) => {
            if (error) return;
            setTeachers((data ?? []) as Teacher[]);
        });
    }, [careerId]);

    const scopedGroups = groups.filter((group) => (!periodId || group.id_periodo === periodId) && (!careerId || group.id_carrera === careerId));
    const scopedSubjects = subjects.filter((subject) => !careerId || subject.id_carrera === careerId);
    const targetOptions = targetType === 'docente'
        ? teachers.map((teacher) => ({ id: teacher.id_docente, label: teacher.nombre }))
        : targetType === 'asignatura'
            ? scopedSubjects.map((subject) => ({ id: subject.id_asignatura, label: `${subject.codigo} · ${subject.nombre}` }))
            : targetType === 'grupo'
                ? scopedGroups.map((group) => ({ id: group.id_seccion, label: group.codigo }))
                : [];
    const conditionParams = () => ({
        ...(targetType === 'sede' ? { sede: site.trim() } : {}),
        ...(condition === 'juntas' ? { grupos: togetherGroups } : {}),
        ...(condition === 'distribucion' ? { distribucion: detail.trim() } : {}),
    });

    const resetForm = () => {
        setEditing(null);
        setCareerId(careerFilter ?? (careers.length === 1 ? careers[0].id_carrera : null));
        setTargetType('docente');
        setAffectedId(null);
        setCondition('bloqueo');
        setDay(''); setStart(''); setEnd(''); setDetail(''); setSite(''); setTogetherGroups([]); setImpacts([]);
    };

    const openCreate = () => { resetForm(); setFormVisible(true); };
    const openEdit = (item: Restriction) => {
        setEditing(item);
        setCareerId(item.id_carrera);
        setTargetType(item.tipo_afectado as TargetType);
        setAffectedId(item.id_afectado);
        setCondition(item.condicion as Condition);
        setDay(item.dia ?? '');
        setStart(item.hora_inicio?.slice(0, 5) ?? '');
        setEnd(item.hora_fin?.slice(0, 5) ?? '');
        setDetail(item.detalle);
        setSite(String(item.parametros?.sede ?? ''));
        setTogetherGroups(Array.isArray(item.parametros?.grupos) ? (item.parametros.grupos as number[]) : []);
        setImpacts([]);
        setFormVisible(true);
    };

    // Valida los datos y consulta las clases que podrían verse afectadas antes de guardar.
    const getPreview = async (): Promise<Impact[] | null> => {
        if (!periodId || !careerId) {
            Alert.alert('Faltan datos', 'Seleccione un período y una carrera.');
            return null;
        }
        if ((start && !end) || (!start && end) || (start && end && start >= end)) {
            Alert.alert('Intervalo inválido', 'Indique una hora inicial y final válidas, o deje ambas vacías.');
            return null;
        }
        if (targetType === 'sede' && !site.trim()) {
            Alert.alert('Sede obligatoria', 'Indique la sede afectada.');
            return null;
        }
        if (condition === 'juntas' && togetherGroups.length < 2) {
            Alert.alert('Seleccione grupos', 'Una regla de clases juntas requiere al menos dos grupos.');
            return null;
        }
        setPreviewing(true);
        const { data, error } = await supabase.rpc('preview_restriction_impact', {
            p_period_id: periodId,
            p_career_id: careerId,
            p_affected_type: targetType,
            p_affected_id: targetType === 'sede' || targetType === 'carrera' ? null : affectedId,
            p_condition: condition,
            p_day: day || null,
            p_start: start ? `${start}:00` : null,
            p_end: end ? `${end}:00` : null,
            p_parameters: conditionParams(),
        });
        setPreviewing(false);
        if (error) {
            Alert.alert('No se pudo validar', error.message.includes('valid start') ? 'Revise el intervalo de horas.' : 'No se pudo consultar las clases afectadas.');
            return null;
        }
        const previewRows = (data ?? []) as Impact[];
        setImpacts(previewRows);
        return previewRows;
    };

    const handleSave = async () => {
        if (!canEdit) return;
        if (!detail.trim() || detail.trim().length > 500 || !periodId || !careerId) {
            Alert.alert('Revise los datos', 'Complete el período, la carrera y la descripción (hasta 500 caracteres).');
            return;
        }
        if (targetType !== 'carrera' && targetType !== 'sede' && !affectedId) {
            Alert.alert('Seleccione el afectado', `Elija el elemento afectado: ${targetLabels[targetType].toLowerCase()}.`);
            return;
        }
        const previewRows = await getPreview();
        if (!previewRows) return;
        setSaving(true);
        const payload = {
            id_periodo: periodId,
            id_carrera: careerId,
            tipo_afectado: targetType,
            id_afectado: targetType === 'sede' || targetType === 'carrera' ? null : affectedId,
            condicion: condition,
            dia: day || null,
            hora_inicio: start ? `${start}:00` : null,
            hora_fin: end ? `${end}:00` : null,
            detalle: detail.trim(),
            parametros: conditionParams(),
            creada_por: editing?.creada_por ?? profile?.id_usuario,
        };
        const result = editing
            ? await supabase.from('restricciones_planificacion').update(payload).eq('id_restriccion', editing.id_restriccion)
            : await supabase.from('restricciones_planificacion').insert(payload);
        setSaving(false);
        if (result.error) {
            Alert.alert('No se pudo guardar', result.error.message.includes('belong to the selected career')
                ? 'El afectado debe pertenecer a la carrera seleccionada.'
                : result.error.message.includes('groups')
                    ? 'Seleccione al menos dos grupos válidos para la condición.'
                    : 'Revise los datos y los permisos de la jefatura.');
            return;
        }
        setFormVisible(false);
        await fetchData();
        Alert.alert('Restricción guardada', `${previewRows.length} clase(s) coinciden con los filtros actuales. Sin restricciones comunicadas, la planificación no bloquea por disponibilidad pendiente.`);
    };

    const getAffectedLabel = (item: Restriction) => {
        if (item.tipo_afectado === 'docente') return teachers.find((teacher) => teacher.id_docente === item.id_afectado)?.nombre ?? `Docente ${item.id_afectado}`;
        if (item.tipo_afectado === 'asignatura') return subjects.find((subject) => subject.id_asignatura === item.id_afectado)?.nombre ?? `Asignatura ${item.id_afectado}`;
        if (item.tipo_afectado === 'grupo') return groups.find((group) => group.id_seccion === item.id_afectado)?.codigo ?? `Grupo ${item.id_afectado}`;
        if (item.tipo_afectado === 'sede') return String(item.parametros?.sede ?? 'Sede');
        return 'Carrera completa';
    };

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {canEdit ? <View style={styles.header}>
                <Text style={styles.title}>Restricciones autorizadas</Text>
                <Text style={styles.subtitle}>Registre condiciones comunicadas y autorizadas. No se crean solicitudes ni trámites internos.</Text>
            </View> : null}
            <FlatList
                data={restrictions.filter((item) => (!periodId || item.id_periodo === periodId) && (!careerFilter || item.id_carrera === careerFilter))}
                keyExtractor={(item) => String(item.id_restriccion)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchData(); }} />}
                ListHeaderComponent={<View>
                    <Text style={styles.formLabel}>Período</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        {periods.map((period) => <TouchableOpacity key={period.id_periodo} style={[styles.chip, periodId === period.id_periodo && styles.chipActive]} onPress={() => setPeriodId(period.id_periodo)}><Text style={[styles.chipText, periodId === period.id_periodo && styles.chipTextActive]}>{period.nombre} {period.ano_lectivo}</Text></TouchableOpacity>)}
                    </ScrollView>
                    <Text style={styles.formLabel}>Carrera</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        <TouchableOpacity style={[styles.chip, !careerFilter && styles.chipActive]} onPress={() => setCareerFilter(null)}><Text style={[styles.chipText, !careerFilter && styles.chipTextActive]}>Todas</Text></TouchableOpacity>
                        {careers.map((career) => <TouchableOpacity key={career.id_carrera} style={[styles.chip, careerFilter === career.id_carrera && styles.chipActive]} onPress={() => { setCareerFilter(career.id_carrera); setCareerId(career.id_carrera); }}><Text style={[styles.chipText, careerFilter === career.id_carrera && styles.chipTextActive]}>{career.nombre}</Text></TouchableOpacity>)}
                    </ScrollView>
                </View>}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{conditionLabels[item.condicion as Condition] ?? item.condicion}</Text>
                            {canEdit && item.creada_por === profile?.id_usuario ? <TouchableOpacity style={styles.editButton} onPress={() => openEdit(item)}><Text style={styles.editText}>Editar</Text></TouchableOpacity> : null}
                        </View>
                        <Text style={styles.cardDetail}>{targetLabels[item.tipo_afectado as TargetType]} · {getAffectedLabel(item)}</Text>
                        <Text style={styles.cardDetail}>{item.dia ?? 'Cualquier día'}{item.hora_inicio && item.hora_fin ? ` · ${item.hora_inicio.slice(0, 5)}–${item.hora_fin.slice(0, 5)}` : ''}</Text>
                        <Text style={styles.detailText}>{item.detalle}</Text>
                            <Text style={styles.responsible}>Responsable registrado: cuenta {item.creada_por}</Text>
                    </View>
                )}
                ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyText}>No hay restricciones registradas para este período.</Text><Text style={styles.helperText}>La ausencia de una restricción comunicada no bloquea la asignación.</Text></View>}
            />
            {canEdit ? <TouchableOpacity style={styles.fab} onPress={openCreate} accessibilityLabel="Registrar restricción"><Text style={styles.fabText}>+</Text></TouchableOpacity> : null}

            <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{editing ? 'Editar restricción' : 'Nueva restricción autorizada'}</Text>
                        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text style={styles.formLabel}>Período</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                                {periods.map((period) => <TouchableOpacity key={period.id_periodo} style={[styles.chip, periodId === period.id_periodo && styles.chipActive]} onPress={() => setPeriodId(period.id_periodo)}><Text style={[styles.chipText, periodId === period.id_periodo && styles.chipTextActive]}>{period.nombre} {period.ano_lectivo}</Text></TouchableOpacity>)}
                            </ScrollView>
                            <Text style={styles.formLabel}>Carrera autorizada</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                                {careers.map((career) => <TouchableOpacity key={career.id_carrera} style={[styles.chip, careerId === career.id_carrera && styles.chipActive]} onPress={() => { setCareerId(career.id_carrera); setAffectedId(null); setTogetherGroups([]); }}><Text style={[styles.chipText, careerId === career.id_carrera && styles.chipTextActive]}>{career.nombre}</Text></TouchableOpacity>)}
                            </ScrollView>
                            <Text style={styles.formLabel}>Afectado</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                                {(Object.keys(targetLabels) as TargetType[]).map((type) => <TouchableOpacity key={type} style={[styles.chip, targetType === type && styles.chipActive]} onPress={() => { setTargetType(type); setAffectedId(null); }}><Text style={[styles.chipText, targetType === type && styles.chipTextActive]}>{targetLabels[type]}</Text></TouchableOpacity>)}
                            </ScrollView>
                            {targetOptions.length ? <ScrollView style={styles.targetList} nestedScrollEnabled>
                                {targetOptions.map((option) => <TouchableOpacity key={option.id} style={[styles.targetOption, affectedId === option.id && styles.targetOptionActive]} onPress={() => setAffectedId(option.id)}><Text style={[styles.targetText, affectedId === option.id && styles.targetTextActive]}>{option.label}</Text></TouchableOpacity>)}
                            </ScrollView> : null}
                            {targetType === 'sede' ? <TextInput style={styles.input} value={site} onChangeText={setSite} placeholder="Nombre de sede" maxLength={150} /> : null}
                            <Text style={styles.formLabel}>Condición autorizada</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                                {(Object.keys(conditionLabels) as Condition[]).map((item) => <TouchableOpacity key={item} style={[styles.chip, condition === item && styles.chipActive]} onPress={() => setCondition(item)}><Text style={[styles.chipText, condition === item && styles.chipTextActive]}>{conditionLabels[item]}</Text></TouchableOpacity>)}
                            </ScrollView>
                            {condition === 'juntas' ? <>
                                <Text style={styles.helperText}>Seleccione los grupos que deben quedar juntos. Se requieren al menos dos.</Text>
                                {scopedGroups.map((group) => <TouchableOpacity key={group.id_seccion} style={styles.groupRow} onPress={() => setTogetherGroups((current) => current.includes(group.id_seccion) ? current.filter((id) => id !== group.id_seccion) : [...current, group.id_seccion])}>
                                    <Text style={styles.targetText}>{group.codigo}</Text><Text style={styles.groupCheck}>{togetherGroups.includes(group.id_seccion) ? '✓' : '＋'}</Text>
                                </TouchableOpacity>)}
                            </> : null}
                            <Text style={styles.formLabel}>Día (opcional)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                                <TouchableOpacity style={[styles.chip, !day && styles.chipActive]} onPress={() => setDay('')}><Text style={[styles.chipText, !day && styles.chipTextActive]}>Cualquier día</Text></TouchableOpacity>
                                {DAYS.map((item) => <TouchableOpacity key={item} style={[styles.chip, day === item && styles.chipActive]} onPress={() => setDay(item)}><Text style={[styles.chipText, day === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}
                            </ScrollView>
                            <View style={styles.timeRow}>
                                <View style={styles.timeColumn}><Text style={styles.formLabel}>Desde (opcional)</Text><TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="08:00" keyboardType="numbers-and-punctuation" /></View>
                                <View style={styles.timeColumn}><Text style={styles.formLabel}>Hasta (opcional)</Text><TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="10:00" keyboardType="numbers-and-punctuation" /></View>
                            </View>
                            <Text style={styles.formLabel}>Detalle comunicado</Text>
                            <TextInput style={[styles.input, styles.multiline]} value={detail} onChangeText={setDetail} placeholder="Describa la condición autorizada" maxLength={500} multiline />
                            {impacts.length ? <View style={styles.impactBox}>
                                <Text style={styles.impactTitle}>{impacts.length} clase(s) afectada(s)</Text>
                                {impacts.slice(0, 8).map((impact, index) => <Text key={`${impact.group_code}-${index}`} style={styles.helperText}>{impact.group_code} · {impact.subject_name} · {impact.teacher_name} · {impact.day_name} {impact.time_range}</Text>)}
                                {impacts.length > 8 ? <Text style={styles.helperText}>Y {impacts.length - 8} clases más.</Text> : null}
                            </View> : null}
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setFormVisible(false)} disabled={saving}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.previewButton} onPress={() => void getPreview()} disabled={previewing || saving}>{previewing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Validar clases</Text>}</TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={() => void handleSave()} disabled={saving || previewing}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Guardar</Text>}</TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    header: { padding: Spacing.lg, paddingBottom: Spacing.xs },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    listContent: { flexGrow: 1, padding: Spacing.lg, paddingBottom: 100 },
    chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
    chip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    chipTextActive: { color: Colors.white, fontWeight: '700' },
    card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    cardTitle: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.md, fontWeight: '700' },
    cardDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    detailText: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.sm },
    responsible: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, marginTop: Spacing.md },
    editButton: { backgroundColor: Colors.primary + '10', borderRadius: BorderRadius.sm, marginLeft: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    editText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.xl },
    emptyText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, textAlign: 'center' },
    helperText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginVertical: Spacing.xs },
    fab: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 28, bottom: Spacing.xxl, height: 56, justifyContent: 'center', position: 'absolute', right: Spacing.xl, width: 56, ...Shadows.lg },
    fabText: { color: Colors.white, fontSize: 30, fontWeight: '300', marginTop: -2 },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '95%', padding: Spacing.lg },
    formScroll: { flexShrink: 1, maxHeight: '82%' },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', marginBottom: Spacing.sm, textAlign: 'center' },
    formLabel: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginTop: Spacing.md, textTransform: 'uppercase' },
    targetList: { maxHeight: 150, marginTop: Spacing.xs },
    targetOption: { borderBottomColor: Colors.border, borderBottomWidth: 1, paddingVertical: Spacing.sm },
    targetOptionActive: { backgroundColor: Colors.primary + '10' },
    targetText: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    targetTextActive: { color: Colors.primary, fontWeight: '700' },
    groupRow: { alignItems: 'center', borderBottomColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 44 },
    groupCheck: { color: Colors.primary, fontSize: Typography.sizes.md, fontWeight: '700', paddingHorizontal: Spacing.md },
    timeRow: { flexDirection: 'row', gap: Spacing.md },
    timeColumn: { flex: 1 },
    input: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, minHeight: 44, marginTop: Spacing.xs, paddingHorizontal: Spacing.md },
    multiline: { minHeight: 84, paddingTop: Spacing.md, textAlignVertical: 'top' },
    impactBox: { backgroundColor: Colors.success + '10', borderRadius: BorderRadius.md, marginTop: Spacing.md, padding: Spacing.md },
    impactTitle: { color: Colors.success, fontSize: Typography.sizes.sm, fontWeight: '700', marginBottom: Spacing.xs },
    modalActions: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
    cancelButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, flex: 0.85, justifyContent: 'center', minHeight: 44 },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '600' },
    previewButton: { alignItems: 'center', backgroundColor: Colors.accent, borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', minHeight: 44 },
    saveButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, flex: 0.8, justifyContent: 'center', minHeight: 44 },
    saveText: { color: Colors.white, fontSize: Typography.sizes.xs, fontWeight: '700' },
});

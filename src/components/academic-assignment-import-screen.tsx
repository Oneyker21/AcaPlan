import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { File as ExpoFile } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ImportField = 'career' | 'group' | 'subject' | 'session_type' | 'sessions' | 'duration' | 'teachers' | 'specialized' | 'space_note' | 'resources';
type Mapping = Partial<Record<ImportField, number | null>>;
type SheetData = { name: string; headers: string[]; rows: { row: number; values: string[] }[] };
type GroupRow = { id_seccion: number; id_periodo: number; id_carrera: number; codigo: string; modalidad: string; turno: string; ano_estudio: number; carreras?: { nombre: string } };
type SubjectRow = { id_asignatura: number; id_carrera: number; ano_estudio: number; codigo: string; nombre: string; estado: string };
type TeacherRow = { id_docente: number; nombre: string };
type ResourceRow = { id_recurso: number; nombre: string };
type PeriodRow = { id_periodo: number; nombre: string; ano_lectivo: number; es_activo: boolean };
type PreviewRow = { sheet: string; row: number; groupId?: number; subjectId?: number; type: string; sessions: number; duration: number; teachers: number[]; resources: number[]; specialized: boolean; note: string; errors: string[]; warning?: string };
type Option = { id: number | null; label: string };

const fields: { key: ImportField; label: string; required: boolean; aliases: string[] }[] = [
    { key: 'career', label: 'Carrera', required: false, aliases: ['carrera', 'programa'] },
    { key: 'group', label: 'Código de grupo', required: true, aliases: ['grupo', 'seccion', 'sección', 'codigo grupo', 'codigo seccion'] },
    { key: 'subject', label: 'Código de asignatura', required: true, aliases: ['asignatura', 'materia', 'codigo asignatura', 'codigo materia'] },
    { key: 'session_type', label: 'Tipo de clase', required: true, aliases: ['tipo', 'tipo clase', 'componente', 'teoria o practica'] },
    { key: 'sessions', label: 'Sesiones por semana', required: true, aliases: ['sesiones', 'sesiones semana', 'frecuencia'] },
    { key: 'duration', label: 'Minutos por sesión', required: true, aliases: ['duracion', 'duración', 'minutos', 'duracion minutos'] },
    { key: 'teachers', label: 'Docentes oficiales', required: true, aliases: ['docentes', 'docente', 'profesores', 'responsable'] },
    { key: 'specialized', label: '¿Espacio especializado?', required: false, aliases: ['especializado', 'aula especializada', 'requiere espacio especial'] },
    { key: 'space_note', label: 'Necesidad de espacio', required: false, aliases: ['espacio', 'necesidad', 'observacion espacio', 'observación espacio'] },
    { key: 'resources', label: 'Equipamiento o recursos', required: false, aliases: ['recursos', 'equipamiento', 'equipo'] },
];

function normalize(value: string) {
    return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function parseList(value: string) {
    return [...new Set(value.split(/[,;|\n]/).map((item) => item.trim()).filter(Boolean))];
}

export default function AcademicAssignmentImportScreen() {
    const router = useRouter();
    const [fileName, setFileName] = useState('');
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [mappings, setMappings] = useState<Record<string, Mapping>>({});
    const [includedSheets, setIncludedSheets] = useState<Record<string, boolean>>({});
    const [activeSheet, setActiveSheet] = useState('');
    const [periods, setPeriods] = useState<PeriodRow[]>([]);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [groups, setGroups] = useState<GroupRow[]>([]);
    const [subjects, setSubjects] = useState<SubjectRow[]>([]);
    const [subjectLinks, setSubjectLinks] = useState<Record<number, number[]>>({});
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [resources, setResources] = useState<ResourceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pickerField, setPickerField] = useState<ImportField | null>(null);
    const [mappingSheet, setMappingSheet] = useState('');

    useEffect(() => {
        let mounted = true;
        void Promise.all([
            supabase.from('periodos').select('id_periodo, nombre, ano_lectivo, es_activo').order('ano_lectivo', { ascending: false }),
            supabase.from('secciones').select('id_seccion, id_periodo, id_carrera, codigo, modalidad, turno, ano_estudio, carreras(nombre)'),
            supabase.from('asignaturas').select('id_asignatura, id_carrera, ano_estudio, codigo, nombre, estado').eq('estado', 'activo'),
            supabase.from('seccion_asignatura').select('id_seccion, id_asignatura'),
            supabase.from('recursos').select('id_recurso, nombre').order('nombre'),
        ]).then(async ([periodResult, groupResult, subjectResult, linkResult, resourceResult]) => {
            if (!mounted) return;
            if ([periodResult.error, groupResult.error, subjectResult.error, linkResult.error, resourceResult.error].some(Boolean)) {
                Alert.alert('No se preparó la importación', 'Revise las migraciones del Sprint 3 y actualice la pantalla.');
                setLoading(false);
                return;
            }
            const nextGroups = (groupResult.data ?? []) as unknown as GroupRow[];
            const nextPeriods = (periodResult.data ?? []) as PeriodRow[];
            const links: Record<number, number[]> = {};
            (linkResult.data ?? []).forEach((row) => { links[row.id_seccion] ??= []; links[row.id_seccion].push(row.id_asignatura); });
            setPeriods(nextPeriods);
            setPeriodId(nextPeriods.find((period) => period.es_activo)?.id_periodo ?? nextPeriods[0]?.id_periodo ?? null);
            setGroups(nextGroups);
            setSubjects((subjectResult.data ?? []) as SubjectRow[]);
            setSubjectLinks(links);
            setResources((resourceResult.data ?? []) as ResourceRow[]);
            const careerIds = [...new Set(nextGroups.map((group) => group.id_carrera))];
            const teacherLists = await Promise.all(careerIds.map((careerId) => supabase.rpc('list_academic_assignment_teachers', { p_career_id: careerId })));
            if (!mounted) return;
            const allTeachers = new Map<number, TeacherRow>();
            for (const response of teacherLists) (response.data ?? []).forEach((teacher: TeacherRow) => allTeachers.set(teacher.id_docente, teacher));
            setTeachers([...allTeachers.values()]);
            setLoading(false);
        }).catch(() => {
            if (!mounted) return;
            Alert.alert('Error', 'No se pudieron cargar los datos para revisar la asignación.');
            setLoading(false);
        });
        return () => { mounted = false; };
    }, []);

    const activeSheetData = sheets.find((sheet) => sheet.name === activeSheet) ?? null;
    const groupsForPeriod = groups.filter((group) => group.id_periodo === periodId);

    const previewRows = useMemo(() => {
        const rows: PreviewRow[] = [];
        for (const sheet of sheets) {
            if (!includedSheets[sheet.name]) continue;
            const mapping = mappings[sheet.name] ?? {};
            for (const source of sheet.rows) {
                const valueFor = (field: ImportField) => {
                    const column = mapping[field];
                    return typeof column === 'number' ? String(source.values[column] ?? '').trim() : '';
                };
                const careerCell = normalize(valueFor('career'));
                const groupCode = normalize(valueFor('group'));
                const subjectCode = normalize(valueFor('subject'));
                const sessionTypeRaw = normalize(valueFor('session_type'));
                const sessionType = ['teorica', 'teorico', 'teoria'].includes(sessionTypeRaw) ? 'teorica'
                    : ['practica', 'practico', 'practica'].includes(sessionTypeRaw) ? 'practica' : '';
                const sessionsRaw = valueFor('sessions');
                const durationRaw = valueFor('duration');
                const sessionCount = /^\d+$/.test(sessionsRaw) ? Number(sessionsRaw) : NaN;
                const duration = /^\d+$/.test(durationRaw) ? Number(durationRaw) : NaN;
                const teacherNames = parseList(valueFor('teachers'));
                const resourceNames = parseList(valueFor('resources'));
                const specializedRaw = normalize(valueFor('specialized'));
                const specialized = ['si', 'sí', 'true', '1', 'x', 'especializada'].includes(specializedRaw);
                const note = valueFor('space_note');
                const errors: string[] = [];
                if (!periodId) errors.push('Período: seleccione el período que contiene estos grupos.');
                if (!groupCode) errors.push('Grupo: falta el código.');
                if (!subjectCode) errors.push('Asignatura: falta el código.');
                if (!sessionType) errors.push('Tipo de clase: use Teoría o Práctica.');
                if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 20) errors.push('Sesiones por semana: indique un entero entre 1 y 20.');
                if (!Number.isInteger(duration) || duration < 1 || duration > 480) errors.push('Minutos por sesión: indique un entero entre 1 y 480.');
                if (!teacherNames.length) errors.push('Docentes: indique al menos un docente oficial activo.');
                if (specialized && !note) errors.push('Necesidad de espacio: describa el espacio especializado.');

                let matchedGroups = groupsForPeriod.filter((group) => normalize(group.codigo) === groupCode);
                if (careerCell) matchedGroups = matchedGroups.filter((group) => normalize(group.carreras?.nombre ?? '') === careerCell);
                if (matchedGroups.length === 0 && groupCode) errors.push('Grupo: no coincide con un grupo de la carrera/período seleccionados.');
                if (matchedGroups.length > 1) errors.push('Grupo: código ambiguo; mapee también la columna Carrera.');
                const group = matchedGroups.length === 1 ? matchedGroups[0] : undefined;
                const subject = subjects.find((item) => normalize(item.codigo) === subjectCode && (!group || item.id_carrera === group.id_carrera && item.ano_estudio === group.ano_estudio));
                if (!subject && subjectCode) errors.push('Asignatura: no coincide con una materia activa compatible con ese grupo.');
                if (group && subject && !(subjectLinks[group.id_seccion] ?? []).includes(subject.id_asignatura)) errors.push('Asignatura: no está vinculada a este grupo.');

                const teacherIds: number[] = [];
                for (const name of teacherNames) {
                    const matches = teachers.filter((teacher) => normalize(teacher.nombre) === normalize(name));
                    if (matches.length === 1) teacherIds.push(matches[0].id_docente);
                    else errors.push(matches.length ? `Docentes: «${name}» es ambiguo; revise la lista oficial.` : `Docentes: «${name}» no coincide con un docente activo.`);
                }
                const resourceIds: number[] = [];
                for (const name of resourceNames) {
                    const matches = resources.filter((resource) => normalize(resource.nombre) === normalize(name));
                    if (matches.length === 1) resourceIds.push(matches[0].id_recurso);
                    else errors.push(`Equipamiento: «${name}» no coincide con el catálogo de recursos.`);
                }
                rows.push({
                    sheet: sheet.name,
                    row: source.row,
                    groupId: group?.id_seccion,
                    subjectId: subject?.id_asignatura,
                    type: sessionType,
                    sessions: sessionCount,
                    duration,
                    teachers: [...new Set(teacherIds)],
                    resources: [...new Set(resourceIds)],
                    specialized,
                    note,
                    errors,
                });
            }
        }
        const keys = new Map<string, PreviewRow>();
        for (const row of rows) {
            if (!row.groupId || !row.subjectId || !row.type) continue;
            const key = `${row.groupId}:${row.subjectId}:${row.type}`;
            const duplicate = keys.get(key);
            if (duplicate) row.errors.push(`Duplicado: ya aparece en ${duplicate.sheet}, fila ${duplicate.row}.`);
            else keys.set(key, row);
        }
        return rows;
    }, [groupsForPeriod, includedSheets, mappings, periodId, resources, subjectLinks, subjects, teachers, sheets]);

    const selectedRows = previewRows.filter((row) => includedSheets[row.sheet]);
    const errorCount = selectedRows.reduce((total, row) => total + row.errors.length, 0);
    const canImport = selectedRows.length > 0 && errorCount === 0 && !saving && !reading;

    const autoMap = (headers: string[]): Mapping => {
        const result: Mapping = {};
        fields.forEach((field) => {
            const index = headers.findIndex((header) => field.aliases.some((alias) => normalize(header).includes(normalize(alias))));
            if (index >= 0) result[field.key] = index;
        });
        return result;
    };

    const chooseFile = async () => {
        if (!periodId) {
            Alert.alert('Seleccione período', 'Seleccione primero el período académico al que pertenecen los grupos.');
            return;
        }
        setReading(true);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            if (asset.size && asset.size > 15 * 1024 * 1024) {
                Alert.alert('Archivo demasiado grande', 'Seleccione un archivo de hasta 15 MB.');
                return;
            }
            const buffer = Platform.OS === 'web' && asset.file ? await asset.file.arrayBuffer() : await new ExpoFile(asset.uri).arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            const parsed: SheetData[] = [];
            for (const name of workbook.SheetNames) {
                const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false });
                const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
                if (headerIndex < 0) continue;
                const headers = matrix[headerIndex].map((cell, index) => String(cell ?? '').trim() || `Columna ${index + 1}`);
                const rows = matrix.slice(headerIndex + 1).map((row, offset) => ({ row: headerIndex + offset + 2, values: headers.map((_, index) => String(row[index] ?? '').trim()) }))
                    .filter((row) => row.values.some(Boolean));
                if (rows.length) parsed.push({ name, headers, rows });
            }
            if (!parsed.length) {
                Alert.alert('Archivo vacío', 'No se encontraron filas con datos en el archivo.');
                return;
            }
            if (parsed.reduce((total, sheet) => total + sheet.rows.length, 0) > 2000) {
                Alert.alert('Archivo muy grande', 'La importación admite hasta 2,000 filas de asignación.');
                return;
            }
            setFileName(asset.name);
            setSheets(parsed);
            setMappings(Object.fromEntries(parsed.map((sheet) => [sheet.name, autoMap(sheet.headers)])));
            setIncludedSheets(Object.fromEntries(parsed.map((sheet) => [sheet.name, true])));
            setActiveSheet(parsed[0].name);
        } catch {
            Alert.alert('No se pudo leer el archivo', 'Elija un archivo CSV, XLS o XLSX válido e intente de nuevo.');
        } finally {
            setReading(false);
        }
    };

    const openColumnPicker = (field: ImportField) => {
        if (!activeSheetData) return;
        setMappingSheet(activeSheetData.name);
        setPickerField(field);
    };

    const selectColumn = (column: number | null) => {
        if (!pickerField) return;
        setMappings((current) => ({
            ...current,
            [mappingSheet]: { ...(current[mappingSheet] ?? {}), [pickerField]: column },
        }));
        setPickerField(null);
    };

    const handleImport = async () => {
        if (!canImport) return;
        setSaving(true);
        const payload = selectedRows.map((row) => ({
            sheet: row.sheet,
            row: row.row,
            section_id: row.groupId,
            subject_id: row.subjectId,
            tipo_sesion: row.type,
            sesiones_semana: row.sessions,
            duracion_minutos: row.duration,
            requiere_espacio_especializado: row.specialized,
            observacion_espacio: row.note,
            docentes: row.teachers,
            recursos: row.resources,
        }));
        const { data, error } = await supabase.rpc('import_academic_assignment_batch', { p_rows: payload });
        setSaving(false);
        if (error) {
            Alert.alert('Importación cancelada', error.message.length > 240 ? `${error.message.slice(0, 237)}…` : error.message);
            return;
        }
        Alert.alert('Importación completada', `Se aplicaron ${data ?? selectedRows.length} componentes. No se crearon cuentas ni se publicaron horarios.`, [{ text: 'Aceptar', onPress: () => router.back() }]);
    };

    const preview = selectedRows.slice(0, 30);
    const activeMapping = mappings[activeSheet] ?? {};

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Importar asignación académica</Text>
                <Text style={styles.subtitle}>El archivo debe indicar grupos, materias, docentes oficiales, teoría/práctica y sesiones semanales. Las horas contractuales no se usan como sesiones.</Text>
                <Text style={styles.label}>Período</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {periods.map((period) => (
                        <TouchableOpacity key={period.id_periodo} style={[styles.chip, periodId === period.id_periodo && styles.chipActive]} onPress={() => setPeriodId(period.id_periodo)}>
                            <Text style={[styles.chipText, periodId === period.id_periodo && styles.chipTextActive]}>{period.nombre} {period.ano_lectivo}{period.es_activo ? ' · activo' : ''}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.fileButton} onPress={() => void chooseFile()} disabled={reading || saving}>
                    {reading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.fileButtonText}>{fileName || 'Seleccionar archivo CSV o Excel'}</Text>}
                </TouchableOpacity>
                {sheets.length ? <>
                    <Text style={styles.sectionTitle}>Hojas incluidas</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        {sheets.map((sheet) => (
                            <TouchableOpacity key={sheet.name} style={[styles.chip, activeSheet === sheet.name && styles.chipActive]} onPress={() => setActiveSheet(sheet.name)}>
                                <Text style={[styles.chipText, activeSheet === sheet.name && styles.chipTextActive]}>{sheet.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {activeSheetData ? <>
                        <View style={styles.sheetToggle}>
                            <Text style={styles.sheetTitle}>Importar {activeSheetData.name}</Text>
                            <Switch value={Boolean(includedSheets[activeSheetData.name])} onValueChange={(value) => setIncludedSheets((current) => ({ ...current, [activeSheetData.name]: value }))} />
                        </View>
                        <Text style={styles.sectionTitle}>Asignación de columnas</Text>
                        {fields.map((field) => {
                            const column = activeMapping[field.key];
                            return (
                                <TouchableOpacity key={field.key} style={styles.mappingRow} onPress={() => openColumnPicker(field.key)}>
                                    <View style={styles.mappingCopy}>
                                        <Text style={styles.label}>{field.label}{field.required ? ' · requerida' : ''}</Text>
                                        <Text style={styles.mappingValue}>{typeof column === 'number' ? activeSheetData.headers[column] : 'Sin asignar'}</Text>
                                    </View>
                                    <Text style={styles.arrow}>›</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </> : null}
                    <Text style={styles.sectionTitle}>Vista previa · {errorCountLabel(selectedRows)}</Text>
                    <Text style={styles.previewNote}>Se muestran hasta 30 filas. La confirmación guarda todos los cambios juntos; si una fila falla, no se aplica ninguna.</Text>
                    {preview.map((row) => (
                        <View key={`${row.sheet}-${row.row}`} style={[styles.previewCard, row.errors.length ? styles.previewError : styles.previewValid]}>
                            <Text style={styles.previewTitle}>{row.sheet}, fila {row.row}</Text>
                            {row.errors.length ? row.errors.map((error, index) => <Text key={index} style={styles.errorText}>• {error}</Text>) : <Text style={styles.validText}>{row.type} · {row.sessions} sesiones/semana · {row.duration} min · {row.teachers.length} docente(s)</Text>}
                        </View>
                    ))}
                    {selectedRows.length > 30 ? <Text style={styles.previewNote}>Hay {selectedRows.length - 30} filas adicionales, incluidas en la validación y confirmación.</Text> : null}
                </> : null}
            </ScrollView>
            {sheets.length ? <View style={styles.footer}>
                <TouchableOpacity style={[styles.confirmButton, !canImport && styles.disabledButton]} onPress={() => void handleImport()} disabled={!canImport}>
                    {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.confirmText}>Confirmar importación ({selectedRows.length})</Text>}
                </TouchableOpacity>
            </View> : null}
            <Modal visible={Boolean(pickerField)} transparent animationType="fade" onRequestClose={() => setPickerField(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.selectorCard}>
                        <Text style={styles.sectionTitle}>Columna: {fields.find((field) => field.key === pickerField)?.label}</Text>
                        <FlatList
                            data={[{ id: null, label: 'Sin asignar' }, ...(sheets.find((sheet) => sheet.name === mappingSheet)?.headers ?? []).map((label, id) => ({ id, label }))] as Option[]}
                            keyExtractor={(item, index) => `${item.id ?? 'none'}-${index}`}
                            renderItem={({ item }) => <TouchableOpacity style={styles.optionButton} onPress={() => selectColumn(item.id)}><Text style={styles.optionText}>{item.label}</Text></TouchableOpacity>}
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function errorCountLabel(rows: PreviewRow[]) {
    const count = rows.reduce((total, row) => total + row.errors.length, 0);
    return count ? `${count} error(es)` : `${rows.length} registro(s) listos`;
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    page: { padding: Spacing.lg, paddingBottom: 120 },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    label: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginBottom: Spacing.xs },
    chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
    chip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    chipTextActive: { color: Colors.white, fontWeight: '700' },
    fileButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, justifyContent: 'center', marginTop: Spacing.md, minHeight: 48, paddingHorizontal: Spacing.md },
    fileButtonText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700', textAlign: 'center' },
    sectionTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginTop: Spacing.lg },
    sheetToggle: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.md, flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md, padding: Spacing.md },
    sheetTitle: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm, fontWeight: '600' },
    mappingRow: { alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 60, paddingHorizontal: Spacing.md },
    mappingCopy: { flex: 1 },
    mappingValue: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    arrow: { color: Colors.textTertiary, fontSize: Typography.sizes.xxl, paddingLeft: Spacing.md },
    previewNote: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
    previewCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, borderLeftWidth: 4, marginTop: Spacing.sm, padding: Spacing.md },
    previewError: { borderLeftColor: Colors.error },
    previewValid: { borderLeftColor: Colors.success },
    previewTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    errorText: { color: Colors.error, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: 4 },
    validText: { color: Colors.success, fontSize: Typography.sizes.xs, marginTop: 4 },
    footer: { backgroundColor: Colors.white, borderTopColor: Colors.border, borderTopWidth: 1, padding: Spacing.md },
    confirmButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, justifyContent: 'center', minHeight: 48, paddingHorizontal: Spacing.md },
    disabledButton: { opacity: 0.45 },
    confirmText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    selectorCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '78%', padding: Spacing.xl },
    optionButton: { borderBottomColor: Colors.border, borderBottomWidth: 1, paddingVertical: Spacing.md },
    optionText: { color: Colors.textPrimary, fontSize: Typography.sizes.sm },
});

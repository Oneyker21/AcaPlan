import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { DiaSemana } from '@/types/database';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Period = { id_periodo: number; nombre: string; ano_lectivo: number };
type Version = { id_version_horario: number; id_periodo: number; numero_version: number; estado: string; estado_validacion: string };
type Section = { id_seccion: number; codigo: string; id_carrera: number; turno: string; carreras?: { id_carrera: number; nombre: string } | null };
type ScheduleRow = {
    id_horario: number;
    dia_snapshot: DiaSemana | null;
    hora_inicio_snapshot: string | null;
    hora_fin_snapshot: string | null;
    secciones?: Section | null;
    asignaturas?: { codigo: string; nombre: string } | null;
    aulas?: { codigo: string; pabellones?: { nombre: string; sede: string } | null } | null;
};
type TeacherLink = { id_horario: number; id_docente: number; nombre: string };
type ScheduleView = 'dia' | 'semana';

const DAYS: DiaSemana[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const time = (value?: string | null) => value ? value.slice(0, 5) : '—';
const displayState = (state: string) => state === 'compartido' ? 'Propuesta compartida' : state === 'publicado' ? 'Horario oficial' : state;

export default function SharedSchedulesScreen() {
    const { role } = useAuth();
    const [periods, setPeriods] = useState<Period[]>([]);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [versions, setVersions] = useState<Version[]>([]);
    const [versionId, setVersionId] = useState<number | null>(null);
    const [rows, setRows] = useState<ScheduleRow[]>([]);
    const [teacherLinks, setTeacherLinks] = useState<TeacherLink[]>([]);
    const [careerId, setCareerId] = useState<number | null>(null);
    const [groupId, setGroupId] = useState<number | null>(null);
    const [teacherId, setTeacherId] = useState<number | null>(null);
    const [shift, setShift] = useState('todos');
    const [day, setDay] = useState<DiaSemana | 'todos'>('todos');
    const [view, setView] = useState<ScheduleView>('semana');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [reviewVisible, setReviewVisible] = useState(false);
    const [reviewNote, setReviewNote] = useState('');
    const [reviewBusy, setReviewBusy] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);

    const loadPeriods = useCallback(async () => {
        const { data, error } = await supabase.from('periodos')
            .select('id_periodo, nombre, ano_lectivo').order('ano_lectivo', { ascending: false });
        if (error) throw error;
        const list = (data ?? []) as Period[];
        setPeriods(list);
        setPeriodId((current) => current ?? list[0]?.id_periodo ?? null);
    }, []);

    // La consulta presenta versiones compartidas o publicadas del período seleccionado.
    const loadVersions = useCallback(async () => {
        if (!periodId) { setVersions([]); setVersionId(null); return; }
        const { data, error } = await supabase.from('versiones_horario')
            .select('id_version_horario, id_periodo, numero_version, estado, estado_validacion')
            .eq('id_periodo', periodId).in('estado', ['compartido', 'publicado'])
            .order('numero_version', { ascending: false });
        if (error) throw error;
        const list = (data ?? []) as Version[];
        setVersions(list);
        setVersionId((current) => list.some((version) => version.id_version_horario === current)
            ? current : list[0]?.id_version_horario ?? null);
    }, [periodId]);

    const loadSchedule = useCallback(async () => {
        if (!versionId) { setRows([]); setTeacherLinks([]); return; }
        const [scheduleResult, teacherResult] = await Promise.all([
            supabase.from('horarios').select(`
                id_horario, dia_snapshot, hora_inicio_snapshot, hora_fin_snapshot,
                secciones(id_seccion, codigo, id_carrera, turno, carreras(id_carrera, nombre)),
                asignaturas(codigo, nombre), aulas(codigo, pabellones(nombre, sede))
            `).eq('id_version_horario', versionId),
            supabase.rpc('list_schedule_version_teacher_links', { p_version_id: versionId }),
        ]);
        if (scheduleResult.error) throw scheduleResult.error;
        if (teacherResult.error) throw teacherResult.error;
        setRows((scheduleResult.data ?? []) as unknown as ScheduleRow[]);
        setTeacherLinks((teacherResult.data ?? []) as TeacherLink[]);
    }, [versionId]);

    const reload = useCallback(async () => {
        setErrorMessage(null);
        try {
            await loadPeriods();
            await loadVersions();
            await loadSchedule();
        } catch {
            setErrorMessage('No se pudo actualizar la consulta. Compruebe su conexión, sus permisos o la configuración de Sprint 5.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [loadPeriods, loadSchedule, loadVersions]);

    useEffect(() => { void reload(); }, [reload]);

    const selectedVersion = versions.find((version) => version.id_version_horario === versionId) ?? null;
    const careerOptions = useMemo(() => {
        const values = new Map<number, string>();
        rows.forEach((row) => { if (row.secciones?.carreras) values.set(row.secciones.carreras.id_carrera, row.secciones.carreras.nombre); });
        return [...values].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);
    const groupOptions = useMemo(() => rows.map((row) => row.secciones).filter((section): section is Section => Boolean(section)
        && (careerId === null || section?.id_carrera === careerId))
        .filter((section, index, all) => all.findIndex((item) => item?.id_seccion === section?.id_seccion) === index)
        .sort((a, b) => a.codigo.localeCompare(b.codigo)), [careerId, rows]);
    // Las opciones de docentes se limitan a las clases de la carrera y el grupo elegidos.
    const teacherOptions = useMemo(() => {
        const ids = new Set(rows.filter((row) => groupId === null || row.secciones?.id_seccion === groupId)
            .filter((row) => careerId === null || row.secciones?.id_carrera === careerId)
            .flatMap((row) => teacherLinks.filter((teacher) => teacher.id_horario === row.id_horario))
            .map((teacher) => teacher.id_docente));
        return [...new Map(teacherLinks.filter((teacher) => ids.has(teacher.id_docente))
            .map((teacher) => [teacher.id_docente, teacher.nombre])).entries()]
            .sort((a, b) => a[1].localeCompare(b[1]));
    }, [careerId, groupId, rows, teacherLinks]);
    // Combina los filtros de la pantalla y ordena las clases por día y hora.
    const filteredRows = useMemo(() => rows.filter((row) => {
        const rowTeachers = teacherLinks.filter((teacher) => teacher.id_horario === row.id_horario);
        const haystack = `${row.secciones?.codigo ?? ''} ${row.secciones?.carreras?.nombre ?? ''} ${row.asignaturas?.codigo ?? ''} ${row.asignaturas?.nombre ?? ''} ${row.aulas?.codigo ?? ''}`.toLocaleLowerCase();
        return (careerId === null || row.secciones?.id_carrera === careerId)
            && (groupId === null || row.secciones?.id_seccion === groupId)
            && (teacherId === null || rowTeachers.some((teacher) => teacher.id_docente === teacherId))
            && (shift === 'todos' || row.secciones?.turno === shift)
            && (day === 'todos' || row.dia_snapshot === day)
            && (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase()));
    }).sort((left, right) => DAYS.indexOf(left.dia_snapshot ?? 'Lunes') - DAYS.indexOf(right.dia_snapshot ?? 'Lunes')
        || String(left.hora_inicio_snapshot ?? '').localeCompare(String(right.hora_inicio_snapshot ?? ''))),
    [careerId, day, groupId, rows, search, shift, teacherId, teacherLinks]);

    // La decisión se registra sobre la versión compartida mediante una función de Supabase.
    const decide = async (approved: boolean) => {
        if (!versionId || !selectedVersion || selectedVersion.estado !== 'compartido' || reviewBusy) return;
        setReviewBusy(true);
        const { error } = await supabase.rpc('decide_schedule_version', {
            p_version_id: versionId, p_approved: approved, p_note: reviewNote.trim(),
        });
        setReviewBusy(false);
        setReviewVisible(false);
        if (error) {
            Alert.alert('No se registró la decisión', 'La propuesta pudo quedar obsoleta; actualice la lista y revise su validación antes de intentarlo de nuevo.');
            return;
        }
        setReviewNote('');
        await reload();
        Alert.alert(approved ? 'Propuesta aprobada' : 'Propuesta devuelta', approved
            ? 'La versión quedó aprobada, pero todavía no se ha publicado como horario oficial.'
            : 'La versión regresó a Planificación para que pueda corregirse.');
    };

    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character] ?? character));

    const exportPdf = async () => {
        if (!versionId || !selectedVersion || exportBusy || filteredRows.length === 0) return;
        setExportBusy(true);
        try {
            const period = periods.find((entry) => entry.id_periodo === periodId);
            const careerLabel = careerId === null ? 'Todas' : careerOptions.find(([id]) => id === careerId)?.[1] ?? 'Seleccionada';
            const groupLabel = groupId === null ? 'Todos' : groupOptions.find((entry) => entry.id_seccion === groupId)?.codigo ?? 'Seleccionado';
            const teacherLabel = teacherId === null ? 'Todos' : teacherOptions.find(([id]) => id === teacherId)?.[1] ?? 'Seleccionado';
            const exportedAt = new Date().toLocaleString();
            const rowsHtml = filteredRows.map((item) => {
                const teachers = teacherLinks.filter((entry) => entry.id_horario === item.id_horario).map((entry) => entry.nombre).join(', ') || '—';
                return `<tr><td>${escapeHtml(item.dia_snapshot ?? '—')}</td><td>${time(item.hora_inicio_snapshot)}–${time(item.hora_fin_snapshot)}</td><td>${escapeHtml(item.secciones?.carreras?.nombre ?? '—')}</td><td>${escapeHtml(item.secciones?.codigo ?? '—')}</td><td>${escapeHtml(item.asignaturas?.codigo ?? '—')} · ${escapeHtml(item.asignaturas?.nombre ?? '—')}</td><td>${escapeHtml(teachers)}</td><td>${escapeHtml(item.secciones?.turno ?? '—')}</td><td>${escapeHtml(item.aulas?.codigo ?? '—')}</td><td>${escapeHtml(item.aulas?.pabellones?.sede ?? '—')}</td></tr>`;
            }).join('');
            const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
                @page{size:landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#1f2937;font-size:10px}h1{color:#164b78;font-size:22px;margin:0 0 5px}.meta{color:#475569;line-height:1.6;margin-bottom:14px}.tag{display:inline-block;border:1px solid #94a3b8;border-radius:12px;padding:3px 8px;margin-bottom:8px}table{border-collapse:collapse;width:100%}th{background:#164b78;color:white;text-align:left}td,th{border:1px solid #cbd5e1;padding:6px;vertical-align:top}tr:nth-child(even){background:#f1f5f9}.footer{margin-top:12px;color:#64748b;font-size:9px}
            </style></head><body><span class="tag">${escapeHtml(displayState(selectedVersion.estado))} · V${selectedVersion.numero_version}</span><h1>AcaPlan · Horario académico</h1><div class="meta">Período: ${escapeHtml(period ? `${period.nombre} ${period.ano_lectivo}` : '—')}<br>Validación: ${escapeHtml(selectedVersion.estado_validacion)}<br>Carrera: ${escapeHtml(careerLabel)} · Grupo: ${escapeHtml(groupLabel)} · Docente: ${escapeHtml(teacherLabel)} · Turno: ${escapeHtml(shift)}<br>Vista: ${escapeHtml(view === 'dia' ? `Día · ${day}` : 'Semana')} · Exportado: ${escapeHtml(exportedAt)}</div><table><thead><tr><th>Día</th><th>Hora</th><th>Carrera</th><th>Grupo</th><th>Asignatura</th><th>Docentes</th><th>Turno</th><th>Aula</th><th>Sede</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="footer">Documento de consulta emitido desde AcaPlan. Estado de esta versión: ${escapeHtml(displayState(selectedVersion.estado))}.</div></body></html>`;
            if (Platform.OS === 'web') {
                await Print.printAsync({ html });
            } else {
                const file = await Print.printToFileAsync({ html });
                if (!(await Sharing.isAvailableAsync())) {
                    Alert.alert('PDF creado', 'El archivo quedó en los documentos temporales de la aplicación, pero este dispositivo no ofrece el menú para compartir.');
                    return;
                }
                await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Compartir horario PDF' });
            }
            const { error } = await supabase.rpc('log_schedule_export', {
                p_version_id: versionId,
                p_filter: { carrera: careerLabel, grupo: groupLabel, docente: teacherLabel, turno: shift, vista: view, dia: day, busqueda: search.trim() },
                p_row_count: filteredRows.length,
            });
            if (error) Alert.alert('PDF compartido', 'La exportación se completó, pero no se pudo guardar el registro de auditoría.');
        } catch {
            Alert.alert('No se exportó el PDF', 'Vuelva a intentarlo cuando la versión y el dispositivo estén disponibles.');
        } finally {
            setExportBusy(false);
        }
    };

    const mayReview = role === 'administrador' || role === 'planificacion' || role === 'coordinacion';
    const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    const renderItem = ({ item }: { item: ScheduleRow }) => {
        const instructors = teacherLinks.filter((teacher) => teacher.id_horario === item.id_horario).map((teacher) => teacher.nombre);
        return <View style={styles.classCard}>
            <View style={styles.classTop}><Text style={styles.classTime}>{item.dia_snapshot ?? 'Día pendiente'} · {time(item.hora_inicio_snapshot)}–{time(item.hora_fin_snapshot)}</Text>
                <Text style={styles.shiftBadge}>{item.secciones?.turno ?? 'Turno'}</Text></View>
            <Text style={styles.subject}>{item.asignaturas?.nombre ?? 'Asignatura'}</Text>
            <Text style={styles.detail}>{item.asignaturas?.codigo ?? '—'} · Grupo {item.secciones?.codigo ?? 'no disponible'}</Text>
            <Text style={styles.detail}>{item.secciones?.carreras?.nombre ?? 'Carrera no disponible'} · {item.aulas?.codigo ? `Aula ${item.aulas.codigo}` : 'Espacio no disponible'}</Text>
            {item.aulas?.pabellones?.nombre ? <Text style={styles.detail}>{item.aulas.pabellones.nombre} · {item.aulas.pabellones.sede}</Text> : null}
            {instructors.length ? <Text style={styles.teacher}>{instructors.join(' · ')}</Text> : null}
        </View>;
    };

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    return <SafeAreaView style={styles.container} edges={['bottom']}>
        <FlatList
            data={filteredRows}
            keyExtractor={(item) => String(item.id_horario)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void reload(); }} />}
            ListHeaderComponent={<View>
                <Text style={styles.title}>Consulta de horarios</Text>
                <Text style={styles.subtitle}>Consulte versiones compartidas y horarios oficiales. Esta vista es de solo lectura y necesita conexión.</Text>
                {errorMessage ? <View style={styles.errorCard}><Text style={styles.errorText}>{errorMessage}</Text><TouchableOpacity onPress={() => void reload()}><Text style={styles.retry}>Intentar de nuevo</Text></TouchableOpacity></View> : null}
                <Text style={styles.label}>Período</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {periods.map((period) => <Chip key={period.id_periodo} label={`${period.nombre} ${period.ano_lectivo}`} active={periodId === period.id_periodo} onPress={() => { setPeriodId(period.id_periodo); setVersionId(null); setCareerId(null); setGroupId(null); setTeacherId(null); }} />)}
                </ScrollView>
                <Text style={styles.label}>Versión disponible</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {versions.map((version) => <Chip key={version.id_version_horario} label={`V${version.numero_version} · ${displayState(version.estado)}`} active={versionId === version.id_version_horario} onPress={() => { setVersionId(version.id_version_horario); setCareerId(null); setGroupId(null); setTeacherId(null); }} />)}
                </ScrollView>
                {selectedVersion ? <View style={styles.versionCard}>
                    <Text style={styles.versionTitle}>V{selectedVersion.numero_version} · {displayState(selectedVersion.estado)}</Text>
                    <Text style={styles.versionMeta}>Validación: {selectedVersion.estado_validacion === 'con_avisos' ? 'válida con avisos' : selectedVersion.estado_validacion === 'valida' ? 'vigente' : 'requiere revisión'}</Text>
                    <TouchableOpacity style={styles.exportButton} disabled={exportBusy || !filteredRows.length} onPress={() => void exportPdf()}>
                        {exportBusy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.exportText}>Exportar y compartir PDF · {filteredRows.length}</Text>}
                    </TouchableOpacity>
                    {mayReview && selectedVersion.estado === 'compartido' ? <View style={styles.reviewActions}>
                        <TouchableOpacity style={styles.approveButton} onPress={() => setReviewVisible(true)}><Text style={styles.approveText}>Revisar y decidir</Text></TouchableOpacity>
                    </View> : null}
                </View> : null}
                <View style={styles.viewToggle}>
                    <Chip label="Semana" active={view === 'semana'} onPress={() => { setView('semana'); setDay('todos'); }} />
                    <Chip label="Día" active={view === 'dia'} onPress={() => { setView('dia'); if (day === 'todos') setDay('Lunes'); }} />
                </View>
                {view === 'dia' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {DAYS.map((value) => <Chip key={value} label={value} active={day === value} onPress={() => setDay(value)} />)}
                </ScrollView> : null}
                <TextInput value={search} onChangeText={setSearch} placeholder="Buscar grupo, carrera, asignatura o aula" placeholderTextColor={Colors.textTertiary} style={styles.search} accessibilityLabel="Buscar horarios" />
                <Text style={styles.label}>Carrera</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip label="Todas" active={careerId === null} onPress={() => { setCareerId(null); setGroupId(null); setTeacherId(null); }} />
                    {careerOptions.map(([id, name]) => <Chip key={id} label={name} active={careerId === id} onPress={() => { setCareerId(id); setGroupId(null); setTeacherId(null); }} />)}
                </ScrollView>
                <Text style={styles.label}>Grupo</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip label="Todos" active={groupId === null} onPress={() => { setGroupId(null); setTeacherId(null); }} />
                    {groupOptions.map((section) => <Chip key={section.id_seccion} label={section.codigo} active={groupId === section.id_seccion} onPress={() => { setGroupId(section.id_seccion); setTeacherId(null); }} />)}
                </ScrollView>
                <Text style={styles.label}>Docente</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip label="Todos" active={teacherId === null} onPress={() => setTeacherId(null)} />
                    {teacherOptions.map(([id, name]) => <Chip key={id} label={name} active={teacherId === id} onPress={() => setTeacherId(id)} />)}
                </ScrollView>
                <Text style={styles.label}>Turno</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {['todos', 'matutino', 'vespertino', 'nocturno'].map((value) => <Chip key={value} label={value === 'todos' ? 'Todos' : value} active={shift === value} onPress={() => setShift(value)} />)}
                </ScrollView>
                <Text style={styles.count}>{filteredRows.length} clase(s) · {view === 'semana' ? 'vista semanal' : `vista diaria: ${day}`}</Text>
            </View>}
            ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{errorMessage ? 'No se pudo actualizar' : versions.length ? 'Sin clases para estos filtros' : 'No hay versiones disponibles'}</Text><Text style={styles.emptyText}>{versions.length ? 'Cambie los filtros o consulte otra versión.' : 'Las propuestas compartidas y los horarios oficiales aparecerán aquí.'}</Text></View>}
        />
        <Modal visible={reviewVisible} transparent animationType="slide" onRequestClose={() => setReviewVisible(false)}>
            <View style={styles.modalOverlay}><View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Decisión de revisión</Text>
                <Text style={styles.modalCopy}>Aprobar deja la versión lista para una publicación posterior; no la hace oficial. Devolverla la retira de la consulta compartida y la regresa a Planificación.</Text>
                <TextInput value={reviewNote} onChangeText={setReviewNote} placeholder="Nota de revisión (opcional)" placeholderTextColor={Colors.textTertiary} multiline style={styles.noteInput} />
                <TouchableOpacity style={styles.approveButton} disabled={reviewBusy || !['valida', 'con_avisos'].includes(selectedVersion?.estado_validacion ?? '')} onPress={() => void decide(true)}>{reviewBusy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.approveText}>Aprobar propuesta</Text>}</TouchableOpacity>
                <TouchableOpacity style={styles.returnButton} disabled={reviewBusy} onPress={() => void decide(false)}><Text style={styles.returnText}>Devolver a Planificación</Text></TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setReviewVisible(false)}><Text style={styles.cancelText}>Cerrar</Text></TouchableOpacity>
            </View></View>
        </Modal>
    </SafeAreaView>;
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    listContent: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.huge },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    label: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginTop: Spacing.md, textTransform: 'uppercase' },
    chipRow: { gap: Spacing.sm, paddingVertical: Spacing.sm },
    chip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    chipTextActive: { color: Colors.white, fontWeight: '700' },
    versionCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.md, ...Shadows.sm },
    versionTitle: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    versionMeta: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    exportButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.primary, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', marginTop: Spacing.md, minHeight: 44, paddingHorizontal: Spacing.sm },
    exportText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    reviewActions: { marginTop: Spacing.md },
    viewToggle: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    search: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, fontSize: Typography.sizes.sm, minHeight: 46, marginTop: Spacing.md, paddingHorizontal: Spacing.md },
    count: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginVertical: Spacing.md },
    classCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, padding: Spacing.md, ...Shadows.sm },
    classTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    classTime: { color: Colors.primary, flex: 1, fontSize: Typography.sizes.sm, fontWeight: '700' },
    shiftBadge: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, textTransform: 'capitalize' },
    subject: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginTop: Spacing.sm },
    detail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: 3 },
    teacher: { color: Colors.textPrimary, fontSize: Typography.sizes.xs, fontWeight: '600', marginTop: Spacing.sm },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.xl },
    emptyTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    emptyText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs, textAlign: 'center' },
    errorCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, marginTop: Spacing.md, padding: Spacing.md },
    errorText: { color: Colors.error, fontSize: Typography.sizes.sm },
    retry: { color: Colors.primary, fontWeight: '700', marginTop: Spacing.sm },
    approveButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, minHeight: 46, justifyContent: 'center', paddingHorizontal: Spacing.md },
    approveText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', textAlign: 'center' },
    modalCopy: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginVertical: Spacing.md },
    noteInput: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, minHeight: 82, padding: Spacing.md, textAlignVertical: 'top' },
    returnButton: { alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: BorderRadius.md, marginTop: Spacing.sm, minHeight: 44, justifyContent: 'center' },
    returnText: { color: Colors.error, fontSize: Typography.sizes.sm, fontWeight: '700' },
    cancelButton: { alignItems: 'center', marginTop: Spacing.sm, minHeight: 42, justifyContent: 'center' },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
});

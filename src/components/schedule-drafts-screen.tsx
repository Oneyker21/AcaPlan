import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DiaSemana } from '@/types/database';
import { exportScheduleToExcel } from '@/utils/schedule-excel-export';
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
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Period = { id_periodo: number; nombre: string; ano_lectivo: number; es_activo: boolean };
type Version = {
    id_version_horario: number;
    id_periodo: number;
    numero_version: number;
    alcance_turno: string;
    estado: string;
    estado_validacion: string;
    creada_por: number | null;
    fecha_creacion: string;
};
type Group = {
    id_seccion: number; id_periodo: number; id_carrera: number; codigo: string;
    cantidad_estudiantes: number; modalidad: string; turno: string; sede: string;
    carreras?: { nombre: string } | null;
};
type Subject = { id_asignatura: number; codigo: string; nombre: string };
type Assignment = { id_asignacion_academica: number; id_periodo: number; id_seccion: number; id_asignatura: number };
type Component = {
    id_componente: number; id_asignacion_academica: number; tipo_sesion: 'teorica' | 'practica';
    sesiones_semana: number; duracion_minutos: number; requiere_espacio_especializado: boolean; observacion_espacio: string;
    asignacion_componente_docente?: { id_docente: number }[];
    asignacion_componente_recurso?: { id_recurso: number }[];
};
type Room = { id_aula: number; codigo: string; capacidad: number; tipo: string; estado: string; pabellones?: { nombre: string; sede: string } | null };
type Block = { id_bloque: number; dia: DiaSemana; modalidad: string; turno: string; hora_inicio: string; hora_fin: string; es_receso: boolean };
type ScheduleRow = {
    id_horario: number; id_docente: number; id_asignatura: number; id_seccion: number; id_aula: number;
    id_bloque: number; id_componente: number | null; numero_sesion: number | null; es_fijada: boolean; traslado_sabado: boolean;
    dia_snapshot: DiaSemana; hora_inicio_snapshot: string; hora_fin_snapshot: string;
    bloques_clase?: Block | null; secciones?: Group | null; asignaturas?: Subject | null; aulas?: Room | null;
    horario_docente?: { id_docente: number }[];
};
type Candidate = { component: Component; assignment: Assignment; session: number; group: Group; subject: Subject };
type ValidationIssue = { code?: string; severity?: string; message?: string; group?: string; subject?: string; teacher?: string; resource?: string; restriction?: string; day?: string; start?: string; end?: string; gap_minutes?: number; scheduled?: number; expected?: number };
type Validation = { id_version_horario: number; estado: string; errores: number; avisos: number; hallazgos: ValidationIssue[] };
type GenerationResult = { colocadas: number; intentos: number; pendientes: { group: string; subject: string; session: number; reason: string }[]; validacion?: Validation };
type PublishResult = { clases_publicadas: number; estado_validacion: string; version_anterior: number | null };
type ShareRole = 'coordinacion' | 'jefatura' | 'docente';

const DAYS: DiaSemana[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const SHIFT_OPTIONS = [
    { id: 'todos', label: 'Todos los turnos' },
    { id: 'matutino', label: 'Matutino' },
    { id: 'vespertino', label: 'Vespertino' },
    { id: 'nocturno', label: 'Nocturno' },
];

const displayTime = (time?: string | null) => time ? String(time).slice(0, 5) : '—';
const timeToMinutes = (time: string) => {
    const [hours = '0', minutes = '0'] = time.split(':');
    return Number(hours) * 60 + Number(minutes);
};
const labelState = (value: string) => ({
    borrador: 'Privado · borrador', compartido: 'Compartido para consulta', aprobado: 'Aprobado', publicado: 'Oficial', archivado: 'Versión anterior',
    pendiente: 'Pendiente de validar', valida: 'Validación vigente', con_avisos: 'Validada con avisos', invalida: 'Tiene conflictos', obsoleta: 'Requiere revalidación',
} as Record<string, string>)[value] ?? value;

export default function ScheduleDraftsScreen() {
    const [periods, setPeriods] = useState<Period[]>([]);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [versions, setVersions] = useState<Version[]>([]);
    const [versionId, setVersionId] = useState<number | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [components, setComponents] = useState<Component[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [roomResources, setRoomResources] = useState<Record<number, number[]>>({});
    const [subjectResources, setSubjectResources] = useState<Record<number, number[]>>({});
    const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
    const [teacherNames, setTeacherNames] = useState<Record<number, string>>({});
    const [validation, setValidation] = useState<Validation | null>(null);
    const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
    const [shareRoles, setShareRoles] = useState<ShareRole[]>(['coordinacion']);
    const [shift, setShift] = useState('todos');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editVisible, setEditVisible] = useState(false);
    const [candidateVisible, setCandidateVisible] = useState(false);
    const [selection, setSelection] = useState<Candidate | null>(null);
    const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
    const [saturdayTransfer, setSaturdayTransfer] = useState(false);

    const periodRows = useCallback(async () => {
        const { data, error } = await supabase.from('periodos').select('id_periodo, nombre, ano_lectivo, es_activo').order('ano_lectivo', { ascending: false });
        if (error) {
            Alert.alert('No se cargaron los períodos', 'Compruebe la conexión y vuelva a intentarlo.');
            setLoading(false); setRefreshing(false); return;
        }
        const rows = (data ?? []) as Period[];
        setPeriods(rows);
        setPeriodId((current) => current ?? rows.find((period) => period.es_activo)?.id_periodo ?? rows[0]?.id_periodo ?? null);
    }, []);

    useEffect(() => { void periodRows(); }, [periodRows]);

    const fetchPlanningData = useCallback(async () => {
        if (!periodId) {
            setLoading(false); setRefreshing(false); return;
        }
        const [versionResult, groupResult, subjectResult, assignmentResult, componentResult, roomResult, roomResourceResult, subjectResourceResult, blockResult] = await Promise.all([
            supabase.from('versiones_horario').select('id_version_horario, id_periodo, numero_version, alcance_turno, estado, estado_validacion, creada_por, fecha_creacion').eq('id_periodo', periodId).order('numero_version', { ascending: false }),
            supabase.from('secciones').select('id_seccion, id_periodo, id_carrera, codigo, cantidad_estudiantes, modalidad, turno, sede, carreras(nombre)').eq('id_periodo', periodId).order('codigo'),
            supabase.from('asignaturas').select('id_asignatura, codigo, nombre').order('nombre'),
            supabase.from('asignaciones_academicas').select('id_asignacion_academica, id_periodo, id_seccion, id_asignatura').eq('id_periodo', periodId),
            supabase.from('asignacion_componentes').select('id_componente, id_asignacion_academica, tipo_sesion, sesiones_semana, duracion_minutos, requiere_espacio_especializado, observacion_espacio, asignacion_componente_docente(id_docente), asignacion_componente_recurso(id_recurso)'),
            supabase.from('aulas').select('id_aula, codigo, capacidad, tipo, estado, pabellones(nombre, sede)').eq('estado', 'activo').order('codigo'),
            supabase.from('aula_recurso').select('id_aula, id_recurso'),
            supabase.from('asignatura_recurso').select('id_asignatura, id_recurso'),
            supabase.from('bloques_clase').select('id_bloque, dia, modalidad, turno, hora_inicio, hora_fin, es_receso').eq('id_periodo', periodId).order('hora_inicio'),
        ]);
        const errors = [versionResult.error, groupResult.error, subjectResult.error, assignmentResult.error, componentResult.error, roomResult.error, roomResourceResult.error, subjectResourceResult.error, blockResult.error];
        if (errors.some(Boolean)) {
            Alert.alert('No se cargó la planificación', 'Aplique las migraciones de Sprint 3 y Sprint 4, revise los permisos y vuelva a actualizar.');
            setLoading(false); setRefreshing(false); return;
        }
        const versionRows = (versionResult.data ?? []) as Version[];
        setVersions(versionRows);
        setVersionId((current) => versionRows.some((version) => version.id_version_horario === current)
            ? current
            : versionRows[0]?.id_version_horario ?? null);
        const nextGroups = (groupResult.data ?? []) as unknown as Group[];
        setGroups(nextGroups);
        setSubjects((subjectResult.data ?? []) as Subject[]);
        setAssignments((assignmentResult.data ?? []) as Assignment[]);
        setComponents((componentResult.data ?? []) as unknown as Component[]);
        setRooms((roomResult.data ?? []) as unknown as Room[]);
        setBlocks((blockResult.data ?? []) as Block[]);
        const roomResourceMap: Record<number, number[]> = {};
        (roomResourceResult.data ?? []).forEach((item) => { roomResourceMap[item.id_aula] ??= []; roomResourceMap[item.id_aula].push(item.id_recurso); });
        setRoomResources(roomResourceMap);
        const subjectResourceMap: Record<number, number[]> = {};
        (subjectResourceResult.data ?? []).forEach((item) => { subjectResourceMap[item.id_asignatura] ??= []; subjectResourceMap[item.id_asignatura].push(item.id_recurso); });
        setSubjectResources(subjectResourceMap);
        const careers = [...new Set(nextGroups.map((group) => group.id_carrera))];
        const teacherResults = await Promise.all(careers.map((careerId) => supabase.rpc('list_academic_assignment_teachers', { p_career_id: careerId })));
        const names: Record<number, string> = {};
        teacherResults.forEach(({ data }) => (data ?? []).forEach((teacher: { id_docente: number; nombre: string }) => { names[teacher.id_docente] = teacher.nombre; }));
        setTeacherNames(names);
        setLoading(false); setRefreshing(false);
    }, [periodId]);

    useEffect(() => { void fetchPlanningData(); }, [fetchPlanningData]);

    const fetchVersionSchedule = useCallback(async () => {
        if (!versionId) {
            setScheduleRows([]); setValidation(null); return;
        }
        const [scheduleResult, validationResult] = await Promise.all([
            supabase.from('horarios').select('id_horario, id_docente, id_asignatura, id_seccion, id_aula, id_bloque, id_componente, numero_sesion, es_fijada, traslado_sabado, dia_snapshot, hora_inicio_snapshot, hora_fin_snapshot, bloques_clase(id_bloque, dia, modalidad, turno, hora_inicio, hora_fin, es_receso), secciones(id_seccion, id_periodo, id_carrera, codigo, cantidad_estudiantes, modalidad, turno, sede, carreras(nombre)), asignaturas(id_asignatura, codigo, nombre), aulas(id_aula, codigo, capacidad, tipo, estado, pabellones(nombre, sede)), horario_docente(id_docente)').eq('id_version_horario', versionId),
            supabase.from('validaciones_horario').select('id_version_horario, estado, cantidad_errores, cantidad_avisos, hallazgos, fecha_validacion').eq('id_version_horario', versionId).order('fecha_validacion', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (scheduleResult.error || validationResult.error) {
            Alert.alert('No se pudo cargar la versión', 'Actualice la pantalla y vuelva a intentarlo.'); return;
        }
        setScheduleRows((scheduleResult.data ?? []) as unknown as ScheduleRow[]);
        const saved = validationResult.data as unknown as { estado: string; cantidad_errores: number; cantidad_avisos: number; hallazgos: ValidationIssue[] } | null;
        setValidation(saved ? { id_version_horario: versionId, estado: saved.estado, errores: saved.cantidad_errores, avisos: saved.cantidad_avisos, hallazgos: saved.hallazgos ?? [] } : null);
    }, [versionId]);

    useEffect(() => { void fetchVersionSchedule(); }, [fetchVersionSchedule]);

    const selectedVersion = versions.find((version) => version.id_version_horario === versionId) ?? null;
    const assignmentMap = useMemo(() => new Map(assignments.map((assignment) => [assignment.id_asignacion_academica, assignment])), [assignments]);
    const groupsMap = useMemo(() => new Map(groups.map((group) => [group.id_seccion, group])), [groups]);
    const subjectsMap = useMemo(() => new Map(subjects.map((subject) => [subject.id_asignatura, subject])), [subjects]);
    const componentsForPeriod = useMemo(() => components.filter((component) => {
        const assignment = assignmentMap.get(component.id_asignacion_academica);
        return assignment?.id_periodo === periodId;
    }), [assignmentMap, components, periodId]);
    const visibleRows = scheduleRows.filter((row) => shift === 'todos' || row.secciones?.turno === shift).sort((left, right) => {
        const dayOrder = DAYS.indexOf(left.dia_snapshot ?? left.bloques_clase?.dia ?? 'Lunes') - DAYS.indexOf(right.dia_snapshot ?? right.bloques_clase?.dia ?? 'Lunes');
        return dayOrder || String(left.hora_inicio_snapshot ?? left.bloques_clase?.hora_inicio ?? '').localeCompare(String(right.hora_inicio_snapshot ?? right.bloques_clase?.hora_inicio ?? ''));
    });
    const candidates: Candidate[] = useMemo(() => componentsForPeriod.flatMap((component) => {
        const assignment = assignmentMap.get(component.id_asignacion_academica);
        const group = assignment ? groupsMap.get(assignment.id_seccion) : undefined;
        const subject = assignment ? subjectsMap.get(assignment.id_asignatura) : undefined;
        if (!assignment || !group || !subject || (shift !== 'todos' && group.turno !== shift)) return [];
        return Array.from({ length: component.sesiones_semana }, (_, index) => index + 1)
            .filter((session) => !scheduleRows.some((row) => row.id_componente === component.id_componente && row.numero_sesion === session))
            .map((session) => ({ component, assignment, session, group, subject }));
    }), [assignmentMap, componentsForPeriod, groupsMap, scheduleRows, shift, subjectsMap]);

    const roomOptions = selection ? rooms.filter((room) => {
        const needs = [...(selection.component.asignacion_componente_recurso ?? []).map((item) => item.id_recurso), ...(subjectResources[selection.subject.id_asignatura] ?? [])];
        const resourcesPresent = needs.every((resourceId) => (roomResources[room.id_aula] ?? []).includes(resourceId));
        const hasSite = !selection.group.sede || room.pabellones?.sede?.trim().toLocaleLowerCase() === selection.group.sede.trim().toLocaleLowerCase();
        return room.capacidad >= selection.group.cantidad_estudiantes && resourcesPresent && hasSite;
    }).sort((a, b) => a.codigo.localeCompare(b.codigo)) : [];
    const blockOptions = selection ? blocks.filter((block) =>
        block.modalidad === selection.group.modalidad
        && block.turno === selection.group.turno
        && !block.es_receso
        && timeToMinutes(block.hora_fin) - timeToMinutes(block.hora_inicio) === selection.component.duracion_minutos
    ).sort((a, b) => DAYS.indexOf(a.dia) - DAYS.indexOf(b.dia) || a.hora_inicio.localeCompare(b.hora_inicio)) : [];

    const reload = async () => { await fetchPlanningData(); await fetchVersionSchedule(); };
    const onRefresh = () => { setRefreshing(true); void reload().finally(() => setRefreshing(false)); };

    const createDraft = async () => {
        if (!periodId || busy) return;
        setBusy(true);
        const { data, error } = await supabase.rpc('create_schedule_draft', {
            p_period_id: periodId,
            p_base_version_id: versionId ?? versions[0]?.id_version_horario ?? null,
        });
        setBusy(false);
        if (error) {
            Alert.alert('No se creó el borrador', error.message.includes('draft') ? 'Cierre o seleccione el borrador que ya está en curso antes de crear otro.' : 'Compruebe que Sprint 4 esté aplicado y que su cuenta pueda planificar.');
            return;
        }
        await fetchPlanningData();
        setVersionId(Number(data));
        Alert.alert('Borrador creado', 'La versión anterior se conservó y las clases fijadas se copiaron.');
    };

    const validateVersion = async () => {
        if (!versionId || busy) return;
        setBusy(true);
        const { data, error } = await supabase.rpc('validate_schedule_version', { p_version_id: versionId });
        setBusy(false);
        if (error) {
            Alert.alert('No se pudo validar', 'Actualice la pantalla y compruebe que el borrador siga disponible.'); return;
        }
        const result = data as unknown as Validation;
        setValidation(result);
        await fetchPlanningData();
        Alert.alert(result.errores ? 'Hay conflictos que corregir' : result.avisos ? 'Validado con avisos' : 'Borrador válido', `${result.errores} conflicto(s) · ${result.avisos} aviso(s). El resultado completo aparece debajo del horario.`);
    };

    const generateProposal = () => {
        if (!versionId || busy) return;
        Alert.alert('Completar propuesta', 'Se buscarán bloques y espacios compatibles para las sesiones pendientes. Las clases ya ubicadas, incluidas las fijadas, se conservarán. El resultado seguirá como borrador.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Generar propuesta', onPress: () => void (async () => {
                setBusy(true);
                setGenerationResult(null);
                const { data, error } = await supabase.rpc('generate_schedule_draft', { p_version_id: versionId, p_max_attempts: 2000 });
                setBusy(false);
                if (error) {
                    Alert.alert('No se generó la propuesta', 'Compruebe que Sprint 5 esté aplicado y que la versión siga siendo un borrador vigente.');
                    return;
                }
                const result = data as unknown as GenerationResult;
                setGenerationResult(result);
                setValidation(result.validacion ?? null);
                await fetchPlanningData();
                await fetchVersionSchedule();
                Alert.alert('Propuesta generada', `${result.colocadas} sesión(es) nuevas · ${result.pendientes?.length ?? 0} pendiente(s). Revise los hallazgos antes de compartirla.`);
            })() },
        ]);
    };

    const shareProposal = async () => {
        if (!versionId || !shareRoles.length || busy) return;
        setBusy(true);
        const { error } = await supabase.rpc('share_schedule_version', { p_version_id: versionId, p_roles: shareRoles });
        setBusy(false);
        if (error) {
            Alert.alert('No se compartió la propuesta', 'Vuelva a validar que siga vigente y que no tenga conflictos antes de compartirla.');
            return;
        }
        await fetchPlanningData();
        Alert.alert('Propuesta compartida', 'Los perfiles seleccionados pueden consultar esta versión. Todavía no es un horario oficial.');
    };

    const publishVersion = () => {
        if (!versionId || busy || selectedVersion?.estado !== 'aprobado') return;
        Alert.alert('Publicar horario del período', 'El sistema volverá a revisar la versión aprobada. Si está completa y no tiene conflictos, quedará como horario oficial de todo el período y reemplazará la versión oficial anterior.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Publicar horario oficial', onPress: () => void (async () => {
                setBusy(true);
                const { data, error } = await supabase.rpc('publish_schedule_version', { p_version_id: versionId });
                setBusy(false);
                if (error) {
                    Alert.alert('No se publicó el horario', 'La propuesta pudo quedar obsoleta o tener conflictos. Actualice, vuelva a validar y corrija los hallazgos.');
                    await reload();
                    return;
                }
                const result = data as unknown as PublishResult;
                await fetchPlanningData();
                await fetchVersionSchedule();
                Alert.alert('Horario oficial publicado', `${result.clases_publicadas} clase(s) · validación: ${result.estado_validacion === 'con_avisos' ? 'vigente con avisos' : 'vigente'}. La versión anterior quedó conservada en el historial.`);
            })() },
        ]);
    };

    const openSession = (candidate: Candidate, existing?: ScheduleRow) => {
        setSelection(candidate);
        setSelectedBlock(existing?.id_bloque ?? null);
        setSelectedRoom(existing?.id_aula ?? null);
        setSaturdayTransfer(existing?.traslado_sabado ?? false);
        setEditVisible(true);
    };

    const openExisting = (row: ScheduleRow) => {
        if (!row.id_componente || !row.numero_sesion) {
            Alert.alert('Clase histórica', 'Esta clase no está vinculada a una asignación del Sprint 3. No se modifica aquí; primero complete y enlace la asignación oficial.'); return;
        }
        const component = components.find((item) => item.id_componente === row.id_componente);
        const assignment = component ? assignmentMap.get(component.id_asignacion_academica) : undefined;
        const group = assignment ? groupsMap.get(assignment.id_seccion) : undefined;
        const subject = assignment ? subjectsMap.get(assignment.id_asignatura) : undefined;
        if (!component || !assignment || !group || !subject) {
            Alert.alert('Asignación no disponible', 'Actualice la asignación académica del Sprint 3 antes de editar esta clase.'); return;
        }
        openSession({ component, assignment, session: row.numero_sesion, group, subject }, row);
    };

    const saveSession = async () => {
        if (!selection || !versionId || !selectedBlock || !selectedRoom || busy) {
            Alert.alert('Falta información', 'Seleccione un bloque y un espacio compatibles antes de guardar.'); return;
        }
        const existing = scheduleRows.find((row) => row.id_componente === selection.component.id_componente && row.numero_sesion === selection.session);
        const movedFixed = Boolean(existing?.es_fijada && (existing.id_bloque !== selectedBlock || existing.id_aula !== selectedRoom));
        const commit = async (confirmed: boolean) => {
            setBusy(true);
            const { error } = await supabase.rpc('save_schedule_session', {
                p_version_id: versionId,
                p_component_id: selection.component.id_componente,
                p_session_number: selection.session,
                p_block_id: selectedBlock,
                p_room_id: selectedRoom,
                p_is_saturday_transfer: saturdayTransfer,
                p_confirm_fixed_move: confirmed,
                p_reason: confirmed ? 'Movimiento autorizado explícitamente por Planificación en la app móvil.' : null,
            });
            setBusy(false);
            if (error) {
                const message = error.message.includes('restriction') ? 'El horario incumple una restricción autorizada.'
                    : error.message.includes('during this time') ? 'Un docente, grupo o espacio ya tiene una clase en ese intervalo.'
                        : error.message.includes('capacity') ? 'La capacidad del espacio no alcanza para el grupo.'
                            : 'No se pudo guardar. La versión puede haber cambiado en otro dispositivo; actualice e inténtelo de nuevo.';
                Alert.alert('No se guardó la clase', message); return;
            }
            setEditVisible(false); setSelection(null);
            await fetchVersionSchedule();
            await fetchPlanningData();
        };
        if (movedFixed) {
            Alert.alert('Mover clase fijada', 'La clase cambiará de día, hora o espacio. Se registrará la autorización; las restricciones académicas seguirán vigentes.', [
                { text: 'Conservar ubicación', style: 'cancel' },
                { text: 'Autorizar movimiento', style: 'destructive', onPress: () => void commit(true) },
            ]);
        } else {
            await commit(false);
        }
    };

    const toggleFixed = async (row: ScheduleRow) => {
        if (busy) return;
        setBusy(true);
        const { error } = await supabase.rpc('set_schedule_item_fixed', { p_schedule_id: row.id_horario, p_fixed: !row.es_fijada });
        setBusy(false);
        if (error) { Alert.alert('No se cambió la clase fijada', 'La versión puede no ser un borrador vigente. Actualice la pantalla.'); return; }
        await fetchVersionSchedule();
    };

    const removeSession = (row: ScheduleRow) => {
        if (busy) return;
        const commit = async (confirmed: boolean) => {
            setBusy(true);
            const { error } = await supabase.rpc('remove_schedule_session', {
                p_schedule_id: row.id_horario,
                p_confirm_fixed: confirmed,
                p_reason: confirmed ? 'Retiro autorizado explícitamente por Planificación en la app móvil.' : null,
            });
            setBusy(false);
            if (error) { Alert.alert('No se retiró la sesión', 'Actualice el borrador y vuelva a intentarlo.'); return; }
            await fetchVersionSchedule();
        };
        if (row.es_fijada) {
            Alert.alert('Retirar clase fijada', 'Debe autorizar expresamente el retiro. La clase no se moverá ni eliminará si cancela.', [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Autorizar retiro', style: 'destructive', onPress: () => void commit(true) },
            ]);
        } else {
            Alert.alert('Retirar sesión', 'La sesión volverá a aparecer entre las asignaciones sin ubicar.', [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Retirar', style: 'destructive', onPress: () => void commit(false) },
            ]);
        }
    };

    const renderScheduleRow = ({ item }: { item: ScheduleRow }) => {
        const teacherIds = [...new Set([item.id_docente, ...(item.horario_docente ?? []).map((teacher) => teacher.id_docente)])];
        const teacherLabel = teacherIds.map((id) => teacherNames[id] ?? `Docente ${id}`).join(', ');
        const versionEditable = selectedVersion?.estado === 'borrador';
        return <View style={styles.classCard}>
            <View style={styles.classTop}>
                <Text style={styles.classTitle}>{item.secciones?.codigo ?? 'Grupo'} · {item.asignaturas?.codigo ?? ''} {item.asignaturas?.nombre ?? ''}</Text>
                <Text style={[styles.fixedTag, item.es_fijada ? styles.fixedOn : styles.fixedOff]}>{item.es_fijada ? 'Fijada' : 'Libre'}</Text>
            </View>
            <Text style={styles.classDetail}>{item.dia_snapshot ?? item.bloques_clase?.dia} · {displayTime(item.hora_inicio_snapshot ?? item.bloques_clase?.hora_inicio)}–{displayTime(item.hora_fin_snapshot ?? item.bloques_clase?.hora_fin)} · {item.secciones?.turno}</Text>
            <Text style={styles.classDetail}>{item.aulas?.codigo ?? 'Espacio'} · {item.aulas?.pabellones?.sede ?? item.secciones?.sede ?? 'Sede sin datos'} · capacidad {item.aulas?.capacidad ?? '—'}</Text>
            <Text style={styles.classDetail}>{item.id_componente ? `${item.numero_sesion} de ${components.find((component) => component.id_componente === item.id_componente)?.sesiones_semana ?? '—'} sesiones` : 'Registro histórico'} · {teacherLabel}</Text>
            {item.traslado_sabado ? <Text style={styles.transferLabel}>Traslado excepcional al sábado</Text> : null}
            {versionEditable ? <View style={styles.rowActions}>
                <TouchableOpacity style={styles.smallButton} onPress={() => openExisting(item)}><Text style={styles.smallButtonText}>Editar ubicación</Text></TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} onPress={() => void toggleFixed(item)}><Text style={styles.smallButtonText}>{item.es_fijada ? 'Desfijar' : 'Fijar'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => removeSession(item)}><Text style={styles.removeText}>Retirar</Text></TouchableOpacity>
            </View> : null}
        </View>;
    };

    const renderIssue = (issue: ValidationIssue, index: number) => <View key={`${issue.code ?? 'issue'}-${index}`} style={styles.issueCard}>
        <Text style={styles.issueTitle}>{issue.severity === 'error' ? 'Conflicto' : 'Aviso'} · {issue.code ?? 'Validación'}</Text>
        <Text style={styles.issueText}>{issue.message ?? 'Revise este hallazgo.'}</Text>
        {[issue.group, issue.subject, issue.teacher, issue.resource, issue.restriction, issue.day ? `${issue.day} ${displayTime(issue.start)}–${displayTime(issue.end)}` : null,
            issue.gap_minutes ? `${Math.ceil(issue.gap_minutes)} min de hueco interno` : null,
            issue.expected !== undefined ? `${issue.scheduled ?? 0}/${issue.expected} sesiones ubicadas` : null].filter(Boolean).map((part, itemIndex) => <Text key={itemIndex} style={styles.issueDetail}>{part}</Text>)}
    </View>;

    const handleExportDraftExcel = async () => {
        if (!visibleRows.length) {
            Alert.alert('Aviso', 'No hay clases en esta versión para exportar.');
            return;
        }
        try {
            setBusy(true);
            await exportScheduleToExcel({
                periodoNombre: selectedPeriod?.nombre ?? 'II Semestre 2026',
                turno: shift === 'todos' ? 'Matutino' : shift,
                clases: visibleRows.map((r) => {
                    const teacherIds = [...new Set([r.id_docente, ...(r.horario_docente ?? []).map((t) => t.id_docente)])];
                    const teacherLabel = teacherIds.map((id) => teacherNames[id] ?? `Docente ${id}`).join(', ');
                    return {
                        seccion_codigo: r.secciones?.codigo ?? 'Grupo',
                        asignatura_nombre: r.asignaturas?.nombre ?? r.asignaturas?.codigo ?? '',
                        docente_nombre: teacherLabel,
                        aula_codigo: r.aulas?.codigo,
                        dia: r.dia_snapshot ?? r.bloques_clase?.dia,
                        hora_inicio: r.hora_inicio_snapshot ?? r.bloques_clase?.hora_inicio,
                        hora_fin: r.hora_fin_snapshot ?? r.bloques_clase?.hora_fin,
                    };
                }),
                secciones: groups.map((g) => ({
                    codigo: g.codigo,
                    carrera_nombre: g.carreras?.nombre,
                })),
            });
        } catch (err: any) {
            console.error('[EXCEL] Error exportando borrador:', err);
            Alert.alert('Error', 'No se pudo exportar el horario a Excel.');
        } finally {
            setBusy(false);
        }
    };

    const selectedPeriod = periods.find((period) => period.id_periodo === periodId);
    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    return <SafeAreaView style={styles.container} edges={['bottom']}>
        <FlatList
            data={visibleRows}
            keyExtractor={(row) => String(row.id_horario)}
            renderItem={renderScheduleRow}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListHeaderComponent={<View>
                <Text style={styles.title}>Borradores de horario</Text>
                <Text style={styles.subtitle}>Edite con controles táctiles, compruebe cada versión y conserve el horario oficial mientras trabaja.</Text>
                <Text style={styles.label}>Período</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {periods.map((period) => <TouchableOpacity key={period.id_periodo} style={[styles.chip, periodId === period.id_periodo && styles.chipActive]} onPress={() => { setPeriodId(period.id_periodo); setVersionId(null); setValidation(null); }}>
                        <Text style={[styles.chipText, periodId === period.id_periodo && styles.chipTextActive]}>{period.nombre} {period.ano_lectivo}</Text>
                    </TouchableOpacity>)}
                </ScrollView>
                <Text style={styles.label}>Versión · {selectedPeriod?.nombre ?? 'período'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {versions.map((version) => <TouchableOpacity key={version.id_version_horario} style={[styles.chip, versionId === version.id_version_horario && styles.chipActive]} onPress={() => { setVersionId(version.id_version_horario); setValidation(null); }}>
                        <Text style={[styles.chipText, versionId === version.id_version_horario && styles.chipTextActive]}>V{version.numero_version} · {labelState(version.estado)}</Text>
                    </TouchableOpacity>)}
                </ScrollView>
                {selectedVersion ? <View style={styles.versionCard}>
                    <Text style={styles.versionHeading}>Versión {selectedVersion.numero_version} · {labelState(selectedVersion.estado)}</Text>
                    <Text style={styles.versionDetail}>Creada {new Date(selectedVersion.fecha_creacion).toLocaleString()} · cuenta {selectedVersion.creada_por ?? 'migración'}</Text>
                    <Text style={styles.versionDetail}>Validación: {labelState(selectedVersion.estado_validacion)} · {scheduleRows.length} clase(s) registradas</Text>
                </View> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Aún no hay versiones de horario</Text><Text style={styles.emptyText}>Cree un borrador inicial para empezar a ubicar sesiones oficiales.</Text></View>}
                <View style={styles.topActions}>
                    <TouchableOpacity style={styles.primaryButton} disabled={busy || !periodId} onPress={() => void createDraft()}>
                        {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>{selectedVersion?.estado === 'borrador' ? 'Crear siguiente versión' : 'Crear borrador'}</Text>}
                    </TouchableOpacity>
                    {selectedVersion?.estado === 'borrador' ? <>
                        <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={generateProposal}>{busy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.secondaryText}>Completar propuesta automáticamente</Text>}</TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={() => setCandidateVisible(true)}><Text style={styles.secondaryText}>Agregar sesión · {candidates.length} pendiente(s)</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={() => void validateVersion()}>{busy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.secondaryText}>Validar semana completa</Text>}</TouchableOpacity>
                        {selectedVersion.estado_validacion === 'valida' || selectedVersion.estado_validacion === 'con_avisos' ? <>
                            <Text style={styles.label}>Compartir para revisión</Text>
                            <View style={styles.shareRoleRow}>{([
                                ['coordinacion', 'Coordinación'], ['jefatura', 'Jefatura'], ['docente', 'Docencia'],
                            ] as [ShareRole, string][]).map(([role, label]) => <TouchableOpacity key={role} style={[styles.chip, shareRoles.includes(role) && styles.chipActive]} onPress={() => setShareRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])}>
                                <Text style={[styles.chipText, shareRoles.includes(role) && styles.chipTextActive]}>{label}</Text>
                            </TouchableOpacity>)}</View>
                            <TouchableOpacity style={styles.secondaryButton} disabled={busy || !shareRoles.length} onPress={() => void shareProposal()}><Text style={styles.secondaryText}>Compartir versión validada</Text></TouchableOpacity>
                        </> : null}
                    </> : null}
                    {selectedVersion?.estado === 'aprobado' ? <TouchableOpacity style={styles.primaryButton} disabled={busy || !['valida', 'con_avisos'].includes(selectedVersion.estado_validacion)} onPress={publishVersion}>
                        {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>Publicar horario oficial del período</Text>}
                    </TouchableOpacity> : null}
                    {selectedVersion && visibleRows.length > 0 ? (
                        <TouchableOpacity style={[styles.secondaryButton, { borderColor: '#059669', marginTop: Spacing.sm }]} disabled={busy} onPress={() => void handleExportDraftExcel()}>
                            <Text style={[styles.secondaryText, { color: '#059669' }]}>📊 Descargar versión en Excel (.xlsx)</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
                <Text style={styles.label}>Mostrar</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {SHIFT_OPTIONS.map((option) => <TouchableOpacity key={option.id} style={[styles.chip, shift === option.id && styles.chipActive]} onPress={() => setShift(option.id)}><Text style={[styles.chipText, shift === option.id && styles.chipTextActive]}>{option.label}</Text></TouchableOpacity>)}
                </ScrollView>
                <Text style={styles.sectionHeading}>Clases de esta versión · {visibleRows.length}</Text>
            </View>}
            ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyText}>{selectedVersion?.estado === 'borrador' ? 'No hay clases ubicadas para este turno. Puede agregar sesiones pendientes.' : 'Esta versión no contiene clases para mostrar.'}</Text></View>}
            ListFooterComponent={<View>
                {validation ? <View style={styles.validationBox}>
                    <Text style={styles.validationTitle}>Resultado: {labelState(validation.estado)}</Text>
                    <Text style={styles.validationCounts}>{validation.errores} conflicto(s) · {validation.avisos} aviso(s)</Text>
                    {validation.hallazgos.map(renderIssue)}
                    {!validation.hallazgos.length ? <Text style={styles.issueText}>No se encontraron conflictos en la última validación.</Text> : null}
                </View> : null}
                {generationResult ? <View style={styles.validationBox}>
                    <Text style={styles.validationTitle}>Resultado de la propuesta automática</Text>
                    <Text style={styles.validationCounts}>{generationResult.colocadas} sesión(es) ubicadas · {generationResult.intentos} intento(s) · {generationResult.pendientes.length} pendiente(s)</Text>
                    {generationResult.pendientes.map((item, index) => <View key={`${item.group}-${item.subject}-${item.session}-${index}`} style={styles.issueCard}>
                        <Text style={styles.issueTitle}>{item.group} · {item.subject} · sesión {item.session}</Text>
                        <Text style={styles.issueText}>{item.reason}</Text>
                    </View>)}
                </View> : null}
                {candidates.length === 0 && componentsForPeriod.length ? <Text style={styles.footerNote}>Todas las sesiones registradas en las asignaciones están ubicadas en esta versión.</Text> : null}
            </View>}
        />

        <Modal visible={candidateVisible} transparent animationType="slide" onRequestClose={() => setCandidateVisible(false)}>
            <View style={styles.modalOverlay}><View style={styles.selectorCard}>
                <Text style={styles.modalTitle}>Sesiones pendientes</Text>
                <Text style={styles.helper}>Solo aparecen componentes de asignaciones del período y turno seleccionado.</Text>
                <FlatList data={candidates} keyExtractor={(item) => `${item.component.id_componente}-${item.session}`} ListEmptyComponent={<Text style={styles.emptyText}>No hay sesiones pendientes para este turno.</Text>} renderItem={({ item }) => <TouchableOpacity style={styles.candidateRow} onPress={() => { setCandidateVisible(false); openSession(item); }}>
                    <Text style={styles.candidateTitle}>{item.group.codigo} · {item.subject.codigo} · {item.component.tipo_sesion === 'teorica' ? 'Teoría' : 'Práctica'}</Text>
                    <Text style={styles.candidateDetail}>Sesión {item.session} de {item.component.sesiones_semana} · {item.component.duracion_minutos} min · {item.group.sede}</Text>
                </TouchableOpacity>} />
                <TouchableOpacity style={styles.cancelButton} onPress={() => setCandidateVisible(false)}><Text style={styles.cancelText}>Cerrar</Text></TouchableOpacity>
            </View></View>
        </Modal>

        <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
            <View style={styles.modalOverlay}><View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{selection ? `${selection.group.codigo} · ${selection.subject.codigo}` : 'Ubicar sesión'}</Text>
                <Text style={styles.helper}>{selection ? `${selection.component.tipo_sesion === 'teorica' ? 'Teoría' : 'Práctica'} · sesión ${selection.session} de ${selection.component.sesiones_semana} · ${selection.component.duracion_minutos} minutos · ${selection.group.modalidad}/${selection.group.turno}` : ''}</Text>
                <ScrollView style={styles.modalScroll}>
                    <Text style={styles.label}>Bloque compatible</Text>
                    {blockOptions.map((block) => <TouchableOpacity key={block.id_bloque} style={[styles.optionRow, selectedBlock === block.id_bloque && styles.optionRowSelected]} onPress={() => { setSelectedBlock(block.id_bloque); if (block.dia !== 'Sabado') setSaturdayTransfer(false); }}>
                        <Text style={styles.optionText}>{block.dia} · {displayTime(block.hora_inicio)}–{displayTime(block.hora_fin)}</Text><Text style={styles.optionCheck}>{selectedBlock === block.id_bloque ? '✓' : '○'}</Text>
                    </TouchableOpacity>)}
                    {!blockOptions.length ? <Text style={styles.helper}>No existe un bloque habilitado de la modalidad, turno y duración solicitados.</Text> : null}
                    {blockOptions.find((block) => block.id_bloque === selectedBlock)?.dia === 'Sabado' ? <View style={styles.transferRow}>
                        <View style={styles.optionCopy}><Text style={styles.optionText}>Traslado excepcional al sábado</Text><Text style={styles.optionDetail}>Solo se acepta si la regla está habilitada y hay grupos registrados en CUR e Instituto. Nunca aplica al domingo.</Text></View>
                        <Switch value={saturdayTransfer} onValueChange={setSaturdayTransfer} accessibilityLabel="Marcar traslado excepcional al sábado" />
                    </View> : null}
                    <Text style={styles.label}>Espacio con capacidad, sede y recursos</Text>
                    {roomOptions.map((room) => <TouchableOpacity key={room.id_aula} style={[styles.optionRow, selectedRoom === room.id_aula && styles.optionRowSelected]} onPress={() => setSelectedRoom(room.id_aula)}>
                        <View style={styles.optionCopy}><Text style={styles.optionText}>{room.codigo} · {room.pabellones?.nombre ?? 'Pabellón'}</Text><Text style={styles.optionDetail}>{room.pabellones?.sede ?? 'Sede pendiente'} · capacidad {room.capacidad} · {room.tipo}</Text></View><Text style={styles.optionCheck}>{selectedRoom === room.id_aula ? '✓' : '○'}</Text>
                    </TouchableOpacity>)}
                    {!roomOptions.length ? <Text style={styles.helper}>No hay un espacio del inventario que cubra el cupo, la sede y los recursos requeridos.</Text> : null}
                    {selection?.component.requiere_espacio_especializado ? <Text style={styles.helper}>Necesidad especial: {selection.component.observacion_espacio}. Confirme el tipo contra el inventario oficial.</Text> : null}
                    <Text style={styles.helper}>Docentes oficiales: {[...new Set((selection?.component.asignacion_componente_docente ?? []).map((entry) => entry.id_docente))].map((id) => teacherNames[id] ?? `Docente ${id}`).join(', ') || 'sin asignación'}. Cada docente queda ocupado durante esta sesión.</Text>
                </ScrollView>
                <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setEditVisible(false)} disabled={busy}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => void saveSession()} disabled={busy || !blockOptions.length || !roomOptions.length}>{busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryText}>Guardar ubicación</Text>}</TouchableOpacity>
                </View>
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
    chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
    chip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    chipTextActive: { color: Colors.white, fontWeight: '700' },
    shareRoleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
    versionCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.sm, padding: Spacing.md, ...Shadows.sm },
    versionHeading: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    versionDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    topActions: { gap: Spacing.sm, marginTop: Spacing.md },
    primaryButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.md },
    primaryText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700', textAlign: 'center' },
    secondaryButton: { alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.primary, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: Spacing.md },
    secondaryText: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    sectionHeading: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.lg },
    classCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    classTop: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm },
    classTitle: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm, fontWeight: '700' },
    fixedTag: { borderRadius: BorderRadius.full, fontSize: Typography.sizes.xs, fontWeight: '700', overflow: 'hidden', paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    fixedOn: { backgroundColor: Colors.success + '18', color: Colors.success },
    fixedOff: { backgroundColor: Colors.background, color: Colors.textTertiary },
    classDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
    rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    smallButton: { backgroundColor: Colors.primary + '10', borderRadius: BorderRadius.sm, minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    smallButtonText: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    removeButton: { backgroundColor: '#FFF0F0', borderRadius: BorderRadius.sm, minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    removeText: { color: Colors.error, fontSize: Typography.sizes.xs, fontWeight: '700' },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.xl },
    emptyTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    emptyText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs, textAlign: 'center' },
    validationBox: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.lg, padding: Spacing.lg, ...Shadows.sm },
    validationTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700' },
    validationCounts: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, marginTop: Spacing.xs },
    issueCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, marginTop: Spacing.sm, padding: Spacing.md },
    issueTitle: { color: Colors.primary, fontSize: Typography.sizes.xs, fontWeight: '700' },
    issueText: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.4, marginTop: Spacing.xs },
    issueDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: 3 },
    footerNote: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, marginTop: Spacing.lg, textAlign: 'center' },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    selectorCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '88%', padding: Spacing.lg },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '94%', padding: Spacing.lg },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', marginBottom: Spacing.xs, textAlign: 'center' },
    modalScroll: { flexShrink: 1, marginTop: Spacing.sm },
    helper: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginVertical: Spacing.xs },
    candidateRow: { borderBottomColor: Colors.border, borderBottomWidth: 1, paddingVertical: Spacing.md },
    candidateTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    candidateDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    transferLabel: { color: Colors.accent, fontSize: Typography.sizes.xs, fontWeight: '700', marginTop: Spacing.xs },
    optionRow: { alignItems: 'center', borderBottomColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: Spacing.sm },
    optionRowSelected: { backgroundColor: Colors.primary + '10' },
    optionCopy: { flex: 1 },
    optionText: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    optionDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: 3 },
    optionCheck: { color: Colors.primary, fontSize: Typography.sizes.md, paddingLeft: Spacing.md },
    transferRow: { alignItems: 'center', borderBottomColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.md },
    modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    cancelButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: Spacing.md },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
});

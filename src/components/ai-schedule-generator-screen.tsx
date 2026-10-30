import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { DiaSemana, Periodo } from '@/types/database';
import {
    ProposedClass,
    solveScheduleAI,
    SolverBlock,
    SolverNeed,
    SolverRestriction,
    SolverResult,
    SolverRoom,
    SolverSection,
    SolverSubject,
    SolverTeacher,
} from '@/utils/schedule-ai-solver';
import { exportScheduleToExcel } from '@/utils/schedule-excel-export';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS: DiaSemana[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export default function AIScheduleGeneratorScreen() {
    const router = useRouter();
    const [periods, setPeriods] = useState<Periodo[]>([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [genStage, setGenStage] = useState('');

    // Generator Options (Aulas opcional desactivado por defecto)
    const [considerarAulas, setConsiderarAulas] = useState(false);
    const [modoProfundo, setModoProfundo] = useState(true);
    const [selectedDay, setSelectedDay] = useState<DiaSemana>('Lunes');

    // Interactive Locking (Bloqueo de días y fijación de clases individuales)
    const [lockedDays, setLockedDays] = useState<DiaSemana[]>([]);
    const [pinnedClassIds, setPinnedClassIds] = useState<Set<string>>(new Set());

    // Solver Data Cached
    const [solverSections, setSolverSections] = useState<SolverSection[]>([]);
    const [solverSubjects, setSolverSubjects] = useState<SolverSubject[]>([]);
    const [solverTeachers, setSolverTeachers] = useState<SolverTeacher[]>([]);
    const [solverRooms, setSolverRooms] = useState<SolverRoom[]>([]);
    const [solverBlocks, setSolverBlocks] = useState<SolverBlock[]>([]);
    const [solverRestrictions, setSolverRestrictions] = useState<SolverRestriction[]>([]);
    const [solverNeeds, setSolverNeeds] = useState<SolverNeed[]>([]);

    // Output Result
    const [result, setResult] = useState<SolverResult | null>(null);
    const [savingDraft, setSavingDraft] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const loadPeriodData = useCallback(async () => {
        try {
            setLoadingData(true);
            const { data: periodRows, error: pError } = await supabase
                .from('periodos')
                .select('id_periodo, nombre, ano_lectivo, fecha_inicio, fecha_fin, es_activo')
                .order('ano_lectivo', { ascending: false });

            if (pError || !periodRows) {
                Alert.alert('Error', 'No se pudieron consultar los períodos académicos.');
                return;
            }

            setPeriods(periodRows as Periodo[]);
            const active = periodRows.find((p) => p.es_activo) || periodRows[0];
            const pId = active?.id_periodo ?? null;
            setSelectedPeriodId(pId);

            if (!pId) {
                setLoadingData(false);
                return;
            }

            // Load sections, subjects, blocks, teachers, rooms, restrictions, needs
            const [
                { data: rawSections },
                { data: rawSubjects },
                { data: rawTeachers },
                { data: rawRooms },
                { data: rawBlocks },
                { data: rawRestrictions },
                { data: rawComponents },
                { data: teacherTypes },
            ] = await Promise.all([
                supabase
                    .from('secciones')
                    .select('id_seccion, codigo, id_carrera, ano_estudio, cantidad_estudiantes, modalidad, turno, sede')
                    .eq('id_periodo', pId),
                supabase
                    .from('asignaturas')
                    .select('id_asignatura, codigo, nombre')
                    .eq('estado', 'activo'),
                supabase
                    .from('usuarios')
                    .select('id_usuario, nombre')
                    .eq('estado', 'activo'),
                supabase
                    .from('aulas')
                    .select('id_aula, codigo, capacidad, tipo, estado')
                    .eq('estado', 'activo'),
                supabase
                    .from('bloques_clase')
                    .select('id_bloque, dia, modalidad, turno, hora_inicio, hora_fin, es_receso')
                    .eq('id_periodo', pId)
                    .order('hora_inicio'),
                supabase
                    .from('restricciones_planificacion')
                    .select('id_afectado, dia, hora_inicio, hora_fin')
                    .eq('id_periodo', pId),
                supabase
                    .from('asignacion_componentes')
                    .select(`
                        id_componente,
                        sesiones_semana,
                        duracion_minutos,
                        requiere_espacio_especializado,
                        observacion_espacio,
                        asignaciones_academicas!inner(id_seccion, id_asignatura, id_periodo),
                        asignacion_componente_docente(id_docente)
                    `)
                    .eq('asignaciones_academicas.id_periodo', pId),
                supabase
                    .from('pwa_docente_tipo')
                    .select('id_docente, tipo_docente'),
            ]);

            const teacherTypeMap = new Map(
                (teacherTypes || []).map((t: any) => [t.id_docente, t.tipo_docente as 'planta' | 'horario'])
            );

            const solverTeachersList: SolverTeacher[] = (rawTeachers || []).map((t: any) => ({
                id_docente: t.id_usuario,
                nombre: t.nombre,
                tipo_docente: teacherTypeMap.get(t.id_usuario) || 'planta',
            }));

            // Map components to needs
            const needsList: SolverNeed[] = [];
            (rawComponents ?? []).forEach((c: any) => {
                const docId = c.asignacion_componente_docente?.[0]?.id_docente;
                if (docId && c.asignaciones_academicas) {
                    needsList.push({
                        id_componente: c.id_componente,
                        id_seccion: c.asignaciones_academicas.id_seccion,
                        id_asignatura: c.asignaciones_academicas.id_asignatura,
                        id_docente: docId,
                        sesiones_semana: c.sesiones_semana || 2,
                        duracion_minutos: c.duracion_minutos || 90,
                        requiere_espacio_especializado: c.requiere_espacio_especializado,
                        observacion_espacio: c.observacion_espacio,
                    });
                }
            });

            // Map restrictions
            const restrictionsList: SolverRestriction[] = (rawRestrictions ?? [])
                .filter((r: any) => r.id_afectado && r.dia && r.hora_inicio && r.hora_fin)
                .map((r: any) => ({
                    id_docente: r.id_afectado,
                    dia: r.dia as DiaSemana,
                    hora_inicio: r.hora_inicio,
                    hora_fin: r.hora_fin,
                }));

            setSolverSections((rawSections as SolverSection[]) ?? []);
            setSolverSubjects((rawSubjects as SolverSubject[]) ?? []);
            setSolverTeachers(solverTeachersList);
            setSolverRooms((rawRooms as SolverRoom[]) ?? []);
            setSolverBlocks((rawBlocks as SolverBlock[]) ?? []);
            setSolverRestrictions(restrictionsList);
            setSolverNeeds(needsList);
        } catch (err: any) {
            console.error('[AI_GENERATOR] Error cargando datos:', err);
            Alert.alert('Error', 'No se pudieron cargar los datos del semestre.');
        } finally {
            setLoadingData(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadPeriodData();
    }, [loadPeriodData]);

    const toggleLockDay = (day: DiaSemana) => {
        setLockedDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
        );
    };

    const togglePinClass = (id_horario: string) => {
        setPinnedClassIds((prev) => {
            const next = new Set(prev);
            if (next.has(id_horario)) {
                next.delete(id_horario);
            } else {
                next.add(id_horario);
            }
            return next;
        });
    };

    const handleRunAIGenerator = async () => {
        if (!selectedPeriodId) {
            Alert.alert('Período', 'Seleccione un semestre académico.');
            return;
        }

        setGenerating(true);
        setGenStage('Identificando clases fijadas y días bloqueados...');

        // Allow UI to update
        await new Promise((resolve) => setTimeout(resolve, 250));
        setGenStage('Podando dominios y respetando máx. 2 bloques por materia...');

        await new Promise((resolve) => setTimeout(resolve, 250));
        setGenStage('Explorando combinaciones óptimas sin colisiones...');

        try {
            // Collect all classes from current proposal that are on locked days OR pinned
            const fixedClassesToKeep: ProposedClass[] = (result?.clases || [])
                .filter((c) => lockedDays.includes(c.dia) || pinnedClassIds.has(c.id_horario))
                .map((c) => ({
                    ...c,
                    es_fijada: true,
                }));

            // Collect classes that were NOT locked/pinned so solver explores alternative slots
            const previousUnfixedPlacements = (result?.clases || [])
                .filter((c) => !lockedDays.includes(c.dia) && !pinnedClassIds.has(c.id_horario))
                .map((c) => ({
                    id_seccion: c.id_seccion,
                    id_asignatura: c.id_asignatura,
                    sessionNumber: c.numero_sesion,
                    id_bloque: c.id_bloque,
                }));

            const solverRes = solveScheduleAI({
                sections: solverSections,
                subjects: solverSubjects,
                teachers: solverTeachers,
                rooms: solverRooms,
                blocks: solverBlocks,
                restrictions: solverRestrictions,
                needs: solverNeeds,
                fixedClasses: fixedClassesToKeep,
                lockedDays,
                considerarAulas,
                previousUnfixedPlacements,
                maxNodos: modoProfundo ? 15000 : 4000,
                maxTimeMs: modoProfundo ? 8000 : 3000,
            });

            setResult(solverRes);

            // Automatically sync pinned class IDs with preserved fixed classes
            const newPinned = new Set(pinnedClassIds);
            solverRes.clases.forEach((c) => {
                if (c.es_fijada) newPinned.add(c.id_horario);
            });
            setPinnedClassIds(newPinned);

            if (solverRes.estado === 'propuesta') {
                const preservedCount = solverRes.estadisticas.sesionesFijadasPreservadas;
                const reassignedCount = solverRes.estadisticas.sesionesColocadas - preservedCount;
                Alert.alert(
                    '¡Horario Optimizado!',
                    preservedCount > 0
                        ? `Se preservaron ${preservedCount} clases bloqueadas y se reasignaron ${reassignedCount} clases a nuevas franjas horarias.`
                        : `Se ubicaron exitosamente las ${solverRes.estadisticas.sesionesColocadas} sesiones cumpliendo todas las reglas.`
                );
            } else if (solverRes.estado === 'busqueda_limitada') {
                Alert.alert(
                    'Búsqueda Acotada',
                    `Se ubicaron ${solverRes.estadisticas.sesionesColocadas} de ${solverRes.estadisticas.totalSesiones} sesiones. Puede revisar los pendientes o intentar con otro orden.`
                );
            }
        } catch (err: any) {
            console.error('[AI_GENERATOR] Error generando horario:', err);
            Alert.alert('Error', 'Ocurrió un error inesperado al ejecutar el algoritmo.');
        } finally {
            setGenerating(false);
            setGenStage('');
        }
    };

    const handleSaveAsDraft = async () => {
        if (!selectedPeriodId || !result || result.clases.length === 0) {
            Alert.alert('Aviso', 'No hay clases generadas para guardar.');
            return;
        }

        try {
            setSavingDraft(true);

            // 1. Get next version number
            const { data: existingVersions } = await supabase
                .from('versiones_horario')
                .select('numero_version')
                .eq('id_periodo', selectedPeriodId)
                .order('numero_version', { ascending: false })
                .limit(1);

            const nextNum = (existingVersions?.[0]?.numero_version ?? 0) + 1;

            // 2. Create new draft version
            const { data: newVersion, error: vError } = await supabase
                .from('versiones_horario')
                .insert({
                    id_periodo: selectedPeriodId,
                    numero_version: nextNum,
                    alcance_turno: 'institucional',
                    estado: 'borrador',
                    estado_validacion: 'pendiente',
                })
                .select('id_version_horario')
                .single();

            if (vError || !newVersion) {
                console.error('[AI_GENERATOR] Error creando versión:', vError);
                Alert.alert('Error', 'No se pudo registrar la nueva versión de horario en Supabase.');
                return;
            }

            const versionId = newVersion.id_version_horario;

            // 3. Batch insert the classes into horarios
            const rowsToInsert = result.clases.map((c) => ({
                id_version_horario: versionId,
                id_seccion: c.id_seccion,
                id_asignatura: c.id_asignatura,
                id_docente: c.id_docente,
                id_aula: c.id_aula ?? null,
                id_bloque: c.id_bloque,
                numero_sesion: c.numero_sesion,
                es_fijada: c.es_fijada || lockedDays.includes(c.dia) || pinnedClassIds.has(c.id_horario),
                dia_snapshot: c.dia,
                hora_inicio_snapshot: c.hora_inicio,
                hora_fin_snapshot: c.hora_fin,
                estado_publicacion: 'borrador',
            }));

            const { error: hError } = await supabase.from('horarios').insert(rowsToInsert);

            if (hError) {
                console.error('[AI_GENERATOR] Error insertando horarios:', hError);
                Alert.alert('Advertencia', 'Se creó la versión pero algunas clases no se pudieron insertar. Verifique restricciones.');
                return;
            }

            Alert.alert(
                '¡Borrador Guardado!',
                `Se guardó la Versión ${nextNum} con ${rowsToInsert.length} clases en borrador. El coordinador o planificador puede revisarla, ajustarla o publicarla.`,
                [
                    {
                        text: 'Ver Borradores',
                        onPress: () => router.push('/(planificacion)/drafts' as any),
                    },
                    { text: 'Aceptar' },
                ]
            );
        } catch (err: any) {
            console.error('[AI_GENERATOR] Excepción guardando borrador:', err);
            Alert.alert('Error', 'Error inesperado al persistir el borrador.');
        } finally {
            setSavingDraft(false);
        }
    };

    const handleExportExcel = async () => {
        if (!result || result.clases.length === 0) {
            Alert.alert('Aviso', 'No hay clases en la propuesta para exportar.');
            return;
        }

        try {
            setExportingExcel(true);
            const periodObj = periods.find((p) => p.id_periodo === selectedPeriodId);
            await exportScheduleToExcel({
                periodoNombre: periodObj?.nombre ?? 'II Semestre 2026',
                turno: 'Matutino',
                clases: result.clases,
                secciones: solverSections.map((s) => ({
                    codigo: s.codigo,
                    carrera_nombre: s.carrera_nombre,
                    ano_estudio: s.ano_estudio,
                })),
            });
        } catch (err: any) {
            console.error('[EXCEL] Error exportando horario:', err);
            Alert.alert('Error al exportar', 'No se pudo generar el archivo Excel.');
        } finally {
            setExportingExcel(false);
        }
    };

    const classesForSelectedDay = (result?.clases ?? []).filter((c) => c.dia === selectedDay);
    const hasFixedOrLocked = lockedDays.length > 0 || pinnedClassIds.size > 0;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPeriodData(); }} />
                }
            >
                {/* Header Card */}
                <View style={styles.headerCard}>
                    <View style={styles.headerIconContainer}>
                        <Text style={styles.headerIcon}>⚡</Text>
                    </View>
                    <View style={styles.headerTextCol}>
                        <Text style={styles.headerTitle}>Generador de Horarios IA</Text>
                        <Text style={styles.headerSubtitle}>
                            Algoritmo CSP con Heurística MRV y Preservación de Clases
                        </Text>
                    </View>
                </View>

                {/* Academic Period Selector Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Semestre de Planificación</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodPillsScroll}>
                        {periods.map((p) => {
                            const isSelected = p.id_periodo === selectedPeriodId;
                            return (
                                <TouchableOpacity
                                    key={p.id_periodo}
                                    style={[styles.periodPill, isSelected && styles.periodPillActive]}
                                    onPress={() => setSelectedPeriodId(p.id_periodo)}
                                >
                                    <Text style={[styles.periodPillText, isSelected && styles.periodPillTextActive]}>
                                        {p.nombre} ({p.ano_lectivo}) {p.es_activo ? '⭐ Activo' : ''}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Pre-flight Data Diagnosis */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Text style={styles.statNum}>{solverSections.length}</Text>
                            <Text style={styles.statName}>Secciones</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statNum}>{solverNeeds.length}</Text>
                            <Text style={styles.statName}>Asignaciones</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statNum}>{solverTeachers.length}</Text>
                            <Text style={styles.statName}>Docentes</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statNum}>{solverRooms.length}</Text>
                            <Text style={styles.statName}>Aulas</Text>
                        </View>
                    </View>

                    {/* Business Rule Notice */}
                    <View style={styles.ruleNoticeBox}>
                        <Text style={styles.ruleNoticeTitle}>📌 Regla institucional activa:</Text>
                        <Text style={styles.ruleNoticeText}>
                            Cada profesor imparte un máximo de 2 bloques a la semana (sesiones de 90 min) de la misma clase, en días separados. Puede impartir otras asignaturas a lo largo de la semana.
                        </Text>
                    </View>
                </View>

                {/* Day Lock Control Card */}
                <View style={styles.card}>
                    <View style={styles.lockHeader}>
                        <Text style={styles.cardTitle}>Bloqueo de Días y Fijación</Text>
                        {lockedDays.length > 0 && (
                            <View style={styles.lockedBadgeCount}>
                                <Text style={styles.lockedBadgeText}>🔒 {lockedDays.length} bloqueados</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.cardDesc}>
                        Toca un día para bloquearlo. Las clases de los días bloqueados no serán alteradas ni movidas por la IA al regenerar.
                    </Text>

                    <View style={styles.daysLockRow}>
                        {DAYS.map((day) => {
                            const isLocked = lockedDays.includes(day);
                            return (
                                <TouchableOpacity
                                    key={day}
                                    style={[styles.dayLockBtn, isLocked && styles.dayLockBtnActive]}
                                    onPress={() => toggleLockDay(day)}
                                >
                                    <Text style={styles.dayLockIcon}>{isLocked ? '🔒' : '🔓'}</Text>
                                    <Text style={[styles.dayLockText, isLocked && styles.dayLockTextActive]}>
                                        {day.slice(0, 3)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* AI Configuration Options Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Parámetros de Optimización</Text>

                    {/* Aulas Opcionales */}
                    <View style={styles.optionRow}>
                        <View style={styles.optionTextCol}>
                            <Text style={styles.optionTitle}>Asignación de aulas (Opcional)</Text>
                            <Text style={styles.optionDesc}>
                                {considerarAulas
                                    ? 'Activado: Busca aulas compatibles con capacidad y recursos.'
                                    : 'Desactivado: El horario se crea libre de aulas para asignarlas manualmente después.'}
                            </Text>
                        </View>
                        <Switch
                            value={considerarAulas}
                            onValueChange={setConsiderarAulas}
                            trackColor={{ false: Colors.border, true: Colors.primary }}
                        />
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.optionRow}>
                        <View style={styles.optionTextCol}>
                            <Text style={styles.optionTitle}>Búsqueda heurística profunda</Text>
                            <Text style={styles.optionDesc}>
                                Explora hasta 15,000 combinaciones minimizando huecos de estudiantes y salidas tardías.
                            </Text>
                        </View>
                        <Switch
                            value={modoProfundo}
                            onValueChange={setModoProfundo}
                            trackColor={{ false: Colors.border, true: Colors.primary }}
                        />
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.generateButton,
                            (generating || solverNeeds.length === 0 || loadingData) && styles.buttonDisabled,
                            hasFixedOrLocked && styles.generateButtonReassign,
                        ]}
                        onPress={handleRunAIGenerator}
                        disabled={generating || solverNeeds.length === 0 || loadingData}
                        activeOpacity={0.8}
                    >
                        {generating ? (
                            <View style={styles.generatingState}>
                                <ActivityIndicator color={Colors.white} />
                                <Text style={styles.generateButtonText}>{genStage || 'Optimizando horario...'}</Text>
                            </View>
                        ) : (
                            <Text style={styles.generateButtonText}>
                                {result && hasFixedOrLocked
                                    ? '✨ Reasignar Clases No Bloqueadas'
                                    : '✨ Generar Propuesta de Horario'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Results Section */}
                {result && (
                    <View style={styles.card}>
                        <View style={styles.resultHeader}>
                            <Text style={styles.cardTitle}>Propuesta Generada</Text>
                            <View
                                style={[
                                    styles.statusBadge,
                                    result.estado === 'propuesta'
                                        ? styles.statusBadgeSuccess
                                        : styles.statusBadgeWarning,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.statusBadgeText,
                                        result.estado === 'propuesta'
                                            ? styles.statusTextSuccess
                                            : styles.statusTextWarning,
                                    ]}
                                >
                                    {result.estado === 'propuesta'
                                        ? 'Completa'
                                        : result.estado === 'busqueda_limitada'
                                            ? 'Parcial'
                                            : 'Sin Solución'}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.resultDesc}>{result.mensaje}</Text>

                        {/* Metrics Bar */}
                        <View style={styles.metricsRow}>
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricVal}>
                                    {result.estadisticas.sesionesColocadas} / {result.estadisticas.totalSesiones}
                                </Text>
                                <Text style={styles.metricLabel}>Sesiones</Text>
                            </View>
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricVal}>
                                    {result.estadisticas.sesionesFijadasPreservadas}
                                </Text>
                                <Text style={styles.metricLabel}>Fijadas</Text>
                            </View>
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricVal}>{result.estadisticas.tiempoCalculoMs} ms</Text>
                                <Text style={styles.metricLabel}>Tiempo</Text>
                            </View>
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricVal}>
                                    {result.estadisticas.huecosEstudiantilesEvitados}
                                </Text>
                                <Text style={styles.metricLabel}>Cero huecos</Text>
                            </View>
                        </View>

                        {/* Save as Official Draft & Export to Excel */}
                        {result.clases.length > 0 && (
                            <>
                                <TouchableOpacity
                                    style={[styles.saveDraftButton, savingDraft && styles.buttonDisabled]}
                                    onPress={handleSaveAsDraft}
                                    disabled={savingDraft}
                                >
                                    {savingDraft ? (
                                        <ActivityIndicator color={Colors.white} />
                                    ) : (
                                        <Text style={styles.saveDraftText}>
                                            💾 Guardar como Borrador Oficial ({result.clases.length} clases)
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.exportExcelButton, exportingExcel && styles.buttonDisabled]}
                                    onPress={handleExportExcel}
                                    disabled={exportingExcel}
                                >
                                    {exportingExcel ? (
                                        <ActivityIndicator color={Colors.white} />
                                    ) : (
                                        <Text style={styles.exportExcelText}>
                                            📊 Exportar Horario a Excel (.xlsx)
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        )}

                        {/* Day Selector Pills */}
                        <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>
                            Ver y fijar clases por día:
                        </Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.daysScroll}
                        >
                            {DAYS.map((day) => {
                                const isSelected = selectedDay === day;
                                const isDayLocked = lockedDays.includes(day);
                                const count = result.clases.filter((c) => c.dia === day).length;
                                return (
                                    <TouchableOpacity
                                        key={day}
                                        style={[
                                            styles.dayPill,
                                            isSelected && styles.dayPillSelected,
                                            isDayLocked && styles.dayPillLocked,
                                        ]}
                                        onPress={() => setSelectedDay(day)}
                                    >
                                        <Text style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}>
                                            {isDayLocked ? '🔒 ' : ''}{day} ({count})
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Classes List */}
                        {classesForSelectedDay.length === 0 ? (
                            <View style={styles.noClassesBox}>
                                <Text style={styles.noClassesText}>
                                    No hay clases programadas para el día {selectedDay}.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.classesContainer}>
                                {classesForSelectedDay.map((item) => {
                                    const isDayLocked = lockedDays.includes(item.dia);
                                    const isPinned = item.es_fijada || pinnedClassIds.has(item.id_horario);

                                    return (
                                        <View
                                            key={item.id_horario}
                                            style={[
                                                styles.classCard,
                                                isPinned && styles.classCardPinned,
                                                isDayLocked && styles.classCardLocked,
                                            ]}
                                        >
                                            <View style={styles.classCardHeader}>
                                                <View style={styles.timeBadge}>
                                                    <Text style={styles.timeBadgeText}>
                                                        ⏰ {item.hora_inicio.slice(0, 5)} - {item.hora_fin.slice(0, 5)}
                                                    </Text>
                                                </View>
                                                <View style={styles.badgesRowRight}>
                                                    <View style={styles.groupBadge}>
                                                        <Text style={styles.groupBadgeText}>{item.seccion_codigo}</Text>
                                                    </View>
                                                    {/* Pin button */}
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.pinButton,
                                                            (isPinned || isDayLocked) && styles.pinButtonActive,
                                                        ]}
                                                        onPress={() => togglePinClass(item.id_horario)}
                                                    >
                                                        <Text style={styles.pinButtonText}>
                                                            {isDayLocked ? '🔒 Día Fijo' : isPinned ? '📌 Fijada' : 'Fijar 📌'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>

                                            <Text style={styles.classSubject}>{item.asignatura_nombre}</Text>

                                            <View style={styles.classMetaRow}>
                                                <Text style={styles.classTeacher}>👨‍🏫 {item.docente_nombre}</Text>
                                                {item.aula_codigo ? (
                                                    <Text style={styles.classRoom}>🏫 Aula {item.aula_codigo}</Text>
                                                ) : (
                                                    <Text style={styles.classRoomUnassigned}>🏫 Sin aula (Opcional)</Text>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* Pending Items List if any */}
                        {result.pendientes.length > 0 && (
                            <View style={styles.pendingSection}>
                                <Text style={styles.pendingTitle}>
                                    ⚠️ Sesiones pendientes por resolver ({result.pendientes.length})
                                </Text>
                                {result.pendientes.map((p, idx) => (
                                    <View key={idx} style={styles.pendingItem}>
                                        <Text style={styles.pendingSubject}>
                                            {p.seccion} · {p.asignatura} (Sesión {p.sesion})
                                        </Text>
                                        <Text style={styles.pendingReason}>{p.motivo}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: Spacing.md,
        paddingBottom: Spacing.huge,
    },
    headerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.md,
        gap: Spacing.md,
    },
    headerIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerIcon: {
        fontSize: 26,
    },
    headerTextCol: {
        flex: 1,
    },
    headerTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.white,
    },
    headerSubtitle: {
        fontSize: Typography.sizes.xs,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    cardTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    cardDesc: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginBottom: Spacing.md,
        lineHeight: 18,
    },
    periodPillsScroll: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
    },
    periodPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.surface,
        marginRight: Spacing.xs,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    periodPillActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    periodPillText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    periodPillTextActive: {
        color: Colors.white,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
        marginTop: Spacing.xs,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statNum: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.primary,
    },
    statName: {
        fontSize: 10,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    ruleNoticeBox: {
        marginTop: Spacing.md,
        backgroundColor: '#EFF6FF',
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primary,
    },
    ruleNoticeTitle: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: 2,
    },
    ruleNoticeText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        lineHeight: 16,
    },
    lockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    lockedBadgeCount: {
        backgroundColor: '#FEF3C7',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    lockedBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: '#D97706',
    },
    daysLockRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: Spacing.xs,
    },
    dayLockBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        marginHorizontal: 3,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surface,
        borderWidth: 1.5,
        borderColor: Colors.border,
    },
    dayLockBtnActive: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
    },
    dayLockIcon: {
        fontSize: 16,
        marginBottom: 2,
    },
    dayLockText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    dayLockTextActive: {
        color: '#92400E',
        fontWeight: '700',
    },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    optionTextCol: {
        flex: 1,
        paddingRight: Spacing.md,
    },
    optionTitle: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    optionDesc: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginTop: 2,
        lineHeight: 16,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: Spacing.sm,
    },
    generateButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.md,
        ...Shadows.sm,
    },
    generateButtonReassign: {
        backgroundColor: '#D97706',
    },
    generateButtonText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
        color: Colors.white,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    generatingState: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    statusBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    statusBadgeSuccess: {
        backgroundColor: '#DCFCE7',
    },
    statusBadgeWarning: {
        backgroundColor: '#FEF3C7',
    },
    statusBadgeText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
    },
    statusTextSuccess: {
        color: '#16A34A',
    },
    statusTextWarning: {
        color: '#D97706',
    },
    resultDesc: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginBottom: Spacing.md,
        lineHeight: 18,
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.sm,
        marginBottom: Spacing.md,
    },
    metricBlock: {
        alignItems: 'center',
        flex: 1,
    },
    metricVal: {
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    metricLabel: {
        fontSize: 10,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    saveDraftButton: {
        backgroundColor: '#16A34A',
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    saveDraftText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
        color: Colors.white,
    },
    fieldLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    daysScroll: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
    },
    dayPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        backgroundColor: Colors.surface,
        marginRight: Spacing.xs,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    dayPillSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    dayPillLocked: {
        borderColor: '#F59E0B',
        backgroundColor: '#FEF3C7',
    },
    dayPillText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    dayPillTextSelected: {
        color: Colors.white,
    },
    noClassesBox: {
        padding: Spacing.lg,
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
    },
    noClassesText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
    },
    classesContainer: {
        gap: Spacing.sm,
    },
    classCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        ...Shadows.sm,
    },
    classCardPinned: {
        borderLeftColor: '#16A34A',
        backgroundColor: '#F0FDF4',
    },
    classCardLocked: {
        borderLeftColor: '#F59E0B',
        backgroundColor: '#FFFBEB',
    },
    classCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    badgesRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    timeBadge: {
        backgroundColor: '#E0E7FF',
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
    },
    timeBadgeText: {
        fontSize: Typography.sizes.xs,
        color: Colors.primary,
        fontWeight: '700',
    },
    groupBadge: {
        backgroundColor: Colors.white,
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    groupBadgeText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textPrimary,
        fontWeight: '600',
    },
    pinButton: {
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    pinButtonActive: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
    },
    pinButtonText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#92400E',
    },
    classSubject: {
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    classMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    classTeacher: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
    },
    classRoom: {
        fontSize: Typography.sizes.xs,
        color: Colors.primary,
        fontWeight: '600',
    },
    classRoomUnassigned: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    pendingSection: {
        marginTop: Spacing.lg,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    pendingTitle: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: '#DC2626',
        marginBottom: Spacing.sm,
    },
    pendingItem: {
        backgroundColor: '#FEF2F2',
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm,
        marginBottom: Spacing.xs,
    },
    pendingSubject: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: '#991B1B',
    },
    pendingReason: {
        fontSize: 10,
        color: '#B91C1C',
        marginTop: 2,
    },
    exportExcelButton: {
        alignItems: 'center',
        backgroundColor: '#059669',
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        marginTop: Spacing.sm,
        minHeight: 46,
        paddingHorizontal: Spacing.lg,
        ...Shadows.sm,
    },
    exportExcelText: {
        color: Colors.white,
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
    },
});

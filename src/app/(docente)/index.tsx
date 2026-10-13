import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { DiaSemana } from '@/types/database';
import { supabase } from '@/lib/supabase';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const WEEKDAYS: DiaSemana[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const TODAY_INDEX = [6, 0, 1, 2, 3, 4, 5][new Date().getDay()];

type ScheduleItem = {
    id_horario: number;
    dia_snapshot: DiaSemana;
    hora_inicio_snapshot: string;
    hora_fin_snapshot: string;
    asignaturas: { codigo: string; nombre: string } | null;
    secciones: {
        codigo: string;
        ano_estudio: number;
        carreras: { nombre: string } | null;
    } | null;
    aulas: {
        codigo: string;
        pabellones: { nombre: string } | null;
    } | null;
    bloques_clase: {
        dia: DiaSemana;
        hora_inicio: string;
        hora_fin: string;
    } | null;
};

export default function DocenteHomeScreen() {
    const { profile } = useAuth();
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [periodName, setPeriodName] = useState<string | null>(null);
    const [hasActivePeriod, setHasActivePeriod] = useState(true);
    const [selectedDay, setSelectedDay] = useState<DiaSemana>(WEEKDAYS[TODAY_INDEX]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSchedule = useCallback(async () => {
        if (!profile) return;
        setError(null);

        const { data: activePeriod, error: periodError } = await supabase
            .from('periodos')
            .select('id_periodo, nombre, ano_lectivo, id_version_publicada')
            .eq('es_activo', true)
            .maybeSingle();

        if (periodError) {
            setError('No se pudo cargar el período académico. Comprueba tu conexión e inténtalo de nuevo.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (!activePeriod) {
            setHasActivePeriod(false);
            setPeriodName(null);
            setSchedule([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        setHasActivePeriod(true);
        setPeriodName(`${activePeriod.nombre} ${activePeriod.ano_lectivo}`);

        if (!activePeriod.id_version_publicada) {
            setSchedule([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const { data: teacherClasses, error: teacherClassesError } = await supabase
            .from('horario_docente')
            .select('id_horario')
            .eq('id_docente', profile.id_usuario);

        if (teacherClassesError) {
            setError('No se pudo cargar tu horario. Comprueba tu conexión e inténtalo de nuevo.');
            setSchedule([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const scheduleIds = (teacherClasses ?? []).map((item) => item.id_horario);
        if (!scheduleIds.length) {
            setSchedule([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const { data, error: scheduleError } = await supabase
            .from('horarios')
            .select(`
                id_horario,
                dia_snapshot,
                hora_inicio_snapshot,
                hora_fin_snapshot,
                asignaturas ( codigo, nombre ),
                secciones ( codigo, ano_estudio, carreras ( nombre ) ),
                aulas ( codigo, pabellones ( nombre ) ),
                bloques_clase!inner ( dia, id_periodo, hora_inicio, hora_fin )
            `)
            .in('id_horario', scheduleIds)
            .eq('estado_publicacion', 'publicado')
            .eq('id_version_horario', activePeriod.id_version_publicada)
            .eq('bloques_clase.id_periodo', activePeriod.id_periodo);

        if (scheduleError) {
            setError('No se pudo cargar tu horario. Comprueba tu conexión e inténtalo de nuevo.');
            setSchedule([]);
        } else {
            const sorted = ((data ?? []) as unknown as ScheduleItem[]).sort((left, right) => {
                const leftBlock = left.bloques_clase;
                const rightBlock = right.bloques_clase;
                if (!leftBlock || !rightBlock) return 0;
                const dayOrder = WEEKDAYS.indexOf(left.dia_snapshot ?? leftBlock.dia) - WEEKDAYS.indexOf(right.dia_snapshot ?? rightBlock.dia);
                return dayOrder || (left.hora_inicio_snapshot ?? leftBlock.hora_inicio).localeCompare(right.hora_inicio_snapshot ?? rightBlock.hora_inicio);
            });
            setSchedule(sorted);
        }

        setLoading(false);
        setRefreshing(false);
    }, [profile]);

    useEffect(() => {
        setLoading(true);
        void fetchSchedule();
    }, [fetchSchedule]);

    const daySchedule = useMemo(
        () => schedule.filter((item) => (item.dia_snapshot ?? item.bloques_clase?.dia) === selectedDay),
        [schedule, selectedDay]
    );

    const onRefresh = () => {
        setRefreshing(true);
        void fetchSchedule();
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View style={styles.welcomeCard}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{profile?.nombre?.charAt(0)?.toUpperCase() || 'D'}</Text>
                    </View>
                    <View style={styles.welcomeText}>
                        <Text style={styles.welcomeLabel}>Bienvenido/a</Text>
                        <Text numberOfLines={1} style={styles.welcomeName}>{profile?.nombre || 'Docente'}</Text>
                    </View>
                </View>

                <View style={styles.sectionHeading}>
                    <View>
                        <Text style={styles.title}>Mi horario semanal</Text>
                        <Text style={styles.period}>{periodName ?? 'Período académico'}</Text>
                    </View>
                    <Text style={styles.calendarIcon}>📅</Text>
                </View>

                {!hasActivePeriod && !loading ? (
                    <InfoCard icon="📅" title="No hay un período activo" message="Tu horario aparecerá cuando la administración active un período académico." />
                ) : null}

                {loading ? (
                    <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
                ) : error ? (
                    <View style={styles.messageCard}>
                        <Text style={styles.messageTitle}>No pudimos cargar el horario</Text>
                        <Text style={styles.messageText}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
                            <Text style={styles.retryText}>Intentar de nuevo</Text>
                        </TouchableOpacity>
                    </View>
                ) : hasActivePeriod ? (
                    <>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.dayPicker}
                        >
                            {WEEKDAYS.map((day) => {
                                const count = schedule.filter((item) => (item.dia_snapshot ?? item.bloques_clase?.dia) === day).length;
                                const selected = day === selectedDay;
                                return (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        accessibilityLabel={`${day}, ${count} ${count === 1 ? 'clase' : 'clases'}`}
                                        key={day}
                                        onPress={() => setSelectedDay(day)}
                                        style={[styles.dayButton, selected && styles.dayButtonSelected]}
                                    >
                                        <Text style={[styles.dayName, selected && styles.dayNameSelected]}>{day.slice(0, 3)}</Text>
                                        <View style={[styles.dayCount, selected && styles.dayCountSelected]}>
                                            <Text style={[styles.dayCountText, selected && styles.dayCountTextSelected]}>{count}</Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        {schedule.length === 0 ? (
                            <InfoCard icon="🗓️" title="Aún no hay horarios publicados" message="Cuando se publique tu horario, aparecerá aquí." />
                        ) : daySchedule.length === 0 ? (
                            <InfoCard icon="🌤️" title={`Sin clases el ${selectedDay.toLowerCase()}`} message="Selecciona otro día para consultar tus clases." />
                        ) : (
                            <View style={styles.classesList}>
                                {daySchedule.map((item) => (
                                    <View key={item.id_horario} style={styles.classCard}>
                                        <View style={styles.timeColumn}>
                                            <Text style={styles.startTime}>{(item.hora_inicio_snapshot ?? item.bloques_clase?.hora_inicio)?.slice(0, 5)}</Text>
                                            <View style={styles.timeDivider} />
                                            <Text style={styles.endTime}>{(item.hora_fin_snapshot ?? item.bloques_clase?.hora_fin)?.slice(0, 5)}</Text>
                                        </View>
                                        <View style={styles.classDetails}>
                                            <Text style={styles.subjectName}>{item.asignaturas?.nombre ?? 'Asignatura'}</Text>
                                            <Text style={styles.subjectCode}>{item.asignaturas?.codigo ?? '—'}</Text>
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailIcon}>📚</Text>
                                                <Text style={styles.detailText}>
                                                    {item.secciones?.codigo ?? 'Sección'} · Año {item.secciones?.ano_estudio ?? '—'}
                                                </Text>
                                            </View>
                                            {item.secciones?.carreras?.nombre ? (
                                                <View style={styles.detailRow}>
                                                    <Text style={styles.detailIcon}>🎓</Text>
                                                    <Text style={styles.detailText}>{item.secciones.carreras.nombre}</Text>
                                                </View>
                                            ) : null}
                                            <View style={styles.detailRow}>
                                                <Text style={styles.detailIcon}>🏫</Text>
                                                <Text style={styles.detailText}>
                                                    Aula {item.aulas?.codigo ?? '—'}
                                                    {item.aulas?.pabellones?.nombre ? ` · ${item.aulas.pabellones.nombre}` : ''}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoCard({ icon, title, message }: { icon: string; title: string; message: string }) {
    return (
        <View style={styles.messageCard}>
            <Text style={styles.messageIcon}>{icon}</Text>
            <Text style={styles.messageTitle}>{title}</Text>
            <Text style={styles.messageText}>{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background },
    content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
    welcomeCard: {
        alignItems: 'center',
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        flexDirection: 'row',
        marginBottom: Spacing.xxl,
        padding: Spacing.xl,
        ...Shadows.md,
    },
    avatarCircle: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 25,
        height: 50,
        justifyContent: 'center',
        marginRight: Spacing.lg,
        width: 50,
    },
    avatarText: { color: Colors.white, fontSize: Typography.sizes.xl, fontWeight: '700' },
    welcomeText: { flex: 1 },
    welcomeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: Typography.sizes.sm },
    welcomeName: { color: Colors.white, fontSize: Typography.sizes.lg, fontWeight: '600', marginTop: 2 },
    sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.xl, fontWeight: '700' },
    period: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, marginTop: Spacing.xs },
    calendarIcon: { fontSize: 28 },
    loader: { marginTop: Spacing.huge },
    dayPicker: { gap: Spacing.sm, paddingBottom: Spacing.lg },
    dayButton: {
        alignItems: 'center',
        backgroundColor: Colors.white,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        minWidth: 48,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    dayButtonSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    dayName: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    dayNameSelected: { color: Colors.white },
    dayCount: { alignItems: 'center', backgroundColor: Colors.background, borderRadius: 9, height: 18, justifyContent: 'center', marginTop: Spacing.xs, minWidth: 18, paddingHorizontal: 4 },
    dayCountSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
    dayCountText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700' },
    dayCountTextSelected: { color: Colors.white },
    classesList: { gap: Spacing.md },
    classCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        flexDirection: 'row',
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    timeColumn: { alignItems: 'center', marginRight: Spacing.lg, minWidth: 54 },
    startTime: { color: Colors.primary, fontSize: Typography.sizes.md, fontWeight: '700' },
    timeDivider: { backgroundColor: Colors.border, flex: 1, marginVertical: Spacing.xs, minHeight: 10, width: 2 },
    endTime: { color: Colors.textSecondary, fontSize: Typography.sizes.sm },
    classDetails: { borderLeftColor: Colors.accent, borderLeftWidth: 3, flex: 1, paddingLeft: Spacing.md },
    subjectName: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700' },
    subjectCode: { color: Colors.accent, fontSize: Typography.sizes.xs, fontWeight: '600', marginTop: 2 },
    detailRow: { alignItems: 'center', flexDirection: 'row', marginTop: Spacing.sm },
    detailIcon: { fontSize: 13, marginRight: Spacing.xs },
    detailText: { color: Colors.textSecondary, flex: 1, fontSize: Typography.sizes.sm },
    messageCard: {
        alignItems: 'center',
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        marginTop: Spacing.md,
        padding: Spacing.xxl,
        ...Shadows.sm,
    },
    messageIcon: { fontSize: 36, marginBottom: Spacing.md },
    messageTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', textAlign: 'center' },
    messageText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: 20, marginTop: Spacing.sm, textAlign: 'center' },
    retryButton: { borderColor: Colors.primary, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    retryText: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '600' },
});

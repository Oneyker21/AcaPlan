import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

type Period = { id_periodo: number; nombre: string; ano_lectivo: number; es_activo: boolean };
type RuleVersion = { id_version_reglas: number; numero_version: number; reglas: Record<string, unknown>; creada_por: number; fecha_creacion: string };
type SiteRow = { sede: string };

const clampWeight = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

export default function PlanningRulesScreen() {
    const [periods, setPeriods] = useState<Period[]>([]);
    const [periodId, setPeriodId] = useState<number | null>(null);
    const [versions, setVersions] = useState<RuleVersion[]>([]);
    const [sites, setSites] = useState<SiteRow[]>([]);
    const [transferSaturday, setTransferSaturday] = useState(false);
    const [balancedWeight, setBalancedWeight] = useState('50');
    const [gapsWeight, setGapsWeight] = useState('50');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Carga períodos, versiones de reglas y sedes para el período seleccionado.
    const fetchData = useCallback(async () => {
        const [periodResult, versionResult, sectionResult] = await Promise.all([
            supabase.from('periodos').select('id_periodo, nombre, ano_lectivo, es_activo').order('ano_lectivo', { ascending: false }),
            periodId
                ? supabase.from('versiones_reglas_planificacion').select('id_version_reglas, numero_version, reglas, creada_por, fecha_creacion').eq('id_periodo', periodId).order('numero_version', { ascending: false }).limit(8)
                : Promise.resolve({ data: [], error: null }),
            periodId ? supabase.from('secciones').select('sede').eq('id_periodo', periodId) : Promise.resolve({ data: [], error: null }),
        ]);
        if (periodResult.error || versionResult.error || sectionResult.error) {
            Alert.alert('No se cargaron las reglas', 'Revise la conexión y las migraciones del Sprint 3; después, actualice la pantalla.');
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const periodRows = (periodResult.data ?? []) as Period[];
        setPeriods(periodRows);
        if (!periodId) {
            const initialPeriod = periodRows.find((item) => item.es_activo)?.id_periodo ?? periodRows[0]?.id_periodo ?? null;
            setPeriodId(initialPeriod);
            if (initialPeriod) {
                setLoading(false);
                setRefreshing(false);
                return;
            }
        }
        const versionRows = (versionResult.data ?? []) as unknown as RuleVersion[];
        setVersions(versionRows);
        setSites((sectionResult.data ?? []) as SiteRow[]);
        const savedRules = versionRows[0]?.reglas ?? {};
        setTransferSaturday(savedRules.traslado_sabado_libre === true);
        setBalancedWeight(String(savedRules.peso_distribucion_equilibrada ?? 50));
        setGapsWeight(String(savedRules.peso_minimizar_huecos ?? 50));
        setLoading(false);
        setRefreshing(false);
    }, [periodId]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const hasCurAndInstitute = sites.some((row) => /cur/i.test(row.sede)) && sites.some((row) => /instituto/i.test(row.sede));
    // Las reglas se guardan asociadas al período tras comprobar las sedes requeridas.
    const saveRules = async () => {
        if (!periodId) {
            Alert.alert('Seleccione un período', 'Las reglas se guardan en una versión asociada a un período académico.');
            return;
        }
        if (transferSaturday && !hasCurAndInstitute) {
            Alert.alert('Traslado no disponible', 'Solo se habilita cuando el período tiene grupos registrados tanto en CUR como en Instituto.');
            return;
        }
        setSaving(true);
        const { data, error } = await supabase.rpc('save_planning_rules', {
            p_period_id: periodId,
            p_rules: {
                traslado_sabado_libre: transferSaturday,
                peso_distribucion_equilibrada: clampWeight(balancedWeight),
                peso_minimizar_huecos: clampWeight(gapsWeight),
            },
        });
        setSaving(false);
        if (error) {
            Alert.alert('No se guardó la versión', error.message.includes('both CUR and Instituto')
                ? 'El período debe tener grupos registrados en ambas sedes para habilitar el traslado al sábado.'
                : 'Compruebe sus permisos y actualice la pantalla antes de volver a guardar.');
            return;
        }
        await fetchData();
        Alert.alert('Reglas versionadas', `Se guardó la versión ${data}. Los requisitos obligatorios se mantienen separados de las preferencias.`);
    };

    const onRefresh = () => { setRefreshing(true); void fetchData(); };
    const selectedPeriod = periods.find((item) => item.id_periodo === periodId);

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    return <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.title}>Reglas del horario</Text>
            <Text style={styles.subtitle}>Cada guardado crea una versión nueva; las anteriores quedan disponibles como historial del período.</Text>

            <Text style={styles.label}>Período académico</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {periods.map((period) => <TouchableOpacity key={period.id_periodo} style={[styles.chip, periodId === period.id_periodo && styles.chipActive]} onPress={() => setPeriodId(period.id_periodo)}>
                    <Text style={[styles.chipText, periodId === period.id_periodo && styles.chipTextActive]}>{period.nombre} {period.ano_lectivo}</Text>
                </TouchableOpacity>)}
            </ScrollView>
            {!periods.length ? <View style={styles.card}><Text style={styles.body}>Cree un período académico antes de registrar reglas.</Text></View> : null}

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Requisitos obligatorios</Text>
                <Text style={styles.body}>• Los cruces de grupo, docente y espacio no se permiten.</Text>
                <Text style={styles.body}>• Los recesos no cuentan como clase y deben respetarse por cuadrícula.</Text>
                <Text style={styles.body}>• Un traslado excepcional solo puede ser al sábado, nunca al domingo; no se impone una duración universal de 80 minutos.</Text>
                <Text style={styles.body}>• Una modificación autorizada conserva las restricciones académicas registradas.</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Preferencias de distribución</Text>
                <Text style={styles.helper}>Estos pesos ayudan a ordenar propuestas; no invalidan por sí solos una combinación que cumple los requisitos.</Text>
                <WeightField label="Distribución equilibrada" value={balancedWeight} onChange={setBalancedWeight} />
                <WeightField label="Minimizar huecos internos" value={gapsWeight} onChange={setGapsWeight} />
            </View>

            <View style={styles.card}>
                <View style={styles.switchRow}>
                    <View style={styles.switchCopy}>
                        <Text style={styles.sectionTitle}>Traslado al sábado libre</Text>
                        <Text style={styles.helper}>{hasCurAndInstitute ? 'Disponible porque el período incluye grupos en CUR e Instituto.' : 'Se habilita cuando el período incluya grupos en CUR e Instituto.'} Nunca se traslada al domingo.</Text>
                    </View>
                    <Switch value={transferSaturday} onValueChange={setTransferSaturday} disabled={!hasCurAndInstitute} accessibilityLabel="Permitir traslado autorizado al sábado libre" />
                </View>
            </View>

            {periodId ? <TouchableOpacity style={styles.saveButton} onPress={() => void saveRules()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Guardar nueva versión</Text>}
            </TouchableOpacity> : null}

            <Text style={styles.sectionHeading}>Versiones anteriores · {selectedPeriod?.nombre ?? 'período'}</Text>
            {versions.length ? versions.map((version) => <View key={version.id_version_reglas} style={styles.versionCard}>
                <Text style={styles.versionTitle}>Versión {version.numero_version}</Text>
                <Text style={styles.versionMeta}>{new Date(version.fecha_creacion).toLocaleString()} · cuenta {version.creada_por}</Text>
                <Text style={styles.versionMeta}>Preferencias: equilibrada {Number(version.reglas.peso_distribucion_equilibrada ?? 50)}/100 · minimizar huecos {Number(version.reglas.peso_minimizar_huecos ?? 50)}/100</Text>
                <Text style={styles.versionMeta}>Traslado al sábado: {version.reglas.traslado_sabado_libre === true ? 'permitido bajo las condiciones del período' : 'no habilitado'}</Text>
            </View>) : <Text style={styles.helper}>Este período aún no tiene versiones guardadas.</Text>}
        </ScrollView>
    </SafeAreaView>;
}

function WeightField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return <View style={styles.weightRow}>
        <Text style={styles.weightLabel}>{label}</Text>
        <TextInput style={styles.weightInput} value={value} onChangeText={(input) => onChange(input.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" maxLength={3} accessibilityLabel={`${label}, de cero a cien`} />
        <Text style={styles.outOf}>/ 100</Text>
    </View>;
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    content: { padding: Spacing.lg, paddingBottom: Spacing.huge },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700' },
    subtitle: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    label: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginTop: Spacing.lg, textTransform: 'uppercase' },
    chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
    chip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    chipTextActive: { color: Colors.white, fontWeight: '700' },
    card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    sectionTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginBottom: Spacing.xs },
    body: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.xs },
    helper: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
    weightRow: { alignItems: 'center', flexDirection: 'row', marginTop: Spacing.md },
    weightLabel: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    weightInput: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, minHeight: 44, minWidth: 64, paddingHorizontal: Spacing.md, textAlign: 'center' },
    outOf: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, marginLeft: Spacing.sm },
    switchRow: { alignItems: 'center', flexDirection: 'row' },
    switchCopy: { flex: 1, paddingRight: Spacing.md },
    saveButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, justifyContent: 'center', marginTop: Spacing.lg, minHeight: 48 },
    saveText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    sectionHeading: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginTop: Spacing.xl },
    versionCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, marginTop: Spacing.sm, padding: Spacing.md, ...Shadows.sm },
    versionTitle: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    versionMeta: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
});

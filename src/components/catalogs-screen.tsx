import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
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

type CatalogKey = 'carreras' | 'asignaturas' | 'pabellones' | 'aulas' | 'recursos';
type CatalogItem = Record<string, any>;
type Option = { id: number; label: string };
type TextField = Exclude<keyof CatalogForm, 'estado' | 'recursos'>;
type CatalogForm = {
    nombre: string;
    sede: string;
    codigo: string;
    tipo: string;
    id_carrera: string;
    ano_estudio: string;
    horas_teoricas: string;
    horas_practicas: string;
    id_pabellon: string;
    capacidad: string;
    estado: 'activo' | 'inactivo';
    recursos: string[];
};

const CATALOGS: { key: CatalogKey; label: string; singular: string }[] = [
    { key: 'carreras', label: 'Carreras', singular: 'carrera' },
    { key: 'asignaturas', label: 'Asignaturas', singular: 'asignatura' },
    { key: 'pabellones', label: 'Pabellones', singular: 'pabellón' },
    { key: 'aulas', label: 'Aulas', singular: 'aula' },
    { key: 'recursos', label: 'Recursos', singular: 'recurso' },
];

const EMPTY_FORM: CatalogForm = {
    nombre: '',
    sede: '',
    codigo: '',
    tipo: 'Aula',
    id_carrera: '',
    ano_estudio: '',
    horas_teoricas: '0',
    horas_practicas: '0',
    id_pabellon: '',
    capacidad: '',
    estado: 'activo',
    recursos: [],
};

type CatalogsScreenProps = {
    onlyCatalog?: CatalogKey;
    hideHours?: boolean;
    hideSubjectResources?: boolean;
};

export default function CatalogsScreen({ onlyCatalog, hideHours = false, hideSubjectResources = false }: CatalogsScreenProps) {
    const [activeCatalog, setActiveCatalog] = useState<CatalogKey>(onlyCatalog ?? 'asignaturas');
    const [catalogData, setCatalogData] = useState<Record<CatalogKey, CatalogItem[]>>({
        carreras: [], asignaturas: [], pabellones: [], aulas: [], recursos: [],
    });
    const [resourcesByRoom, setResourcesByRoom] = useState<Record<number, number[]>>({});
    const [resourcesBySubject, setResourcesBySubject] = useState<Record<number, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [selectorField, setSelectorField] = useState<'id_carrera' | 'id_pabellon'>('id_carrera');
    const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
    const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectCareerFilter, setSubjectCareerFilter] = useState<number | null>(null);
    const [subjectYearFilter, setSubjectYearFilter] = useState<number | null>(null);

    const fetchCatalogs = useCallback(async () => {
        const emptyResult = { data: [] as CatalogItem[], error: null };
        const [careers, subjects, buildings, rooms, resources, roomResources, subjectResources] = await Promise.all([
            supabase.from('carreras').select('id_carrera, nombre').order('nombre'),
            supabase.from('asignaturas').select('id_asignatura, codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado').order('nombre'),
            hideSubjectResources ? Promise.resolve(emptyResult) : supabase.from('pabellones').select('id_pabellon, sede, nombre').order('sede').order('nombre'),
            hideSubjectResources ? Promise.resolve(emptyResult) : supabase.from('aulas').select('id_aula, codigo, id_pabellon, capacidad, tipo, estado').order('codigo'),
            hideSubjectResources ? Promise.resolve(emptyResult) : supabase.from('recursos').select('id_recurso, nombre').order('nombre'),
            hideSubjectResources ? Promise.resolve(emptyResult) : supabase.from('aula_recurso').select('id_aula, id_recurso'),
            hideSubjectResources ? Promise.resolve(emptyResult) : supabase.from('asignatura_recurso').select('id_asignatura, id_recurso'),
        ]);
        if ([careers.error, subjects.error, buildings.error, rooms.error, resources.error, roomResources.error, subjectResources.error].some(Boolean)) {
            Alert.alert('Error', 'No se pudieron cargar todos los catálogos. Intente actualizar la pantalla.');
        } else {
            const buildResourceMap = (rows: { id_aula?: number; id_asignatura?: number; id_recurso: number }[], key: 'id_aula' | 'id_asignatura') => {
                const result: Record<number, number[]> = {};
                rows.forEach((row) => {
                    const itemId = row[key];
                    if (itemId === undefined) return;
                    result[itemId] ??= [];
                    result[itemId].push(row.id_recurso);
                });
                return result;
            };
            setCatalogData({
                carreras: careers.data ?? [],
                asignaturas: subjects.data ?? [],
                pabellones: buildings.data ?? [],
                aulas: rooms.data ?? [],
                recursos: resources.data ?? [],
            });
            setResourcesByRoom(buildResourceMap((roomResources.data ?? []) as unknown as { id_aula?: number; id_asignatura?: number; id_recurso: number }[], 'id_aula'));
            setResourcesBySubject(buildResourceMap((subjectResources.data ?? []) as unknown as { id_aula?: number; id_asignatura?: number; id_recurso: number }[], 'id_asignatura'));
        }
        setLoading(false);
        setRefreshing(false);
    }, [hideSubjectResources]);

    useEffect(() => {
        void fetchCatalogs();
    }, [fetchCatalogs]);

    const careerOptions: Option[] = catalogData.carreras.map((item) => ({ id: item.id_carrera, label: item.nombre }));
    const buildingOptions: Option[] = catalogData.pabellones.map((item) => ({ id: item.id_pabellon, label: `${item.sede} · ${item.nombre}` }));
    const options = selectorField === 'id_carrera' ? careerOptions : buildingOptions;

    const openCreate = () => {
        setEditingItem(null);
        setForm(EMPTY_FORM);
        setModalVisible(true);
    };

    const openEdit = (item: CatalogItem) => {
        setEditingItem(item);
        setForm({
            ...EMPTY_FORM,
            nombre: item.nombre ?? '',
            sede: item.sede ?? '',
            codigo: item.codigo ?? '',
            tipo: item.tipo ?? 'Aula',
            id_carrera: item.id_carrera ? String(item.id_carrera) : '',
            ano_estudio: item.ano_estudio ? String(item.ano_estudio) : '',
            horas_teoricas: String(item.horas_teoricas ?? 0),
            horas_practicas: String(item.horas_practicas ?? 0),
            id_pabellon: item.id_pabellon ? String(item.id_pabellon) : '',
            capacidad: item.capacidad ? String(item.capacidad) : '',
            estado: item.estado ?? 'activo',
            recursos: ((activeCatalog === 'aulas' ? resourcesByRoom[item.id_aula] : resourcesBySubject[item.id_asignatura]) ?? []).map(String),
        });
        setModalVisible(true);
    };

    const getPayload = (): Record<string, string | number> | null => {
        const name = form.nombre.trim();
        const code = form.codigo.trim().toUpperCase();
        if (activeCatalog === 'pabellones') {
            const site = form.sede.trim();
            if (!name || name.length > 50 || !site || site.length > 150) return null;
            return { sede: site, nombre: name };
        }
        if (activeCatalog === 'recursos' || activeCatalog === 'carreras') {
            if (!name || name.length > (activeCatalog === 'carreras' ? 150 : 50)) return null;
            return { nombre: name };
        }
        if (activeCatalog === 'asignaturas') {
            const year = Number(form.ano_estudio);
            const theory = hideHours ? 0 : Number(form.horas_teoricas);
            const practice = hideHours ? 0 : Number(form.horas_practicas);
            if (!code || code.length > 20 || !name || name.length > 100 || !form.id_carrera
                || !Number.isInteger(year) || year < 1
                || !Number.isInteger(theory) || theory < 0
                || !Number.isInteger(practice) || practice < 0) return null;
            return {
                codigo: code,
                nombre: name,
                id_carrera: Number(form.id_carrera),
                ano_estudio: year,
                ...(hideHours ? {} : { horas_teoricas: theory, horas_practicas: practice }),
                estado: form.estado,
            };
        }

        const capacity = Number(form.capacidad);
        const roomType = form.tipo.trim();
        if (!code || code.length > 20 || !form.id_pabellon || !roomType || roomType.length > 80
            || !Number.isInteger(capacity) || capacity <= 0) return null;
        return { codigo: code, id_pabellon: Number(form.id_pabellon), capacidad: capacity, tipo: roomType, estado: form.estado };
    };

    const handleSave = async () => {
        const payload = getPayload();
        if (!payload) {
            Alert.alert('Revise los datos', 'Complete los campos y compruebe que los valores numéricos sean válidos.');
            return;
        }
        setSaving(true);
        const table = supabase.from(activeCatalog as any);
        const primaryKey = {
            carreras: 'id_carrera',
            asignaturas: 'id_asignatura',
            pabellones: 'id_pabellon',
            aulas: 'id_aula',
            recursos: 'id_recurso',
        }[activeCatalog];
        const result = editingItem
            ? await table.update(payload).eq(primaryKey, editingItem[primaryKey]).select(primaryKey).single()
            : await table.insert(payload).select(primaryKey).single();
        if (result.error) {
            setSaving(false);
            const message = result.error.code === '23505'
                ? 'Ya existe un registro con ese nombre o código.'
                : result.error.code === '23503'
                    ? 'Seleccione una carrera o pabellón válido.'
                    : result.error.code === '23514' && activeCatalog === 'aulas'
                        ? result.error.message.includes('capacity')
                            ? 'No puede reducir la capacidad por debajo de la cantidad de estudiantes de una sección con horario asignado.'
                            : 'Retire las asignaciones actuales del aula antes de desactivarla.'
                    : 'No se pudo guardar el registro. Revise los datos e intente de nuevo.';
            Alert.alert('Error', message);
            return;
        }
        const savedRecord = result.data as unknown as Record<string, any> | null;
        const savedId = savedRecord?.[primaryKey] ?? editingItem?.[primaryKey];
        if (savedId && activeCatalog === 'asignaturas' && !hideSubjectResources) {
            const { error } = await supabase.rpc('replace_subject_resources', {
                p_subject_id: savedId,
                p_resource_ids: form.recursos.map(Number),
            });
            if (error) {
                setSaving(false);
                await fetchCatalogs();
                Alert.alert('Asignatura guardada', error.message.includes('schedule assignments')
                    ? 'Retire primero las asignaciones de esta asignatura para cambiar sus recursos requeridos.'
                    : 'No se pudieron guardar los recursos requeridos. Abra la asignatura y vuelva a guardar.');
                return;
            }
        }
        if (savedId && activeCatalog === 'aulas') {
            const { error } = await supabase.rpc('replace_room_resources', {
                p_room_id: savedId,
                p_resource_ids: form.recursos.map(Number),
            });
            if (error) {
                setSaving(false);
                await fetchCatalogs();
                Alert.alert('Aula guardada', error.message.includes('schedule assignments')
                    ? 'Retire primero las asignaciones del aula para cambiar sus recursos.'
                    : 'No se pudieron guardar los recursos del aula. Abra el aula y vuelva a guardar.');
                return;
            }
        }
        setSaving(false);
        setModalVisible(false);
        await fetchCatalogs();
    };

    const openSelector = (field: 'id_carrera' | 'id_pabellon') => {
        const values = field === 'id_carrera' ? careerOptions : buildingOptions;
        if (!values.length) {
            Alert.alert('Falta el catálogo', `Primero registre ${field === 'id_carrera' ? 'una carrera' : 'un pabellón'}.`);
            return;
        }
        setSelectorField(field);
        setSelectorVisible(true);
    };

    const chooseOption = (option: Option) => {
        setForm((current) => ({ ...current, [selectorField]: String(option.id) }));
        setSelectorVisible(false);
    };

    const displayItem = (item: CatalogItem) => {
        if (activeCatalog === 'carreras') return item.nombre;
        if (activeCatalog === 'pabellones') return `${item.sede} · ${item.nombre}`;
        if (activeCatalog === 'recursos') return item.nombre;
        if (activeCatalog === 'asignaturas') {
            const career = catalogData.carreras.find((entry) => entry.id_carrera === item.id_carrera)?.nombre;
            const requiredResources = hideSubjectResources ? [] : (resourcesBySubject[item.id_asignatura] ?? [])
                .map((id) => catalogData.recursos.find((resource) => resource.id_recurso === id)?.nombre)
                .filter(Boolean);
            const academicReference = hideHours ? '' : ` · ${item.horas_teoricas} h teóricas · ${item.horas_practicas} h prácticas`;
            const resourceSummary = hideSubjectResources ? '' : ` · Recursos requeridos: ${requiredResources.join(', ') || 'Ninguno'}`;
            return `${item.codigo} · ${item.nombre}\n${career ?? 'Carrera'} · Año ${item.ano_estudio}${academicReference}\n${item.estado === 'activo' ? 'Activa' : 'Inactiva'}${resourceSummary}`;
        }
        const building = catalogData.pabellones.find((entry) => entry.id_pabellon === item.id_pabellon)?.nombre;
        const roomResources = (resourcesByRoom[item.id_aula] ?? [])
            .map((id) => catalogData.recursos.find((resource) => resource.id_recurso === id)?.nombre)
            .filter(Boolean);
        const site = catalogData.pabellones.find((entry) => entry.id_pabellon === item.id_pabellon)?.sede;
        return `${item.codigo} · ${item.tipo ?? 'Aula'}\n${site ?? 'Sede'} · ${building ?? 'Pabellón'}\nCapacidad: ${item.capacidad} · ${item.estado === 'activo' ? 'Activa' : 'Inactiva'}\nRecursos: ${roomResources.join(', ') || 'Ninguno'}`;
    };

    const idFieldByCatalog: Record<CatalogKey, string> = {
        carreras: 'id_carrera', asignaturas: 'id_asignatura', pabellones: 'id_pabellon', aulas: 'id_aula', recursos: 'id_recurso',
    };

    const getItemId = (item: CatalogItem) => item[idFieldByCatalog[activeCatalog]];

    const selectedRelation = () => {
        if (selectorField === 'id_carrera') return careerOptions.find((item) => item.id === Number(form.id_carrera))?.label;
        return buildingOptions.find((item) => item.id === Number(form.id_pabellon))?.label;
    };

    const renderField = (label: string, field: TextField, keyboardType: 'default' | 'number-pad' = 'default') => (
        <View style={styles.formGroup} key={field}>
            <Text style={styles.formLabel}>{label}</Text>
            <TextInput
                style={styles.input}
                value={form[field]}
                onChangeText={(value) => setForm((current) => ({ ...current, [field]: value }))}
                keyboardType={keyboardType}
                autoCapitalize={field === 'codigo' ? 'characters' : 'sentences'}
                editable={!saving}
            />
        </View>
    );

    if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>;

    const activeLabel = CATALOGS.find((item) => item.key === activeCatalog)?.singular ?? 'registro';
    const subjectYears = [...new Set(catalogData.asignaturas.map((item) => Number(item.ano_estudio)))].sort((a, b) => a - b);
    const visibleItems = activeCatalog === 'asignaturas' ? catalogData.asignaturas.filter((item) => {
        const query = subjectSearch.trim().toLocaleLowerCase();
        const matchesSearch = !query || `${item.codigo} ${item.nombre}`.toLocaleLowerCase().includes(query);
        const matchesCareer = subjectCareerFilter === null || item.id_carrera === subjectCareerFilter;
        const matchesYear = subjectYearFilter === null || item.ano_estudio === subjectYearFilter;
        return matchesSearch && matchesCareer && matchesYear;
    }) : activeCatalog === 'carreras' && subjectSearch.trim()
        ? catalogData.carreras.filter((item) => item.nombre.toLocaleLowerCase().includes(subjectSearch.trim().toLocaleLowerCase()))
        : catalogData[activeCatalog];

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {!onlyCatalog ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogTabs}>
                {CATALOGS.map((item) => (
                    <TouchableOpacity
                        key={item.key}
                        style={[styles.catalogTab, activeCatalog === item.key && styles.catalogTabActive]}
                        onPress={() => setActiveCatalog(item.key)}
                    >
                        <Text style={[styles.catalogTabText, activeCatalog === item.key && styles.catalogTabTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView> : null}
            {activeCatalog === 'carreras' ? (
                <View style={styles.filters}>
                    <TextInput
                        style={styles.searchInput}
                        value={subjectSearch}
                        onChangeText={setSubjectSearch}
                        placeholder="Buscar carrera"
                        placeholderTextColor={Colors.textTertiary}
                        returnKeyType="search"
                    />
                </View>
            ) : null}
            {activeCatalog === 'asignaturas' ? (
                <View style={styles.filters}>
                    <TextInput
                        style={styles.searchInput}
                        value={subjectSearch}
                        onChangeText={setSubjectSearch}
                        placeholder="Buscar por código o nombre"
                        placeholderTextColor={Colors.textTertiary}
                        returnKeyType="search"
                    />
                    <Text style={styles.filterLabel}>Carrera</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                        <TouchableOpacity style={[styles.filterChip, subjectCareerFilter === null && styles.filterChipActive]} onPress={() => setSubjectCareerFilter(null)}>
                            <Text style={[styles.filterChipText, subjectCareerFilter === null && styles.filterChipTextActive]}>Todas</Text>
                        </TouchableOpacity>
                        {careerOptions.map((option) => (
                            <TouchableOpacity key={option.id} style={[styles.filterChip, subjectCareerFilter === option.id && styles.filterChipActive]} onPress={() => setSubjectCareerFilter(option.id)}>
                                <Text style={[styles.filterChipText, subjectCareerFilter === option.id && styles.filterChipTextActive]}>{option.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <Text style={styles.filterLabel}>Año de estudio</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                        <TouchableOpacity style={[styles.filterChip, subjectYearFilter === null && styles.filterChipActive]} onPress={() => setSubjectYearFilter(null)}>
                            <Text style={[styles.filterChipText, subjectYearFilter === null && styles.filterChipTextActive]}>Todos</Text>
                        </TouchableOpacity>
                        {subjectYears.map((year) => (
                            <TouchableOpacity key={year} style={[styles.filterChip, subjectYearFilter === year && styles.filterChipActive]} onPress={() => setSubjectYearFilter(year)}>
                                <Text style={[styles.filterChipText, subjectYearFilter === year && styles.filterChipTextActive]}>Año {year}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            ) : null}
            {activeCatalog === 'aulas' ? (
                <View style={styles.importBanner}>
                    <View style={styles.importCopy}>
                        <Text style={styles.importTitle}>Inventario oficial</Text>
                        <Text style={styles.helperText}>Valide y cargue espacios desde Excel o CSV.</Text>
                    </View>
                    <Link href="/(admin)/inventory-import" asChild>
                        <TouchableOpacity style={styles.importButton}>
                            <Text style={styles.importButtonText}>Importar</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            ) : null}
            <FlatList
                data={visibleItems}
                keyExtractor={(item) => String(getItemId(item))}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchCatalogs(); }} />}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.itemText}>{displayItem(item)}</Text>
                        <TouchableOpacity style={styles.editButton} onPress={() => openEdit(item)}>
                            <Text style={styles.editText}>Editar</Text>
                        </TouchableOpacity>
                    </View>
                )}
                ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{activeCatalog === 'asignaturas' && catalogData.asignaturas.length ? 'No hay asignaturas que coincidan con los filtros.' : `No hay ${CATALOGS.find((item) => item.key === activeCatalog)?.label.toLowerCase()} registradas`}</Text></View>}
            />
            <TouchableOpacity style={styles.fab} onPress={openCreate}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{editingItem ? 'Editar' : 'Nueva'} {activeLabel}</Text>
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {activeCatalog === 'carreras' || activeCatalog === 'pabellones' || activeCatalog === 'recursos'
                                ? renderField('Nombre', 'nombre')
                                : null}
                            {activeCatalog === 'pabellones' ? renderField('Sede', 'sede') : null}
                            {activeCatalog === 'asignaturas' ? (
                                <>
                                    {renderField('Código', 'codigo')}
                                    {renderField('Nombre', 'nombre')}
                                    <View style={styles.formGroup}>
                                        <Text style={styles.formLabel}>Carrera</Text>
                                        <TouchableOpacity style={styles.selectButton} onPress={() => openSelector('id_carrera')}>
                                            <Text style={selectedRelation() ? styles.selectText : styles.placeholderText}>{selectedRelation() ?? 'Seleccionar carrera'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {renderField('Año de estudio', 'ano_estudio', 'number-pad')}
                                    {!hideHours ? renderField('Horas teóricas', 'horas_teoricas', 'number-pad') : null}
                                    {!hideHours ? renderField('Horas prácticas', 'horas_practicas', 'number-pad') : null}
                                    <View style={styles.switchRow}>
                                        <Text style={styles.formLabel}>Asignatura activa</Text>
                                        <Switch value={form.estado === 'activo'} onValueChange={(value) => setForm((current) => ({ ...current, estado: value ? 'activo' : 'inactivo' }))} />
                                    </View>
                                    {!hideSubjectResources ? <Text style={styles.helperText}>Recursos obligatorios para asignar esta asignatura a un aula</Text> : null}
                                    {!hideSubjectResources && catalogData.recursos.length ? catalogData.recursos.map((resource) => (
                                        <View key={resource.id_recurso} style={styles.resourceRow}>
                                            <Text style={styles.resourceName}>{resource.nombre}</Text>
                                            <Switch
                                                value={form.recursos.includes(String(resource.id_recurso))}
                                                onValueChange={(value) => setForm((current) => ({
                                                    ...current,
                                                    recursos: value
                                                        ? [...new Set([...current.recursos, String(resource.id_recurso)])]
                                                        : current.recursos.filter((id) => id !== String(resource.id_recurso)),
                                                }))}
                                            />
                                        </View>
                                    )) : !hideSubjectResources ? <Text style={styles.helperText}>Primero registre los recursos desde la pestaña Recursos.</Text> : null}
                                </>
                            ) : null}
                            {activeCatalog === 'aulas' ? (
                                <>
                                    {renderField('Código', 'codigo')}
                                    {renderField('Tipo de espacio', 'tipo')}
                                    <View style={styles.formGroup}>
                                        <Text style={styles.formLabel}>Pabellón</Text>
                                        <TouchableOpacity style={styles.selectButton} onPress={() => openSelector('id_pabellon')}>
                                            <Text style={selectedRelation() ? styles.selectText : styles.placeholderText}>{selectedRelation() ?? 'Seleccionar pabellón'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {renderField('Capacidad', 'capacidad', 'number-pad')}
                                    <View style={styles.switchRow}>
                                        <Text style={styles.formLabel}>Aula activa</Text>
                                        <Switch value={form.estado === 'activo'} onValueChange={(value) => setForm((current) => ({ ...current, estado: value ? 'activo' : 'inactivo' }))} />
                                    </View>
                                    <Text style={styles.helperText}>Recursos disponibles en esta aula</Text>
                                    {catalogData.recursos.length ? catalogData.recursos.map((resource) => (
                                        <View key={resource.id_recurso} style={styles.resourceRow}>
                                            <Text style={styles.resourceName}>{resource.nombre}</Text>
                                            <Switch
                                                value={form.recursos.includes(String(resource.id_recurso))}
                                                onValueChange={(value) => setForm((current) => ({
                                                    ...current,
                                                    recursos: value
                                                        ? [...new Set([...current.recursos, String(resource.id_recurso)])]
                                                        : current.recursos.filter((id) => id !== String(resource.id_recurso)),
                                                }))}
                                            />
                                        </View>
                                    )) : <Text style={styles.helperText}>Registre los recursos compartidos que pueden equipar las aulas.</Text>}
                                </>
                            ) : null}
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)} disabled={saving}>
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={() => void handleSave()} disabled={saving}>
                                {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.saveText}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={selectorVisible} transparent animationType="fade" onRequestClose={() => setSelectorVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.selectorCard}>
                        <Text style={styles.modalTitle}>Seleccionar {selectorField === 'id_carrera' ? 'carrera' : 'pabellón'}</Text>
                        <FlatList
                            data={options}
                            keyExtractor={(item) => String(item.id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.optionButton} onPress={() => chooseOption(item)}>
                                    <Text style={styles.optionText}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectorVisible(false)}>
                            <Text style={styles.cancelText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    centered: { alignItems: 'center', backgroundColor: Colors.background, flex: 1, justifyContent: 'center' },
    catalogTabs: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    catalogTab: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    catalogTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    catalogTabText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    catalogTabTextActive: { color: Colors.white },
    filters: { backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
    importBanner: { alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.md },
    importCopy: { flex: 1, paddingRight: Spacing.sm },
    importTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    importButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.sm, justifyContent: 'center', minHeight: 40, paddingHorizontal: Spacing.md },
    importButtonText: { color: Colors.white, fontSize: Typography.sizes.xs, fontWeight: '700' },
    searchInput: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, fontSize: Typography.sizes.sm, minHeight: 44, paddingHorizontal: Spacing.md },
    filterLabel: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginTop: Spacing.sm },
    filterChips: { gap: Spacing.sm, paddingVertical: Spacing.xs },
    filterChip: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterChipText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs },
    filterChipTextActive: { color: Colors.white, fontWeight: '700' },
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, flexGrow: 1 },
    card: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, flexDirection: 'row', marginBottom: Spacing.md, padding: Spacing.lg, ...Shadows.sm },
    itemText: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5 },
    editButton: { backgroundColor: Colors.primary + '10', borderRadius: BorderRadius.sm, marginLeft: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    editText: { color: Colors.primary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.lg, padding: Spacing.xl },
    emptyTitle: { color: Colors.textSecondary, fontSize: Typography.sizes.md, textAlign: 'center' },
    fab: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 28, bottom: Spacing.xxl, height: 56, justifyContent: 'center', position: 'absolute', right: Spacing.xl, width: 56, ...Shadows.lg },
    fabText: { color: Colors.white, fontSize: 30, fontWeight: '300', marginTop: -2 },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '88%', padding: Spacing.xl },
    selectorCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, margin: Spacing.lg, maxHeight: '75%', padding: Spacing.xl },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.lg, fontWeight: '700', marginBottom: Spacing.lg, textAlign: 'center' },
    formGroup: { marginBottom: Spacing.md },
    switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
    resourceRow: { alignItems: 'center', borderBottomColor: Colors.borderLight, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
    resourceName: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    helperText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, paddingVertical: Spacing.sm },
    formLabel: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '700', marginBottom: Spacing.xs, textTransform: 'uppercase' },
    input: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, color: Colors.textPrimary, fontSize: Typography.sizes.md, minHeight: 46, paddingHorizontal: Spacing.md },
    selectButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: Spacing.md },
    selectText: { color: Colors.textPrimary, flex: 1, fontSize: Typography.sizes.sm },
    placeholderText: { color: Colors.textTertiary, flex: 1, fontSize: Typography.sizes.sm },
    modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
    cancelButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.md, paddingVertical: Spacing.md },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
    saveButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, flex: 1, justifyContent: 'center', marginTop: Spacing.md, minHeight: 46, paddingVertical: Spacing.md },
    saveText: { color: Colors.white, fontSize: Typography.sizes.sm, fontWeight: '700' },
    optionButton: { borderBottomColor: Colors.borderLight, borderBottomWidth: 1, paddingVertical: Spacing.md },
    optionText: { color: Colors.textPrimary, fontSize: Typography.sizes.md },
});

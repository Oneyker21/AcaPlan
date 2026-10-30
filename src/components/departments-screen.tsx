import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Asignatura, Departamento, Usuario } from '@/types/database';
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

export default function DepartmentsScreen() {
    const [departments, setDepartments] = useState<Departamento[]>([]);
    const [subjects, setSubjects] = useState<Asignatura[]>([]);
    const [heads, setHeads] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal state
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [selectedDept, setSelectedDept] = useState<Departamento | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [newDeptName, setNewDeptName] = useState('');
    const [selectedHeadId, setSelectedHeadId] = useState<number | null>(null);
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        try {
            // First try calling the RPC pwa_jefatura_academica
            const { data: rpcDepts, error: rpcError } = await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.list',
                payload: {},
            });

            let deptsList: Departamento[] = [];

            if (!rpcError && Array.isArray(rpcDepts)) {
                deptsList = rpcDepts.map((d: any) => ({
                    id_departamento: d.id_departamento,
                    nombre: d.nombre,
                    activo: d.activo,
                    id_jefe: d.id_jefe ?? null,
                    jefe_nombre: d.jefe_nombre ?? null,
                    id_asignaturas: d.id_asignaturas ?? [],
                    componentes: d.componentes ?? [],
                }));
            } else {
                // Fallback: direct table queries if migration created the tables
                const { data: rawDepts, error: deptsError } = await supabase
                    .from('pwa_departamentos')
                    .select('id_departamento, nombre, activo')
                    .order('nombre');

                if (deptsError) {
                    console.warn('[DEPARTAMENTOS] Tablas de departamentos aún no creadas en Supabase.');
                    setDepartments([]);
                    setLoading(false);
                    setRefreshing(false);
                    return;
                }

                const [{ data: jefaturas }, { data: deptSubjects }] = await Promise.all([
                    supabase.from('pwa_departamento_jefaturas').select('id_departamento, id_usuario'),
                    supabase.from('pwa_departamento_asignaturas').select('id_departamento, id_asignatura'),
                ]);

                const jefaturasMap: Record<number, number> = {};
                (jefaturas ?? []).forEach((j: any) => { jefaturasMap[j.id_departamento] = j.id_usuario; });

                const subjectsMap: Record<number, number[]> = {};
                (deptSubjects ?? []).forEach((s: any) => {
                    (subjectsMap[s.id_departamento] ??= []).push(s.id_asignatura);
                });

                deptsList = (rawDepts ?? []).map((d: any) => ({
                    id_departamento: d.id_departamento,
                    nombre: d.nombre,
                    activo: d.activo,
                    id_jefe: jefaturasMap[d.id_departamento] ?? null,
                    id_asignaturas: subjectsMap[d.id_departamento] ?? [],
                }));
            }

            // Load subjects and eligible heads of department
            const [{ data: rawSubjects }, { data: eligibleUsers }] = await Promise.all([
                supabase.from('asignaturas').select('id_asignatura, codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado').eq('estado', 'activo').order('codigo'),
                supabase.from('usuarios').select('id_usuario, nombre, correo, cedula, rol, estado').eq('estado', 'activo').order('nombre'),
            ]);

            setDepartments(deptsList);
            setSubjects((rawSubjects as Asignatura[]) ?? []);
            // Users eligible for head of department: rol === 'jefatura' or rol === 'docente'
            setHeads(((eligibleUsers as Usuario[]) ?? []).filter((u) => u.rol === 'jefatura' || u.rol === 'docente'));
        } catch (err: any) {
            console.error('[DEPARTAMENTOS] Error al cargar datos:', err);
            Alert.alert('Error', 'No se pudieron cargar los departamentos. Verifique la conexión a Supabase.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleCreateDepartment = async () => {
        if (!newDeptName.trim()) {
            Alert.alert('Validación', 'Ingrese el nombre del departamento.');
            return;
        }

        setSaving(true);
        try {
            // Try via RPC first
            const { error: rpcError } = await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.save',
                payload: { nombre: newDeptName.trim() },
            });

            if (rpcError) {
                // Try direct insert
                const { error: insertError } = await supabase
                    .from('pwa_departamentos')
                    .insert({ nombre: newDeptName.trim() });
                if (insertError) throw insertError;
            }

            Alert.alert('Éxito', 'Departamento creado correctamente.');
            setNewDeptName('');
            setCreateModalVisible(false);
            await loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo crear el departamento.');
        } finally {
            setSaving(false);
        }
    };

    const handleOpenEdit = (dept: Departamento) => {
        setSelectedDept(dept);
        setNameInput(dept.nombre);
        setSelectedHeadId(dept.id_jefe ?? null);
        setSelectedSubjectIds(dept.id_asignaturas ?? []);
        setSubjectSearch('');
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (!selectedDept || !nameInput.trim()) return;

        setSaving(true);
        try {
            // Update department name and status
            const { error: updateError } = await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.save',
                payload: {
                    id: selectedDept.id_departamento,
                    nombre: nameInput.trim(),
                    activo: selectedDept.activo,
                },
            });

            if (updateError) {
                // Fallback direct
                await supabase
                    .from('pwa_departamentos')
                    .update({ nombre: nameInput.trim(), activo: selectedDept.activo })
                    .eq('id_departamento', selectedDept.id_departamento);
            }

            // Assign head
            await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.assign_head',
                payload: {
                    id_departamento: selectedDept.id_departamento,
                    id_usuario: selectedHeadId,
                },
            });

            // Assign subjects
            await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.set_subjects',
                payload: {
                    id_departamento: selectedDept.id_departamento,
                    id_asignaturas: selectedSubjectIds,
                },
            });

            Alert.alert('Éxito', 'Departamento actualizado correctamente.');
            setEditModalVisible(false);
            await loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo actualizar el departamento.');
        } finally {
            setSaving(false);
        }
    };

    const toggleSubject = (id: number) => {
        setSelectedSubjectIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const filteredDepartments = departments.filter((dept) =>
        dept.nombre.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredSubjects = subjects.filter(
        (s) =>
            s.nombre.toLowerCase().includes(subjectSearch.toLowerCase()) ||
            s.codigo.toLowerCase().includes(subjectSearch.toLowerCase())
    );

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* Header / Actions Bar */}
            <View style={styles.headerBar}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar departamento..."
                    placeholderTextColor={Colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => setCreateModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.createButtonText}>+ Nuevo</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Cargando departamentos...</Text>
                </View>
            ) : filteredDepartments.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.emptyContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void loadData();
                            }}
                        />
                    }
                >
                    <Text style={styles.emptyIcon}>🏛️</Text>
                    <Text style={styles.emptyTitle}>Sin departamentos registrados</Text>
                    <Text style={styles.emptyDesc}>
                        Cree el primer departamento académico para asignar jefaturas y componentes.
                    </Text>
                    <TouchableOpacity
                        style={styles.emptyButton}
                        onPress={() => setCreateModalVisible(true)}
                    >
                        <Text style={styles.emptyButtonText}>Crear departamento</Text>
                    </TouchableOpacity>
                </ScrollView>
            ) : (
                <FlatList
                    data={filteredDepartments}
                    keyExtractor={(item) => String(item.id_departamento)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void loadData();
                            }}
                        />
                    }
                    renderItem={({ item }) => {
                        const headUser = heads.find((h) => h.id_usuario === item.id_jefe);
                        return (
                            <TouchableOpacity
                                style={styles.card}
                                onPress={() => handleOpenEdit(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>{item.nombre}</Text>
                                    <View
                                        style={[
                                            styles.badge,
                                            item.activo ? styles.badgeActive : styles.badgeInactive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.badgeText,
                                                item.activo
                                                    ? styles.badgeTextActive
                                                    : styles.badgeTextInactive,
                                            ]}
                                        >
                                            {item.activo ? 'Activo' : 'Inactivo'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.cardInfoRow}>
                                    <Text style={styles.infoLabel}>Jefatura:</Text>
                                    <Text style={styles.infoValue}>
                                        {headUser?.nombre || item.jefe_nombre || 'Sin jefatura asignada'}
                                    </Text>
                                </View>

                                <View style={styles.cardInfoRow}>
                                    <Text style={styles.infoLabel}>Componentes:</Text>
                                    <Text style={styles.infoValue}>
                                        {item.id_asignaturas?.length || 0} asignaturas vinculadas
                                    </Text>
                                </View>

                                <View style={styles.cardFooter}>
                                    <Text style={styles.cardActionText}>Editar departamento ›</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {/* Modal: Crear Departamento */}
            <Modal visible={createModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Nuevo Departamento</Text>
                        <Text style={styles.modalSubtitle}>
                            Ingrese el nombre institucional del departamento académico.
                        </Text>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Ej.: Ciencias Básicas o Humanidades"
                            placeholderTextColor={Colors.textTertiary}
                            value={newDeptName}
                            onChangeText={setNewDeptName}
                            maxLength={100}
                        />

                        <View style={styles.modalButtonsRow}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => setCreateModalVisible(false)}
                                disabled={saving}
                            >
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveButton, saving && styles.buttonDisabled]}
                                onPress={handleCreateDepartment}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color={Colors.white} />
                                ) : (
                                    <Text style={styles.saveButtonText}>Crear</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal: Editar Departamento, Jefatura y Asignaturas */}
            <Modal visible={editModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>Editar Departamento</Text>

                            {/* Nombre */}
                            <Text style={styles.fieldLabel}>Nombre del departamento</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={nameInput}
                                onChangeText={setNameInput}
                                maxLength={100}
                            />

                            {/* Estado Activo */}
                            <View style={styles.switchRow}>
                                <Text style={styles.fieldLabel}>Departamento activo</Text>
                                <Switch
                                    value={selectedDept?.activo ?? true}
                                    onValueChange={(val) =>
                                        setSelectedDept((prev) => (prev ? { ...prev, activo: val } : null))
                                    }
                                    trackColor={{ false: Colors.border, true: Colors.primary }}
                                />
                            </View>

                            {/* Asignar Jefatura */}
                            <Text style={styles.fieldLabel}>Jefatura asignada</Text>
                            <View style={styles.pickerBox}>
                                <TouchableOpacity
                                    style={[
                                        styles.pickerItem,
                                        selectedHeadId === null && styles.pickerItemSelected,
                                    ]}
                                    onPress={() => setSelectedHeadId(null)}
                                >
                                    <Text
                                        style={[
                                            styles.pickerItemText,
                                            selectedHeadId === null && styles.pickerItemTextSelected,
                                        ]}
                                    >
                                        -- Sin jefatura asignada --
                                    </Text>
                                </TouchableOpacity>
                                {heads.map((head) => (
                                    <TouchableOpacity
                                        key={head.id_usuario}
                                        style={[
                                            styles.pickerItem,
                                            selectedHeadId === head.id_usuario &&
                                                styles.pickerItemSelected,
                                        ]}
                                        onPress={() => setSelectedHeadId(head.id_usuario)}
                                    >
                                        <Text
                                            style={[
                                                styles.pickerItemText,
                                                selectedHeadId === head.id_usuario &&
                                                    styles.pickerItemTextSelected,
                                            ]}
                                        >
                                            {head.nombre} ({head.correo})
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Asignaturas del Departamento */}
                            <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>
                                Componentes del departamento ({selectedSubjectIds.length} seleccionados)
                            </Text>
                            <TextInput
                                style={[styles.modalInput, { marginBottom: Spacing.sm }]}
                                placeholder="Filtrar asignaturas por código o nombre..."
                                placeholderTextColor={Colors.textTertiary}
                                value={subjectSearch}
                                onChangeText={setSubjectSearch}
                            />

                            <View style={styles.subjectsContainer}>
                                {filteredSubjects.map((sub) => {
                                    const isChecked = selectedSubjectIds.includes(sub.id_asignatura);
                                    return (
                                        <TouchableOpacity
                                            key={sub.id_asignatura}
                                            style={[
                                                styles.subjectRow,
                                                isChecked && styles.subjectRowSelected,
                                            ]}
                                            onPress={() => toggleSubject(sub.id_asignatura)}
                                            activeOpacity={0.7}
                                        >
                                            <View
                                                style={[
                                                    styles.checkbox,
                                                    isChecked && styles.checkboxChecked,
                                                ]}
                                            >
                                                {isChecked && (
                                                    <Text style={styles.checkboxCheck}>✓</Text>
                                                )}
                                            </View>
                                            <View style={styles.subjectTextCol}>
                                                <Text style={styles.subjectCode}>{sub.codigo}</Text>
                                                <Text style={styles.subjectName}>{sub.nombre}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <View style={styles.modalButtonsRow}>
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() => setEditModalVisible(false)}
                                    disabled={saving}
                                >
                                    <Text style={styles.cancelButtonText}>Cerrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.saveButton, saving && styles.buttonDisabled]}
                                    onPress={handleSaveEdit}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <ActivityIndicator color={Colors.white} />
                                    ) : (
                                        <Text style={styles.saveButtonText}>Guardar cambios</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    headerBar: {
        flexDirection: 'row',
        padding: Spacing.md,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        alignItems: 'center',
        gap: Spacing.sm,
    },
    searchInput: {
        flex: 1,
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    createButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 4,
    },
    createButtonText: {
        color: Colors.white,
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    loadingText: {
        marginTop: Spacing.md,
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },
    listContent: {
        padding: Spacing.md,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    cardTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
        flex: 1,
    },
    badge: {
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
    },
    badgeActive: {
        backgroundColor: '#DCFCE7',
    },
    badgeInactive: {
        backgroundColor: '#FEE2E2',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    badgeTextActive: {
        color: '#15803D',
    },
    badgeTextInactive: {
        color: '#B91C1C',
    },
    cardInfoRow: {
        flexDirection: 'row',
        marginTop: Spacing.xs,
    },
    infoLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textSecondary,
        width: 100,
    },
    infoValue: {
        fontSize: Typography.sizes.xs,
        color: Colors.textPrimary,
        flex: 1,
    },
    cardFooter: {
        marginTop: Spacing.md,
        paddingTop: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        alignItems: 'flex-end',
    },
    cardActionText: {
        color: Colors.primary,
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xxl,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    emptyDesc: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    emptyButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
    },
    emptyButtonText: {
        color: Colors.white,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        ...Shadows.lg,
    },
    modalTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    modalSubtitle: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginBottom: Spacing.lg,
    },
    fieldLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: Spacing.xs,
        textTransform: 'uppercase',
    },
    modalInput: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: Spacing.md,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: Spacing.sm,
    },
    pickerBox: {
        maxHeight: 140,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
    },
    pickerItem: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    pickerItemSelected: {
        backgroundColor: '#EBF5FF',
    },
    pickerItemText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textPrimary,
    },
    pickerItemTextSelected: {
        color: Colors.primary,
        fontWeight: '700',
    },
    subjectsContainer: {
        maxHeight: 200,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
        marginBottom: Spacing.lg,
    },
    subjectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    subjectRowSelected: {
        backgroundColor: '#F0F9FF',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.sm,
    },
    checkboxChecked: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    checkboxCheck: {
        color: Colors.white,
        fontSize: 12,
        fontWeight: '700',
    },
    subjectTextCol: {
        flex: 1,
    },
    subjectCode: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
    },
    subjectName: {
        fontSize: Typography.sizes.xs,
        color: Colors.textPrimary,
    },
    modalButtonsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
        marginTop: Spacing.md,
    },
    cancelButton: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 4,
    },
    cancelButtonText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.sm + 4,
    },
    saveButtonText: {
        color: Colors.white,
        fontSize: Typography.sizes.sm,
        fontWeight: '700',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
});

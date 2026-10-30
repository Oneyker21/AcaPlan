import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Asignatura, Departamento, DocenteDepartamento, TipoDocente } from '@/types/database';
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

export default function DepartmentTeachersScreen() {
    const { profile } = useAuth();
    const [department, setDepartment] = useState<Departamento | null>(null);
    const [teachers, setTeachers] = useState<DocenteDepartamento[]>([]);
    const [deptSubjects, setDeptSubjects] = useState<Asignatura[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal state for creating / editing
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTeacher, setEditingTeacher] = useState<DocenteDepartamento | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [cedulaInput, setCedulaInput] = useState('');
    const [typeInput, setTypeInput] = useState<TipoDocente>('planta');
    const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);

    // Modal for displaying temporary credentials
    const [credentialsModal, setCredentialsModal] = useState<{
        nombre: string;
        correo: string;
        claveTemporal?: string;
    } | null>(null);

    const loadDepartmentData = useCallback(async () => {
        if (!profile) return;
        try {
            // Busca el departamento asociado al usuario que tiene sesión iniciada.
            // Primero consulta la función de administración académica.
            const { data: depts, error: deptsError } = await supabase.rpc('pwa_jefatura_academica', {
                action: 'departments.list',
                payload: {},
            });

            let currentDept: Departamento | null = null;

            if (!deptsError && Array.isArray(depts)) {
                // If user is jefe, find their department; if admin, pick the first department or allow selecting
                currentDept = depts.find((d: any) => d.id_jefe === profile.id_usuario) || depts[0] || null;
            } else {
                // Si la consulta anterior falla, intenta obtener la jefatura directamente.
                const { data: rawJefatura } = await supabase
                    .from('pwa_departamento_jefaturas')
                    .select('id_departamento')
                    .eq('id_usuario', profile.id_usuario)
                    .maybeSingle();

                const deptId = rawJefatura?.id_departamento;
                if (deptId) {
                    const { data: deptRow } = await supabase
                        .from('pwa_departamentos')
                        .select('id_departamento, nombre, activo')
                        .eq('id_departamento', deptId)
                        .maybeSingle();
                    if (deptRow) currentDept = deptRow as Departamento;
                }
            }

            if (!currentDept) {
                setDepartment(null);
                setTeachers([]);
                setDeptSubjects([]);
                setLoading(false);
                setRefreshing(false);
                return;
            }

            setDepartment(currentDept);

            // Fetch teachers in this department via RPC
            const { data: teacherRows } = await supabase.rpc('pwa_jefatura_academica', {
                action: 'teachers.list',
                payload: { id_departamento: currentDept.id_departamento },
            });

            if (Array.isArray(teacherRows)) {
                setTeachers(teacherRows as DocenteDepartamento[]);
            } else {
                setTeachers([]);
            }

            // Fetch the subjects assigned to this department
            const { data: assignedLinks } = await supabase
                .from('pwa_departamento_asignaturas')
                .select('id_asignatura')
                .eq('id_departamento', currentDept.id_departamento);

            const subjectIds = (assignedLinks ?? []).map((l: any) => l.id_asignatura);
            if (subjectIds.length > 0) {
                const { data: subjectDetails } = await supabase
                    .from('asignaturas')
                    .select('id_asignatura, codigo, nombre, id_carrera, ano_estudio, horas_teoricas, horas_practicas, estado')
                    .in('id_asignatura', subjectIds)
                    .eq('estado', 'activo')
                    .order('codigo');
                setDeptSubjects((subjectDetails as Asignatura[]) ?? []);
            } else {
                setDeptSubjects([]);
            }
        } catch (err: any) {
            console.error('[DOCENTES_DPTO] Error al cargar datos:', err);
            Alert.alert('Error', 'No se pudieron cargar los docentes del departamento.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [profile]);

    useEffect(() => {
        void loadDepartmentData();
    }, [loadDepartmentData]);

    const openCreateModal = () => {
        setEditingTeacher(null);
        setNameInput('');
        setEmailInput('');
        setCedulaInput('');
        setTypeInput('planta');
        setSelectedSubjectIds([]);
        setModalVisible(true);
    };

    const openEditTeacher = (teacher: DocenteDepartamento) => {
        setEditingTeacher(teacher);
        setNameInput(teacher.nombre);
        setEmailInput(teacher.correo);
        setCedulaInput(teacher.cedula ?? '');
        setTypeInput(teacher.tipo_docente ?? 'planta');
        setSelectedSubjectIds(teacher.componentes.map((c) => c.id_asignatura));
        setModalVisible(true);
    };

    const toggleSubject = (id: number) => {
        setSelectedSubjectIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleSaveTeacher = async () => {
        if (!department) return;
        if (selectedSubjectIds.length === 0) {
            Alert.alert('Validación', 'Debe seleccionar al menos una asignatura para el docente.');
            return;
        }

        setSaving(true);
        try {
            if (editingTeacher) {
                // Editing subjects for existing teacher
                const { error: editError } = await supabase.rpc('pwa_jefatura_academica', {
                    action: 'teachers.set_subjects',
                    payload: {
                        id_departamento: department.id_departamento,
                        id_docente: editingTeacher.id_docente,
                        id_asignaturas: selectedSubjectIds,
                    },
                });

                if (editError) throw editError;
                Alert.alert('Éxito', 'Componentes del docente actualizados.');
            } else {
                // Creating or linking a teacher
                if (!nameInput.trim() || !emailInput.trim() || !cedulaInput.trim()) {
                    Alert.alert('Validación', 'Complete el nombre, correo y cédula del docente.');
                    setSaving(false);
                    return;
                }

                // First attempt to link existing account
                const { data: linkResult, error: linkError } = await supabase.rpc('pwa_jefatura_academica', {
                    action: 'teachers.link_existing',
                    payload: {
                        id_departamento: department.id_departamento,
                        nombre: nameInput.trim(),
                        correo: emailInput.trim().toLowerCase(),
                        cedula: cedulaInput.trim(),
                        tipo_docente: typeInput,
                        id_asignaturas: selectedSubjectIds,
                    },
                });

                if (!linkError && linkResult?.vinculado) {
                    Alert.alert('Éxito', 'Cuenta docente existente vinculada al departamento.');
                    // Call teachers.create via RPC
                    const { data: createData, error: createError } = await supabase.rpc('pwa_jefatura_academica', {
                        action: 'teachers.create',
                        payload: {
                            id_departamento: department.id_departamento,
                            nombre: nameInput.trim(),
                            correo: emailInput.trim().toLowerCase(),
                            cedula: cedulaInput.trim(),
                            tipo_docente: typeInput,
                            id_asignaturas: selectedSubjectIds,
                        },
                    });

                    if (createError) throw createError;

                    if (createData && (createData as any).clave_temporal) {
                        setCredentialsModal({
                            nombre: nameInput.trim(),
                            correo: emailInput.trim().toLowerCase(),
                            claveTemporal: (createData as any).clave_temporal,
                        });
                    } else {
                        Alert.alert('Éxito', 'Docente registrado en el departamento.');
                    }
                }
            }

            setModalVisible(false);
            await loadDepartmentData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo guardar la información del docente.');
        } finally {
            setSaving(false);
        }
    };

    const filteredTeachers = teachers.filter(
        (t) =>
            t.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.correo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.cedula && t.cedula.includes(searchQuery))
    );

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* Header / Department Banner */}
            <View style={styles.deptBanner}>
                <View style={styles.deptIconBadge}>
                    <Text style={styles.deptIcon}>🏫</Text>
                </View>
                <View style={styles.deptInfo}>
                    <Text style={styles.deptKicker}>Departamento Asignado</Text>
                    <Text style={styles.deptTitle}>
                        {department ? department.nombre : 'Sin departamento asignado'}
                    </Text>
                </View>
            </View>

            {/* Actions Bar */}
            <View style={styles.headerBar}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar docente por nombre o cédula..."
                    placeholderTextColor={Colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={openCreateModal}
                    activeOpacity={0.8}
                    disabled={!department}
                >
                    <Text style={styles.createButtonText}>+ Agregar</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Cargando docentes del departamento...</Text>
                </View>
            ) : !department ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>⚠️</Text>
                    <Text style={styles.emptyTitle}>Sin departamento asignado</Text>
                    <Text style={styles.emptyDesc}>
                        Su cuenta no tiene un departamento asignado actualmente. Contacte a la Administración.
                    </Text>
                </View>
            ) : filteredTeachers.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.emptyContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void loadDepartmentData();
                            }}
                        />
                    }
                >
                    <Text style={styles.emptyIcon}>👩‍🏫</Text>
                    <Text style={styles.emptyTitle}>Sin docentes vinculados</Text>
                    <Text style={styles.emptyDesc}>
                        Agregue los docentes que imparten componentes en {department.nombre}.
                    </Text>
                    <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
                        <Text style={styles.emptyButtonText}>Agregar docente</Text>
                    </TouchableOpacity>
                </ScrollView>
            ) : (
                <FlatList
                    data={filteredTeachers}
                    keyExtractor={(item) => String(item.id_docente)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void loadDepartmentData();
                            }}
                        />
                    }
                    renderItem={({ item }) => {
                        const isPlanta = item.tipo_docente === 'planta';
                        return (
                            <TouchableOpacity
                                style={styles.card}
                                onPress={() => openEditTeacher(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.cardHeader}>
                                    <View style={styles.nameRow}>
                                        <Text style={styles.cardTitle}>{item.nombre}</Text>
                                        <Text style={styles.cardSubtitle}>
                                            {item.correo} {item.cedula ? `· ${item.cedula}` : ''}
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.badge,
                                            isPlanta ? styles.badgePlanta : styles.badgeHorario,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.badgeText,
                                                isPlanta ? styles.badgeTextPlanta : styles.badgeTextHorario,
                                            ]}
                                        >
                                            {isPlanta ? 'Planta' : 'Por Horario'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.componentsSection}>
                                    <Text style={styles.componentsLabel}>
                                        Componentes impartidos ({item.componentes?.length || 0}):
                                    </Text>
                                    <View style={styles.chipsRow}>
                                        {(item.componentes ?? []).map((comp) => (
                                            <View key={comp.id_asignatura} style={styles.chip}>
                                                <Text style={styles.chipText}>
                                                    {comp.codigo} · {comp.nombre}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.cardFooter}>
                                    <Text style={styles.cardActionText}>Editar componentes ›</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {/* Modal: Crear / Editar Docente */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>
                                {editingTeacher ? 'Editar Componentes del Docente' : 'Registrar Docente'}
                            </Text>
                            <Text style={styles.modalSubtitle}>
                                {editingTeacher
                                    ? `Actualice las asignaturas asignadas a ${editingTeacher.nombre}.`
                                    : `Vincule un docente a ${department?.nombre ?? 'este departamento'}.`}
                            </Text>

                            {!editingTeacher && (
                                <>
                                    <Text style={styles.fieldLabel}>Nombre completo</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="Ej.: Juan Pérez González"
                                        placeholderTextColor={Colors.textTertiary}
                                        value={nameInput}
                                        onChangeText={setNameInput}
                                    />

                                    <Text style={styles.fieldLabel}>Correo institucional</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="correo@unan.edu.ni"
                                        placeholderTextColor={Colors.textTertiary}
                                        value={emailInput}
                                        onChangeText={setEmailInput}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.fieldLabel}>Cédula de identidad</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="000-000000-0000A"
                                        placeholderTextColor={Colors.textTertiary}
                                        value={cedulaInput}
                                        onChangeText={setCedulaInput}
                                        autoCapitalize="characters"
                                    />

                                    <Text style={styles.fieldLabel}>Tipo de vinculación</Text>
                                    <View style={styles.typeSelectorRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.typeButton,
                                                typeInput === 'planta' && styles.typeButtonSelected,
                                            ]}
                                            onPress={() => setTypeInput('planta')}
                                        >
                                            <Text
                                                style={[
                                                    styles.typeButtonText,
                                                    typeInput === 'planta' && styles.typeButtonTextSelected,
                                                ]}
                                            >
                                                Planta (Tiempo Completo)
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.typeButton,
                                                typeInput === 'horario' && styles.typeButtonSelected,
                                            ]}
                                            onPress={() => setTypeInput('horario')}
                                        >
                                            <Text
                                                style={[
                                                    styles.typeButtonText,
                                                    typeInput === 'horario' && styles.typeButtonTextSelected,
                                                ]}
                                            >
                                                Por Horario
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Asignaturas Disponibles en el Departamento */}
                            <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                                Componentes del departamento ({selectedSubjectIds.length} seleccionados)
                            </Text>

                            {deptSubjects.length === 0 ? (
                                <View style={styles.noSubjectsWarning}>
                                    <Text style={styles.noSubjectsText}>
                                        El departamento no tiene asignaturas vinculadas aún. El Administrador debe asociarlas en el panel de Departamentos.
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.subjectsContainer}>
                                    {deptSubjects.map((sub) => {
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
                            )}

                            <View style={styles.modalButtonsRow}>
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() => setModalVisible(false)}
                                    disabled={saving}
                                >
                                    <Text style={styles.cancelButtonText}>Cerrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.saveButton, saving && styles.buttonDisabled]}
                                    onPress={handleSaveTeacher}
                                    disabled={saving || deptSubjects.length === 0}
                                >
                                    {saving ? (
                                        <ActivityIndicator color={Colors.white} />
                                    ) : (
                                        <Text style={styles.saveButtonText}>Guardar</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal: Credenciales Temporales */}
            <Modal visible={Boolean(credentialsModal)} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Credenciales Temporales</Text>
                        <Text style={styles.modalSubtitle}>
                            Comparta estas credenciales privadas con el docente para su primer acceso a AcaPlan:
                        </Text>
                        <View style={styles.credentialsBox}>
                            <Text style={styles.credentialLabel}>Docente:</Text>
                            <Text style={styles.credentialValue}>{credentialsModal?.nombre}</Text>
                            <Text style={styles.credentialLabel}>Correo:</Text>
                            <Text style={styles.credentialValue}>{credentialsModal?.correo}</Text>
                            {credentialsModal?.claveTemporal && (
                                <>
                                    <Text style={styles.credentialLabel}>Contraseña temporal:</Text>
                                    <Text style={[styles.credentialValue, styles.tempPassText]}>
                                        {credentialsModal.claveTemporal}
                                    </Text>
                                </>
                            )}
                        </View>
                        <TouchableOpacity
                            style={[styles.saveButton, { marginTop: Spacing.lg, alignItems: 'center' }]}
                            onPress={() => setCredentialsModal(null)}
                        >
                            <Text style={styles.saveButtonText}>Entendido</Text>
                        </TouchableOpacity>
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
    deptBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        backgroundColor: '#EBF5FF',
        borderBottomWidth: 1,
        borderBottomColor: '#BFDBFE',
        gap: Spacing.md,
    },
    deptIconBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.sm,
    },
    deptIcon: {
        fontSize: 22,
    },
    deptInfo: {
        flex: 1,
    },
    deptKicker: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.primary,
        textTransform: 'uppercase',
    },
    deptTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
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
        alignItems: 'flex-start',
    },
    nameRow: {
        flex: 1,
        marginRight: Spacing.sm,
    },
    cardTitle: {
        fontSize: Typography.sizes.md,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    cardSubtitle: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    badge: {
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
    },
    badgePlanta: {
        backgroundColor: '#DCFCE7',
    },
    badgeHorario: {
        backgroundColor: '#FEF3C7',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    badgeTextPlanta: {
        color: '#15803D',
    },
    badgeTextHorario: {
        color: '#B45309',
    },
    componentsSection: {
        marginTop: Spacing.md,
    },
    componentsLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.xs,
    },
    chip: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    chipText: {
        fontSize: 11,
        color: Colors.textPrimary,
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
    typeSelectorRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    typeButton: {
        flex: 1,
        paddingVertical: Spacing.sm + 2,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    typeButtonSelected: {
        borderColor: Colors.primary,
        backgroundColor: '#EBF5FF',
    },
    typeButtonText: {
        fontSize: Typography.sizes.xs,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    typeButtonTextSelected: {
        color: Colors.primary,
        fontWeight: '700',
    },
    noSubjectsWarning: {
        backgroundColor: '#FEF3C7',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginBottom: Spacing.md,
    },
    noSubjectsText: {
        fontSize: Typography.sizes.xs,
        color: '#92400E',
    },
    subjectsContainer: {
        maxHeight: 180,
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
    credentialsBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
        marginVertical: Spacing.md,
        gap: 4,
    },
    credentialLabel: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
        color: Colors.textSecondary,
        textTransform: 'uppercase',
    },
    credentialValue: {
        fontSize: Typography.sizes.sm,
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    tempPassText: {
        fontSize: Typography.sizes.md,
        color: Colors.primary,
        fontWeight: '700',
        letterSpacing: 1,
    },
});

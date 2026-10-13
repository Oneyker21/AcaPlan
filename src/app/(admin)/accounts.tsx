import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { GeneralEstado, UserRol, Usuario } from '@/types/database';
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

interface AccountForm {
    nombre: string;
    correo: string;
    cedula: string;
    contrasena: string;
    rol: UserRol;
    carreraIds: number[];
}

interface CareerOption {
    id_carrera: number;
    nombre: string;
}

const roleOptions: { value: UserRol; label: string }[] = [
    { value: 'administrador', label: 'Administrador' },
    { value: 'coordinacion', label: 'Coordinación' },
    { value: 'jefatura', label: 'Jefatura de departamento' },
    { value: 'planificacion', label: 'Planificación' },
    { value: 'docente', label: 'Docente' },
];

function roleNeedsCareers(role: UserRol) {
    return role === 'coordinacion' || role === 'jefatura';
}

function roleLabel(role: UserRol) {
    return roleOptions.find((option) => option.value === role)?.label ?? role;
}

const emptyForm: AccountForm = {
    nombre: '',
    correo: '',
    cedula: '',
    contrasena: '',
    rol: 'docente',
    carreraIds: [],
};

async function getEdgeErrorMessage(error: { message: string; context?: unknown }) {
    if (error.context instanceof Response) {
        try {
            const body = await error.context.clone().json() as { error?: unknown };
            if (typeof body.error === 'string') return body.error;
        } catch {
            // Fall back to the function client's message if the response is not JSON.
        }
    }
    return error.message;
}

export default function AccountsScreen() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [carreras, setCarreras] = useState<CareerOption[]>([]);
    const [careerIdsByUser, setCareerIdsByUser] = useState<Record<number, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);
    const [form, setForm] = useState<AccountForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchUsuarios = useCallback(async () => {
        try {
            const [{ data, error }, { data: scopes, error: scopeError }] = await Promise.all([
                supabase
                    .from('usuarios')
                    .select('id_usuario, nombre, correo, cedula, rol, estado')
                    .order('id_usuario', { ascending: true }),
                supabase.from('usuario_carrera').select('id_usuario, id_carrera'),
            ]);

            if (error || scopeError || !data || !scopes) {
                Alert.alert('Error', 'No se pudieron cargar las cuentas y sus permisos. Revise la configuración de Sprint 1 e intente actualizar la lista.');
                return;
            }

            const idsByUser: Record<number, number[]> = {};
            for (const scope of scopes) {
                (idsByUser[scope.id_usuario] ??= []).push(scope.id_carrera);
            }
            setUsuarios(data as Usuario[]);
            setCareerIdsByUser(idsByUser);
        } catch {
            Alert.alert('Error', 'No se pudieron cargar las cuentas. Intente actualizar la lista.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const fetchCarreras = useCallback(async () => {
        const { data, error } = await supabase
            .from('carreras')
            .select('id_carrera, nombre')
            .order('nombre', { ascending: true });

        if (error || !data) {
            Alert.alert('Error', 'No se pudo cargar la lista de carreras.');
            return;
        }
        setCarreras(data as CareerOption[]);
    }, []);

    useEffect(() => {
        void fetchUsuarios();
        void fetchCarreras();
    }, [fetchCarreras, fetchUsuarios]);

    const onRefresh = () => {
        setRefreshing(true);
        void fetchUsuarios();
    };

    const filteredUsuarios = usuarios.filter(
        (u) =>
            u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.correo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (u.cedula ?? '').includes(searchQuery)
    );

    const openCreateModal = () => {
        setEditingUser(null);
        setForm(emptyForm);
        setModalVisible(true);
    };

    const openEditModal = (user: Usuario) => {
        setEditingUser(user);
        setForm({
            nombre: user.nombre,
            correo: user.correo,
            cedula: user.cedula ?? '',
            contrasena: '',
            rol: user.rol,
            carreraIds: careerIdsByUser[user.id_usuario] ?? [],
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        // Validate required fields
        if (!form.nombre.trim() || !form.correo.trim()) {
            Alert.alert('Error', 'Nombre y correo son obligatorios.');
            return;
        }
        if (form.nombre.trim().length > 100) {
            Alert.alert('Error', 'El nombre no puede superar 100 caracteres.');
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(form.correo.trim())) {
            Alert.alert('Error', 'Ingrese un correo válido.');
            return;
        }
        if (!editingUser && form.contrasena.length < 8) {
            Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (roleNeedsCareers(form.rol) && form.carreraIds.length === 0) {
            Alert.alert('Carreras requeridas', 'Asigne al menos una carrera a las cuentas de coordinación y jefatura.');
            return;
        }

        setSaving(true);

        try {
            const { error } = await supabase.functions.invoke('admin-users', {
                body: editingUser
                    ? {
                        action: 'update',
                        id_usuario: editingUser.id_usuario,
                        nombre: form.nombre,
                        correo: form.correo,
                        cedula: form.cedula.trim() || null,
                        rol: form.rol,
                        carrera_ids: form.carreraIds,
                    }
                    : {
                        action: 'create',
                        nombre: form.nombre,
                        correo: form.correo,
                        cedula: form.cedula.trim() || null,
                        password: form.contrasena,
                        rol: form.rol,
                        carrera_ids: form.carreraIds,
                    },
            });

            if (error) {
                Alert.alert('Error', await getEdgeErrorMessage(error));
                setSaving(false);
                return;
            }

            setModalVisible(false);
            await fetchUsuarios();
        } catch {
            Alert.alert('Error', 'Error de conexión. Intente de nuevo.');
        }

        setSaving(false);
    };

    const handleToggleStatus = async (user: Usuario) => {
        // H03-CA3: Prevent deactivating the last active admin
        if (user.estado === 'activo' && user.rol === 'administrador') {
            const activeAdmins = usuarios.filter(
                (u) => u.rol === 'administrador' && u.estado === 'activo'
            );
            if (activeAdmins.length <= 1) {
                Alert.alert(
                    'No permitido',
                    'No se puede desactivar al último administrador activo.'
                );
                return;
            }
        }

        const newStatus: GeneralEstado = user.estado === 'activo' ? 'inactivo' : 'activo';

        Alert.alert(
            newStatus === 'inactivo' ? 'Desactivar cuenta' : 'Activar cuenta',
            `¿${newStatus === 'inactivo' ? 'Desactivar' : 'Activar'} la cuenta de ${user.nombre}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    style: newStatus === 'inactivo' ? 'destructive' : 'default',
                    onPress: async () => {
                        const { error } = await supabase.functions.invoke('admin-users', {
                            body: {
                                action: 'set-status',
                                id_usuario: user.id_usuario,
                                estado: newStatus,
                            },
                        });

                        if (!error) {
                            await fetchUsuarios();
                        } else {
                            Alert.alert('Error', await getEdgeErrorMessage(error));
                        }
                    },
                },
            ]
        );
    };

    const renderUser = ({ item }: { item: Usuario }) => (
        <View style={styles.userCard}>
            <View style={styles.userHeader}>
                <View style={[
                    styles.roleBadge,
                    { backgroundColor: item.rol === 'administrador' ? Colors.accent + '20' : Colors.primary + '12' }
                ]}>
                    <Text style={[
                        styles.roleText,
                        { color: item.rol === 'administrador' ? Colors.accent : Colors.primary }
                    ]}>
                        {roleLabel(item.rol)}
                    </Text>
                </View>
                <View style={[
                    styles.statusDot,
                    { backgroundColor: item.estado === 'activo' ? Colors.success : Colors.textTertiary }
                ]} />
            </View>

            <Text style={styles.userName}>{item.nombre}</Text>
            <Text style={styles.userDetail}>📧 {item.correo}</Text>
            {item.cedula ? <Text style={styles.userDetail}>Cédula: {item.cedula}</Text> : null}
            {roleNeedsCareers(item.rol) && (
                <Text style={styles.userDetail}>
                    Carreras: {(careerIdsByUser[item.id_usuario] ?? [])
                        .map((id) => carreras.find((career) => career.id_carrera === id)?.nombre ?? `#${id}`)
                        .join(', ')}
                </Text>
            )}

            <View style={styles.userActions}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.editBtn]}
                    onPress={() => openEditModal(item)}
                >
                    <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.actionBtn,
                        item.estado === 'activo' ? styles.deactivateBtn : styles.activateBtn,
                    ]}
                    onPress={() => handleToggleStatus(item)}
                >
                    <Text style={[
                        styles.actionBtnText,
                        { color: item.estado === 'activo' ? Colors.error : Colors.success }
                    ]}>
                        {item.estado === 'activo' ? 'Desactivar' : 'Activar'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar por nombre, correo o cédula..."
                    placeholderTextColor={Colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* User List */}
            <FlatList
                data={filteredUsuarios}
                renderItem={renderUser}
                keyExtractor={(item) => item.id_usuario.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>👥</Text>
                        <Text style={styles.emptyText}>No se encontraron usuarios</Text>
                    </View>
                }
            />

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={openCreateModal} activeOpacity={0.8}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            {/* Create/Edit Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>
                            {editingUser ? 'Editar Cuenta' : 'Nueva Cuenta'}
                        </Text>

                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.modalScrollContent}
                        >
                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Nombre completo</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.nombre}
                                onChangeText={(v) => setForm({ ...form, nombre: v })}
                                placeholder="Nombre del usuario"
                                placeholderTextColor={Colors.textTertiary}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Correo institucional</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.correo}
                                onChangeText={(v) => setForm({ ...form, correo: v })}
                                placeholder="correo@unan.edu.ni"
                                placeholderTextColor={Colors.textTertiary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Cédula (opcional)</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.cedula}
                                onChangeText={(v) => setForm({ ...form, cedula: v })}
                                placeholder="000-000000-0000A"
                                placeholderTextColor={Colors.textTertiary}
                                maxLength={20}
                            />
                        </View>

                        {!editingUser && (
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Contraseña</Text>
                                <TextInput
                                    style={styles.formInput}
                                    value={form.contrasena}
                                    onChangeText={(v) => setForm({ ...form, contrasena: v })}
                                    placeholder="Contraseña inicial"
                                    placeholderTextColor={Colors.textTertiary}
                                    secureTextEntry
                                />
                            </View>
                        )}

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Rol</Text>
                            <View style={styles.rolePicker}>
                                {roleOptions.map((option) => (
                                    <TouchableOpacity
                                        key={option.value}
                                        style={[
                                            styles.roleOption,
                                            form.rol === option.value && styles.roleOptionActive,
                                        ]}
                                        onPress={() => setForm((current) => ({
                                            ...current,
                                            rol: option.value,
                                            carreraIds: roleNeedsCareers(option.value) ? current.carreraIds : [],
                                        }))}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: form.rol === option.value }}
                                    >
                                        <Text style={[
                                            styles.roleOptionText,
                                            form.rol === option.value && styles.roleOptionTextActive,
                                        ]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {roleNeedsCareers(form.rol) && (
                            <View style={styles.formGroup}>
                                <Text style={styles.formLabel}>Carreras autorizadas</Text>
                                {carreras.length === 0 ? (
                                    <Text style={styles.helperText}>Registre carreras antes de asignar este perfil.</Text>
                                ) : carreras.map((career) => {
                                    const selected = form.carreraIds.includes(career.id_carrera);
                                    return (
                                        <TouchableOpacity
                                            key={career.id_carrera}
                                            style={[styles.careerOption, selected && styles.careerOptionActive]}
                                            onPress={() => setForm((current) => ({
                                                ...current,
                                                carreraIds: selected
                                                    ? current.carreraIds.filter((id) => id !== career.id_carrera)
                                                    : [...current.carreraIds, career.id_carrera],
                                            }))}
                                            accessibilityRole="checkbox"
                                            accessibilityState={{ checked: selected }}
                                        >
                                            <Text style={[styles.careerOptionText, selected && styles.roleOptionTextActive]}>
                                                {selected ? '✓  ' : ''}{career.nombre}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setModalVisible(false)}
                                disabled={saving}
                            >
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color={Colors.white} size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
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
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    searchContainer: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    searchInput: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        fontSize: Typography.sizes.md,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.sm,
    },
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 100,
    },
    userCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    userHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    roleBadge: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    roleText: {
        fontSize: Typography.sizes.xs,
        fontWeight: '600',
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    userName: {
        fontSize: Typography.sizes.lg,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    userDetail: {
        fontSize: Typography.sizes.sm,
        color: Colors.textSecondary,
        marginBottom: 2,
    },
    userActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
        paddingTop: Spacing.md,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    editBtn: {
        backgroundColor: Colors.primary + '10',
    },
    editBtnText: {
        color: Colors.primary,
        fontWeight: '600',
        fontSize: Typography.sizes.sm,
    },
    deactivateBtn: {
        backgroundColor: Colors.error + '10',
    },
    activateBtn: {
        backgroundColor: Colors.success + '10',
    },
    actionBtnText: {
        fontWeight: '600',
        fontSize: Typography.sizes.sm,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.huge,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    emptyText: {
        fontSize: Typography.sizes.md,
        color: Colors.textTertiary,
    },
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: Spacing.xxl,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.lg,
    },
    fabText: {
        fontSize: 28,
        color: Colors.white,
        fontWeight: '300',
        marginTop: -2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        maxHeight: '85%',
    },
    modalTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: Spacing.xl,
        textAlign: 'center',
    },
    modalScrollContent: {
        paddingBottom: Spacing.sm,
    },
    formGroup: {
        marginBottom: Spacing.lg,
    },
    formLabel: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
    },
    formInput: {
        backgroundColor: Colors.background,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        fontSize: Typography.sizes.md,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    rolePicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
    },
    roleOption: {
        width: '47%',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: Colors.border,
        backgroundColor: Colors.background,
    },
    roleOptionActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '08',
    },
    roleOptionText: {
        fontSize: Typography.sizes.sm,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    roleOptionTextActive: {
        color: Colors.primary,
    },
    careerOption: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.background,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.sm,
    },
    careerOptionActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '08',
    },
    careerOptionText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.sm,
    },
    helperText: {
        color: Colors.textTertiary,
        fontSize: Typography.sizes.sm,
    },
    modalActions: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.xl,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cancelBtnText: {
        color: Colors.textSecondary,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
    saveBtn: {
        flex: 1,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        backgroundColor: Colors.primary,
    },
    saveBtnDisabled: {
        opacity: 0.7,
    },
    saveBtnText: {
        color: Colors.white,
        fontSize: Typography.sizes.md,
        fontWeight: '600',
    },
});

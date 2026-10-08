import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/theme';
import { createAccount, listAccounts, ManagedAccount, updateAccount } from '@/services/management';
import { GeneralEstado, UserRol } from '@/types/database';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
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
}

const emptyForm: AccountForm = {
    nombre: '',
    correo: '',
    cedula: '',
    contrasena: '',
    rol: 'docente',
};

export default function AccountsScreen() {
    const [usuarios, setUsuarios] = useState<ManagedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<ManagedAccount | null>(null);
    const [form, setForm] = useState<AccountForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchUsuarios = useCallback(async () => {
        try {
            setUsuarios(await listAccounts());
        } catch (error) {
            setUsuarios([]);
            Alert.alert('Error', error instanceof Error ? error.message : 'No se pudieron cargar las cuentas.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchUsuarios();
    }, [fetchUsuarios]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchUsuarios();
    };

    const filteredUsuarios = usuarios.filter(
        (u) =>
            u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.correo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.cedula.includes(searchQuery)
    );

    const openCreateModal = () => {
        setEditingUser(null);
        setForm(emptyForm);
        setModalVisible(true);
    };

    const openEditModal = (user: ManagedAccount) => {
        setEditingUser(user);
        setForm({
            nombre: user.nombre,
            correo: user.correo,
            cedula: user.cedula,
            contrasena: '',
            rol: user.rol,
        });
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (saving) return;
        if (!form.nombre.trim() || !form.correo.trim() || !form.cedula.trim()) {
            Alert.alert('Error', 'Nombre, correo y cédula son obligatorios.'); return;
        }
        if (!editingUser && (form.contrasena.length < 8 || form.contrasena.length > 128)) {
            Alert.alert('Error', 'La contraseña inicial debe tener entre 8 y 128 caracteres.'); return;
        }
        setSaving(true);
        try {
            const fields = { nombre: form.nombre.trim(), cedula: form.cedula.trim(), rol: form.rol };
            if (editingUser) await updateAccount(editingUser.id_usuario, fields);
            else await createAccount({ ...fields, correo: form.correo.trim().toLowerCase(), password: form.contrasena });
            setModalVisible(false);
            setForm(emptyForm);
            await fetchUsuarios();
        } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo guardar la cuenta.');
        } finally { setSaving(false); }
    };

    const handleToggleStatus = async (user: ManagedAccount) => {
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
                        if (saving) return;
                        setSaving(true);
                        try {
                            await updateAccount(user.id_usuario, { estado: newStatus });
                            await fetchUsuarios();
                        } catch (error) {
                            Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo cambiar el estado.');
                        } finally { setSaving(false); }
                    },
                },
            ]
        );
    };

    const renderUser = ({ item }: { item: ManagedAccount }) => (
        <View style={styles.userCard}>
            <View style={styles.userHeader}>
                <View style={[
                    styles.roleBadge,
                    { backgroundColor: item.rol === 'administrador' ? Colors.accent + '20' : Colors.success + '20' }
                ]}>
                    <Text style={[
                        styles.roleText,
                        { color: item.rol === 'administrador' ? Colors.accent : Colors.success }
                    ]}>
                        {item.rol === 'administrador' ? '🔑 Admin' : '👨‍🏫 Docente'}
                    </Text>
                </View>
                <View style={[
                    styles.statusDot,
                    { backgroundColor: item.estado === 'activo' ? Colors.success : Colors.textTertiary }
                ]} />
            </View>

            <Text style={styles.userName}>{item.nombre}</Text>
            <Text style={styles.userDetail}>📧 {item.correo}</Text>
            <Text style={styles.userDetail}>🪪 {item.cedula}</Text>

            <View style={styles.userActions}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.editBtn]}
                    disabled={saving}
                    onPress={() => openEditModal(item)}
                >
                    <Text style={styles.editBtnText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.actionBtn,
                        item.estado === 'activo' ? styles.deactivateBtn : styles.activateBtn,
                    ]}
                    disabled={saving}
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
            <TouchableOpacity style={styles.fab} disabled={saving} onPress={openCreateModal} activeOpacity={0.8}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            {/* Create/Edit Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>
                            {editingUser ? 'Editar Cuenta' : 'Nueva Cuenta'}
                        </Text>

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
                            <Text style={styles.formLabel}>{editingUser ? 'Correo institucional (no editable)' : 'Correo institucional'}</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.correo}
                                editable={!editingUser && !saving}
                                onChangeText={(v) => setForm({ ...form, correo: v })}
                                placeholder="correo@unan.edu.ni"
                                placeholderTextColor={Colors.textTertiary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.formLabel}>Cédula</Text>
                            <TextInput
                                style={styles.formInput}
                                value={form.cedula}
                                onChangeText={(v) => setForm({ ...form, cedula: v })}
                                placeholder="000-000000-0000A"
                                placeholderTextColor={Colors.textTertiary}
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
                                <TouchableOpacity
                                    style={[
                                        styles.roleOption,
                                        form.rol === 'docente' && styles.roleOptionActive,
                                    ]}
                                    onPress={() => setForm({ ...form, rol: 'docente' })}
                                >
                                    <Text style={[
                                        styles.roleOptionText,
                                        form.rol === 'docente' && styles.roleOptionTextActive,
                                    ]}>
                                        👨‍🏫 Docente
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.roleOption,
                                        form.rol === 'administrador' && styles.roleOptionActive,
                                    ]}
                                    onPress={() => setForm({ ...form, rol: 'administrador' })}
                                >
                                    <Text style={[
                                        styles.roleOptionText,
                                        form.rol === 'administrador' && styles.roleOptionTextActive,
                                    ]}>
                                        🔑 Admin
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

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
        gap: Spacing.md,
    },
    roleOption: {
        flex: 1,
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

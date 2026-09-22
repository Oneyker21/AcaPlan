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
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);
    const [form, setForm] = useState<AccountForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchUsuarios = useCallback(async () => {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .order('id_usuario', { ascending: true });

        if (!error && data) {
            setUsuarios(data as Usuario[]);
        }
        setLoading(false);
        setRefreshing(false);
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

    const openEditModal = (user: Usuario) => {
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
        // Validate required fields
        if (!form.nombre.trim() || !form.correo.trim() || !form.cedula.trim()) {
            Alert.alert('Error', 'Nombre, correo y cédula son obligatorios.');
            return;
        }
        if (!editingUser && !form.contrasena.trim()) {
            Alert.alert('Error', 'La contraseña es obligatoria para nuevos usuarios.');
            return;
        }

        setSaving(true);

        try {
            if (editingUser) {
                // Update existing user (H03-CA2)
                const updateData: Partial<Usuario> = {
                    nombre: form.nombre.trim(),
                    correo: form.correo.trim(),
                    cedula: form.cedula.trim(),
                    rol: form.rol,
                };

                const { error } = await supabase
                    .from('usuarios')
                    .update(updateData)
                    .eq('id_usuario', editingUser.id_usuario);

                if (error) {
                    Alert.alert('Error', error.message.includes('unique')
                        ? 'El correo o cédula ya están registrados.'
                        : 'No se pudo actualizar la cuenta.');
                    setSaving(false);
                    return;
                }
            } else {
                // Create new user
                // First create in Supabase Auth
                const { error: authError } = await supabase.auth.signUp({
                    email: form.correo.trim(),
                    password: form.contrasena,
                });

                if (authError) {
                    Alert.alert('Error', 'No se pudo crear la cuenta de autenticación.');
                    setSaving(false);
                    return;
                }

                // Then create in usuarios table
                const { error: dbError } = await supabase
                    .from('usuarios')
                    .insert({
                        nombre: form.nombre.trim(),
                        correo: form.correo.trim(),
                        cedula: form.cedula.trim(),
                        contrasena: '***', // Auth is handled by Supabase Auth
                        rol: form.rol,
                        estado: 'activo',
                    });

                if (dbError) {
                    Alert.alert('Error', dbError.message.includes('unique')
                        ? 'El correo o cédula ya están registrados.'
                        : 'No se pudo crear la cuenta.');
                    setSaving(false);
                    return;
                }
            }

            setModalVisible(false);
            fetchUsuarios();
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
                        const { error } = await supabase
                            .from('usuarios')
                            .update({ estado: newStatus })
                            .eq('id_usuario', user.id_usuario);

                        if (!error) {
                            fetchUsuarios();
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

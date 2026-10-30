import { Colors, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface HeaderLogoutButtonProps {
    color?: string;
}

export function HeaderLogoutButton({ color = Colors.white }: HeaderLogoutButtonProps) {
    const { signOut } = useAuth();

    const handleSignOut = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro de que deseas cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cerrar Sesión',
                    style: 'destructive',
                    onPress: () => void signOut(),
                },
            ]
        );
    };

    return (
        <TouchableOpacity
            style={styles.button}
            onPress={handleSignOut}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Text style={[styles.text, { color }]}>🚪 Salir</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        marginRight: Spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
    },
    text: {
        fontSize: Typography.sizes.xs,
        fontWeight: '700',
    },
});

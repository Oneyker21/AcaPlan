import { Colors } from '@/constants/theme';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function AdminLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textTertiary,
                tabBarStyle: {
                    backgroundColor: Colors.white,
                    borderTopColor: Colors.border,
                    borderTopWidth: 1,
                    paddingBottom: 6,
                    paddingTop: 6,
                    height: 60,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
                headerStyle: {
                    backgroundColor: Colors.primary,
                },
                headerTintColor: Colors.white,
                headerTitleStyle: {
                    fontWeight: '600',
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Inicio',
                    headerTitle: 'AcaPlan · Admin',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: 'Cuentas',
                    headerTitle: 'Gestión de Cuentas',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
                }}
            />
            <Tabs.Screen
                name="periods"
                options={{
                    title: 'Períodos',
                    headerTitle: 'Períodos Académicos',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📅</Text>,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Perfil',
                    headerTitle: 'Mi Perfil',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
                }}
            />
        </Tabs>
    );
}

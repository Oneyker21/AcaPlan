import { Colors } from '@/constants/theme';
import { HeaderLogoutButton } from '@/components/header-logout-button';
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
                headerRight: () => <HeaderLogoutButton />,
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
                name="sections"
                options={{
                    title: 'Secciones',
                    headerTitle: 'Gestión de Secciones',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📚</Text>,
                }}
            />
            <Tabs.Screen
                name="blocks"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="schedule"
                options={{ href: null, title: 'Planificación' }}
            />
            <Tabs.Screen
                name="consultation"
                options={{ href: null, title: 'Consulta de horarios' }}
            />
            <Tabs.Screen
                name="academic-assignments"
                options={{ href: null, title: 'Asignación académica' }}
            />
            <Tabs.Screen
                name="assignment-import"
                options={{ href: null, title: 'Importar asignación' }}
            />
            <Tabs.Screen
                name="catalogs"
                options={{ href: null, title: 'Catálogos' }}
            />
            <Tabs.Screen
                name="inventory-import"
                options={{ href: null, title: 'Importar espacios' }}
            />
            <Tabs.Screen
                name="departments"
                options={{ href: null, title: 'Departamentos' }}
            />
            <Tabs.Screen
                name="ai-generator"
                options={{ href: null, title: 'Generador con IA' }}
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

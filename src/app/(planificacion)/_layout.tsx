import { Colors } from '@/constants/theme';
import { HeaderLogoutButton } from '@/components/header-logout-button';
import { Stack } from 'expo-router';

export default function PlanningLayout() {
    return <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="index" options={{ title: 'Planificación', headerRight: () => <HeaderLogoutButton /> }} />
        <Stack.Screen name="careers" options={{ title: 'Carreras' }} />
        <Stack.Screen name="subjects" options={{ title: 'Asignaturas' }} />
        <Stack.Screen name="sections" options={{ title: 'Grupos académicos' }} />
        <Stack.Screen name="assignments" options={{ title: 'Asignación académica' }} />
        <Stack.Screen name="assignment-import" options={{ title: 'Importar asignación' }} />
        <Stack.Screen name="blocks" options={{ title: 'Cuadrículas de horario' }} />
        <Stack.Screen name="planning-rules" options={{ title: 'Reglas del horario' }} />
        <Stack.Screen name="schedule" options={{ title: 'Borradores de horario' }} />
        <Stack.Screen name="ai-generator" options={{ title: 'Generador de Horarios con IA' }} />
        <Stack.Screen name="consultation" options={{ title: 'Consulta de horarios' }} />
        <Stack.Screen name="inventory-import" options={{ title: 'Importar inventario' }} />
    </Stack>;
}

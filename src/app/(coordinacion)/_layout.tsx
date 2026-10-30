import { Colors } from '@/constants/theme';
import { HeaderLogoutButton } from '@/components/header-logout-button';
import { Stack } from 'expo-router';

export default function CoordinationLayout() {
    return <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="index" options={{ title: 'Coordinación académica', headerRight: () => <HeaderLogoutButton /> }} />
        <Stack.Screen name="subjects" options={{ title: 'Asignaturas' }} />
        <Stack.Screen name="sections" options={{ title: 'Grupos académicos' }} />
        <Stack.Screen name="assignments" options={{ title: 'Asignación académica' }} />
        <Stack.Screen name="assignment-import" options={{ title: 'Importar asignación' }} />
        <Stack.Screen name="restrictions" options={{ title: 'Restricciones comunicadas' }} />
        <Stack.Screen name="schedules" options={{ title: 'Consulta de horarios' }} />
    </Stack>;
}

import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function CoordinationLayout() {
    return <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="index" options={{ title: 'Coordinación académica' }} />
        <Stack.Screen name="subjects" options={{ title: 'Asignaturas' }} />
        <Stack.Screen name="sections" options={{ title: 'Grupos académicos' }} />
        <Stack.Screen name="assignments" options={{ title: 'Asignación académica' }} />
        <Stack.Screen name="assignment-import" options={{ title: 'Importar asignación' }} />
        <Stack.Screen name="restrictions" options={{ title: 'Restricciones comunicadas' }} />
        <Stack.Screen name="schedules" options={{ title: 'Consulta de horarios' }} />
    </Stack>;
}

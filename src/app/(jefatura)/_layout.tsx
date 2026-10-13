import { Colors } from '@/constants/theme';
import { Stack } from 'expo-router';

export default function DepartmentHeadLayout() {
    return <Stack screenOptions={{ headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="index" options={{ title: 'Jefatura de departamento' }} />
        <Stack.Screen name="restrictions" options={{ title: 'Restricciones autorizadas' }} />
        <Stack.Screen name="schedules" options={{ title: 'Consulta de horarios' }} />
    </Stack>;
}

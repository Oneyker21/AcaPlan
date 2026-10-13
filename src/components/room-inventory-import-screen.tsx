import { BorderRadius, Colors, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { File as ExpoFile } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type RoomField = 'sede' | 'pabellon' | 'identificacion' | 'capacidad' | 'tipo' | 'recursos';
type ColumnMapping = Partial<Record<RoomField, number | null>>;

interface RoomResource {
    id_recurso: number;
    nombre: string;
}

interface ParsedSheet {
    name: string;
    headers: string[];
    rows: { rowNumber: number; values: string[] }[];
}

interface PreviewRow {
    sheet: string;
    rowNumber: number;
    site: string;
    pavilion: string;
    identification: string;
    capacity: string;
    type: string;
    resources: string[];
    errors: string[];
}

const roomFields: { key: RoomField; label: string; required: boolean }[] = [
    { key: 'sede', label: 'Sede', required: true },
    { key: 'pabellon', label: 'Pabellón', required: true },
    { key: 'identificacion', label: 'Identificación del espacio', required: true },
    { key: 'capacidad', label: 'Capacidad', required: true },
    { key: 'tipo', label: 'Tipo de espacio', required: true },
    { key: 'recursos', label: 'Recursos', required: false },
];

function normalizeName(value: string) {
    return value.trim().toLocaleLowerCase();
}

export default function RoomInventoryImportScreen() {
    const router = useRouter();
    const [fileName, setFileName] = useState('');
    const [sheets, setSheets] = useState<ParsedSheet[]>([]);
    const [mappings, setMappings] = useState<Record<string, ColumnMapping>>({});
    const [includedSheets, setIncludedSheets] = useState<Record<string, boolean>>({});
    const [activeSheet, setActiveSheet] = useState('');
    const [resources, setResources] = useState<RoomResource[]>([]);
    const [resourcesLoading, setResourcesLoading] = useState(true);
    const [pickerField, setPickerField] = useState<RoomField | null>(null);
    const [saving, setSaving] = useState(false);
    const [reading, setReading] = useState(false);

    useEffect(() => {
        let mounted = true;
        void supabase.from('recursos').select('id_recurso, nombre').order('nombre').then(({ data, error }) => {
            if (!mounted) return;
            if (error || !data) {
                Alert.alert('Error', 'No se pudo cargar el catálogo de recursos. Intente actualizar la pantalla.');
            } else {
                setResources(data as RoomResource[]);
            }
            setResourcesLoading(false);
        });
        return () => { mounted = false; };
    }, []);

    const activeSheetData = sheets.find((sheet) => sheet.name === activeSheet) ?? null;
    const activeMapping = mappings[activeSheet] ?? {};

    const previewRows = useMemo(() => {
        const rows: PreviewRow[] = [];
        for (const sheet of sheets) {
            if (!includedSheets[sheet.name]) continue;
            const mapping = mappings[sheet.name] ?? {};
            for (const row of sheet.rows) {
                const valueFor = (field: RoomField) => {
                    const column = mapping[field];
                    return typeof column === 'number' ? (row.values[column] ?? '').trim() : '';
                };
                const site = valueFor('sede');
                const pavilion = valueFor('pabellon');
                const identification = valueFor('identificacion').toLocaleUpperCase();
                const capacity = valueFor('capacidad');
                const type = valueFor('tipo');
                const resourceCell = valueFor('recursos');
                const resourceNames = [...new Set(resourceCell
                    .split(/[,;|\n]/)
                    .map((value) => value.trim())
                    .filter(Boolean))];
                const errors: string[] = [];

                if (!site) errors.push('Sede: dato obligatorio.');
                else if (site.length > 150) errors.push('Sede: máximo 150 caracteres.');
                if (!pavilion) errors.push('Pabellón: dato obligatorio.');
                else if (pavilion.length > 50) errors.push('Pabellón: máximo 50 caracteres.');
                if (!identification) errors.push('Identificación: dato obligatorio.');
                else if (identification.length > 20) errors.push('Identificación: máximo 20 caracteres.');
                if (!/^\d+$/.test(capacity) || !Number.isSafeInteger(Number(capacity))
                    || Number(capacity) <= 0 || Number(capacity) > 2_147_483_647) {
                    errors.push('Capacidad: ingrese un entero mayor que cero dentro del rango permitido.');
                }
                if (!type) errors.push('Tipo: dato obligatorio.');
                else if (type.length > 80) errors.push('Tipo: máximo 80 caracteres.');

                const knownResources = new Set(resources.map((resource) => normalizeName(resource.nombre)));
                for (const resource of resourceNames) {
                    if (!knownResources.has(normalizeName(resource))) {
                        errors.push(`Recursos: «${resource}» no existe en el catálogo.`);
                    }
                }

                rows.push({
                    sheet: sheet.name,
                    rowNumber: row.rowNumber,
                    site,
                    pavilion,
                    identification,
                    capacity,
                    type,
                    resources: resourceNames,
                    errors,
                });
            }
        }

        const seen = new Map<string, PreviewRow>();
        for (const row of rows) {
            if (!row.site || !row.pavilion || !row.identification) continue;
            const key = `${normalizeName(row.site)}\u001f${normalizeName(row.pavilion)}\u001f${normalizeName(row.identification)}`;
            const firstRow = seen.get(key);
            if (firstRow) {
                row.errors.push(`Identificación: duplicada en ${firstRow.sheet}, fila ${firstRow.rowNumber}.`);
            } else {
                seen.set(key, row);
            }
        }
        return rows;
    }, [includedSheets, mappings, resources, sheets]);

    const selectedRows = previewRows.filter((row) => includedSheets[row.sheet]);
    const issueCount = selectedRows.reduce((total, row) => total + row.errors.length, 0);
    const canImport = selectedRows.length > 0 && issueCount === 0 && !resourcesLoading && !saving && !reading;

    const chooseFile = async () => {
        setReading(true);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel',
                    'text/csv',
                ],
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (result.canceled) return;

            const asset = result.assets[0];
            if (asset.size && asset.size > 15 * 1024 * 1024) {
                Alert.alert('Archivo demasiado grande', 'Seleccione un archivo de hasta 15 MB.');
                return;
            }

            const buffer = Platform.OS === 'web' && asset.file
                ? await asset.file.arrayBuffer()
                : await new ExpoFile(asset.uri).arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            const nextSheets: ParsedSheet[] = [];

            for (const sheetName of workbook.SheetNames) {
                const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
                    header: 1,
                    defval: '',
                    raw: false,
                });
                const headerRowIndex = matrix.findIndex((row) => row.some((value) => String(value ?? '').trim() !== ''));
                if (headerRowIndex < 0) continue;

                const rawHeaders = matrix[headerRowIndex];
                const headers = rawHeaders.map((value, index) => String(value ?? '').trim() || `Columna ${index + 1}`);
                const rows = matrix.slice(headerRowIndex + 1)
                    .map((values, index) => ({
                        rowNumber: headerRowIndex + index + 2,
                        values: headers.map((_, columnIndex) => String(values[columnIndex] ?? '').trim()),
                    }))
                    .filter((row) => row.values.some(Boolean));

                if (rows.length) nextSheets.push({ name: sheetName, headers, rows });
            }

            if (!nextSheets.length) {
                Alert.alert('Archivo vacío', 'No se encontraron hojas con filas y encabezados para importar.');
                return;
            }
            const rowsCount = nextSheets.reduce((total, sheet) => total + sheet.rows.length, 0);
            if (rowsCount > 500) {
                Alert.alert('Demasiadas filas', 'Divida el archivo en lotes de hasta 500 espacios.');
                return;
            }

            setFileName(asset.name);
            setSheets(nextSheets);
            setActiveSheet(nextSheets[0].name);
            setIncludedSheets(Object.fromEntries(nextSheets.map((sheet) => [sheet.name, true])));
            setMappings({});
        } catch {
            Alert.alert('No se pudo leer el archivo', 'Use un archivo Excel o CSV válido e intente de nuevo.');
        } finally {
            setReading(false);
        }
    };

    const setColumn = (columnIndex: number | null) => {
        if (!pickerField || !activeSheet) return;
        setMappings((current) => ({
            ...current,
            [activeSheet]: { ...current[activeSheet], [pickerField]: columnIndex },
        }));
        setPickerField(null);
    };

    const confirmImport = async () => {
        if (!canImport) return;
        setSaving(true);
        try {
            const { data, error } = await supabase.rpc('import_room_inventory', {
                p_rows: selectedRows.map((row) => ({
                    sheet: row.sheet,
                    row: row.rowNumber,
                    sede: row.site,
                    pabellon: row.pavilion,
                    identificacion: row.identification,
                    capacidad: row.capacity,
                    tipo: row.type,
                    recursos: row.resources,
                })),
            });

            if (error) {
                const message = error.message.toLocaleLowerCase();
                Alert.alert('No se importó el inventario', message.includes('assigned to a schedule')
                    ? 'Algunos espacios ya están ligados a horarios y sus recursos no se pueden cambiar. Corrija esas filas y vuelva a intentar.'
                    : error.code === '23514' || error.code === '23P01'
                        ? 'El inventario cambió o entra en conflicto con horarios existentes. Revise la capacidad y los recursos; no se guardaron cambios.'
                        : 'No se guardaron cambios. Revise las filas indicadas en la vista previa y vuelva a intentar.');
                return;
            }

            Alert.alert('Inventario actualizado', `Se confirmaron ${data ?? selectedRows.length} espacios. No se duplicaron los registros existentes.`);
            router.back();
        } catch {
            Alert.alert('Error de conexión', 'No se confirmó ningún cambio. Intente de nuevo cuando tenga conexión.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backText}>‹  Volver</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Importar espacios</Text>
                <Text style={styles.description}>
                    Seleccione el inventario oficial. Antes de confirmar, relacione sus columnas con sede, pabellón, identificación, capacidad, tipo y recursos.
                </Text>

                <TouchableOpacity style={styles.fileButton} onPress={() => void chooseFile()} disabled={reading || saving}>
                    {reading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.fileButtonText}>Elegir Excel o CSV</Text>}
                </TouchableOpacity>
                {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}

                {sheets.length > 0 && (
                    <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetTabs}>
                            {sheets.map((sheet) => (
                                <TouchableOpacity
                                    key={sheet.name}
                                    style={[styles.sheetTab, activeSheet === sheet.name && styles.sheetTabActive]}
                                    onPress={() => setActiveSheet(sheet.name)}
                                >
                                    <Text style={[styles.sheetTabText, activeSheet === sheet.name && styles.sheetTabTextActive]}>
                                        {sheet.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {activeSheetData ? (
                            <>
                                <View style={styles.includeRow}>
                                    <View style={styles.includeCopy}>
                                        <Text style={styles.sectionTitle}>Incluir hoja «{activeSheetData.name}»</Text>
                                        <Text style={styles.helperText}>La fila de encabezados se detecta automáticamente.</Text>
                                    </View>
                                    <Switch
                                        value={includedSheets[activeSheetData.name] ?? false}
                                        onValueChange={(value) => setIncludedSheets((current) => ({ ...current, [activeSheetData.name]: value }))}
                                    />
                                </View>

                                <Text style={styles.sectionTitle}>Relacionar columnas</Text>
                                {roomFields.map((field) => {
                                    const column = activeMapping[field.key];
                                    const selectedLabel = typeof column === 'number' ? activeSheetData.headers[column] : 'Sin asignar';
                                    return (
                                        <TouchableOpacity
                                            key={field.key}
                                            style={styles.mappingRow}
                                            onPress={() => setPickerField(field.key)}
                                            disabled={!includedSheets[activeSheetData.name]}
                                        >
                                            <View style={styles.mappingCopy}>
                                                <Text style={styles.mappingLabel}>{field.label}{field.required ? ' *' : ''}</Text>
                                                <Text style={styles.mappingValue}>{selectedLabel}</Text>
                                            </View>
                                            <Text style={styles.mappingArrow}>›</Text>
                                        </TouchableOpacity>
                                    );
                                })}

                                <Text style={styles.sectionTitle}>Vista previa</Text>
                                {!includedSheets[activeSheetData.name] ? (
                                    <Text style={styles.helperText}>Esta hoja se excluirá de la importación.</Text>
                                ) : selectedRows.length === 0 ? (
                                    <Text style={styles.helperText}>Asigne las columnas para ver y validar sus filas.</Text>
                                ) : (
                                    <>
                                        <Text style={styles.summaryText}>
                                            {selectedRows.length} espacios · {issueCount} observaciones
                                        </Text>
                                        {selectedRows.slice(0, 30).map((row) => (
                                            <View key={`${row.sheet}-${row.rowNumber}`} style={[styles.previewCard, row.errors.length > 0 && styles.previewCardError]}>
                                                <Text style={styles.previewTitle}>Fila {row.rowNumber}: {row.identification || 'Sin identificación'}</Text>
                                                <Text style={styles.previewDetail}>{row.site || 'Sin sede'} · {row.pavilion || 'Sin pabellón'} · {row.type || 'Sin tipo'}</Text>
                                                <Text style={styles.previewDetail}>Capacidad: {row.capacity || '—'} · Recursos: {row.resources.join(', ') || 'Ninguno'}</Text>
                                                {row.errors.map((error) => <Text key={error} style={styles.errorText}>{error}</Text>)}
                                            </View>
                                        ))}
                                        {selectedRows.length > 30 ? <Text style={styles.helperText}>Se muestran las primeras 30 filas; se validan todas antes de confirmar.</Text> : null}
                                    </>
                                )}
                            </>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.confirmButton, !canImport && styles.disabledButton]}
                            onPress={() => void confirmImport()}
                            disabled={!canImport}
                        >
                            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.confirmText}>Validar y confirmar</Text>}
                        </TouchableOpacity>
                        <Text style={styles.footerNote}>Los cambios se confirman en una sola operación. Los espacios que no vienen en este archivo se conservan.</Text>
                    </>
                )}
            </ScrollView>

            <Modal visible={pickerField !== null} transparent animationType="slide" onRequestClose={() => setPickerField(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Seleccionar columna · {roomFields.find((field) => field.key === pickerField)?.label}</Text>
                        <ScrollView style={styles.columnOptions}>
                            {!roomFields.find((field) => field.key === pickerField)?.required ? (
                                <TouchableOpacity style={styles.columnOption} onPress={() => setColumn(null)}>
                                    <Text style={styles.columnOptionText}>Sin columna</Text>
                                </TouchableOpacity>
                            ) : null}
                            {activeSheetData?.headers.map((header, index) => (
                                <TouchableOpacity key={`${index}-${header}`} style={styles.columnOption} onPress={() => setColumn(index)}>
                                    <Text style={styles.columnOptionText}>{header}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerField(null)}>
                            <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: Colors.background, flex: 1 },
    content: { padding: Spacing.lg, paddingBottom: Spacing.huge },
    backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md, paddingVertical: Spacing.sm, paddingRight: Spacing.md },
    backText: { color: Colors.primary, fontSize: Typography.sizes.md, fontWeight: '700' },
    title: { color: Colors.textPrimary, fontSize: Typography.sizes.xl, fontWeight: '700' },
    description: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, lineHeight: Typography.sizes.sm * 1.5, marginTop: Spacing.sm },
    fileButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, justifyContent: 'center', marginTop: Spacing.lg, minHeight: 48, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    fileButtonText: { color: Colors.white, fontSize: Typography.sizes.md, fontWeight: '700' },
    fileName: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.sm },
    sheetTabs: { gap: Spacing.sm, paddingVertical: Spacing.lg },
    sheetTab: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    sheetTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    sheetTabText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '600' },
    sheetTabTextActive: { color: Colors.white },
    includeRow: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.md, flexDirection: 'row', marginBottom: Spacing.lg, padding: Spacing.md },
    includeCopy: { flex: 1, paddingRight: Spacing.sm },
    sectionTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginTop: Spacing.md },
    helperText: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.xs },
    mappingRow: { alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, flexDirection: 'row', marginTop: Spacing.sm, minHeight: 58, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    mappingCopy: { flex: 1 },
    mappingLabel: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, fontWeight: '600' },
    mappingValue: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, marginTop: 3 },
    mappingArrow: { color: Colors.primary, fontSize: 24, marginLeft: Spacing.sm },
    summaryText: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.sm },
    previewCard: { backgroundColor: Colors.white, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.sm, padding: Spacing.md },
    previewCardError: { borderColor: Colors.error },
    previewTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.sm, fontWeight: '700' },
    previewDetail: { color: Colors.textSecondary, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    errorText: { color: Colors.error, fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
    confirmButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md, justifyContent: 'center', marginTop: Spacing.xl, minHeight: 50, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    disabledButton: { opacity: 0.45 },
    confirmText: { color: Colors.white, fontSize: Typography.sizes.md, fontWeight: '700' },
    footerNote: { color: Colors.textTertiary, fontSize: Typography.sizes.xs, lineHeight: Typography.sizes.xs * 1.5, marginTop: Spacing.md, textAlign: 'center' },
    modalOverlay: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '80%', padding: Spacing.xl },
    modalTitle: { color: Colors.textPrimary, fontSize: Typography.sizes.md, fontWeight: '700', marginBottom: Spacing.md, textAlign: 'center' },
    columnOptions: { maxHeight: 400 },
    columnOption: { borderBottomColor: Colors.borderLight, borderBottomWidth: 1, minHeight: 48, justifyContent: 'center', paddingVertical: Spacing.md },
    columnOptionText: { color: Colors.textPrimary, fontSize: Typography.sizes.md },
    cancelButton: { alignItems: 'center', backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.md, paddingVertical: Spacing.md },
    cancelText: { color: Colors.textSecondary, fontSize: Typography.sizes.sm, fontWeight: '600' },
});

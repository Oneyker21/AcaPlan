import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

export interface ExportClassItem {
    seccion_codigo: string;
    asignatura_nombre: string;
    docente_nombre: string;
    aula_codigo?: string | null;
    dia: string;
    hora_inicio: string;
    hora_fin: string;
}

export interface ExportSectionInfo {
    codigo: string;
    carrera_nombre?: string;
    ano_estudio?: number;
}

export async function exportScheduleToExcel({
    periodoNombre = 'II Semestre 2026',
    turno = 'Matutino',
    clases,
    secciones = [],
}: {
    periodoNombre?: string;
    turno?: string;
    clases: ExportClassItem[];
    secciones?: ExportSectionInfo[];
}): Promise<void> {
    const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves'];
    const blocksDef = [
        { label: '08:00 - 09:30', start: '08:00', end: '09:30' },
        { label: '09:40 - 11:10', start: '09:40', end: '11:10' },
        { label: '11:20 - 12:50', start: '11:20', end: '12:50' },
    ];

    // Determine unique sections
    const sectionMap = new Map<string, ExportSectionInfo>();
    for (const sec of secciones) {
        sectionMap.set(sec.codigo, sec);
    }
    for (const c of clases) {
        if (!sectionMap.has(c.seccion_codigo)) {
            sectionMap.set(c.seccion_codigo, { codigo: c.seccion_codigo });
        }
    }
    const sortedSections = Array.from(sectionMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

    // Build header row 1 & 2
    const rows: (string | number)[][] = [];

    rows.push(['UNIVERSIDAD NACIONAL AUTÓNOMA DE NICARAGUA, MANAGUA (UNAN-MANAGUA)']);
    rows.push(['CENTRO UNIVERSITARIO REGIONAL - CHONTALES (CUR-CHONTALES)']);
    rows.push([`HORARIO OFICIAL DE CLASES · TURNO ${turno.toUpperCase()} · ${periodoNombre.toUpperCase()}`]);
    rows.push([]); // blank line

    // Header row
    const headerCols: string[] = ['Código Grupo', 'Carrera / Año'];
    for (const d of days) {
        for (let b = 0; b < blocksDef.length; b++) {
            headerCols.push(`${d}\nBloque ${b + 1} (${blocksDef[b].label})`);
        }
    }
    rows.push(headerCols);

    // Build data rows for each section
    for (const sec of sortedSections) {
        const rowData: string[] = [
            sec.codigo,
            sec.carrera_nombre ? `${sec.carrera_nombre}${sec.ano_estudio ? ` (${sec.ano_estudio}° Año)` : ''}` : sec.codigo,
        ];

        for (const d of days) {
            for (const b of blocksDef) {
                // Find matching class
                const match = clases.find(
                    (c) =>
                        c.seccion_codigo === sec.codigo &&
                        c.dia.toLowerCase() === d.toLowerCase() &&
                        c.hora_inicio.slice(0, 5) === b.start
                );

                if (match) {
                    const aulaStr = match.aula_codigo ? `Aula: ${match.aula_codigo}` : 'Sin aula asignada';
                    rowData.push(`${match.asignatura_nombre}\nDocente: ${match.docente_nombre}\n${aulaStr}`);
                } else {
                    rowData.push('—');
                }
            }
        }
        rows.push(rowData);
    }

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    const colWidths = [
        { wch: 16 }, // Código Grupo
        { wch: 32 }, // Carrera
    ];
    // 4 days * 3 blocks = 12 columns
    for (let i = 0; i < 12; i++) {
        colWidths.push({ wch: 30 });
    }
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horario Matutino');

    const cleanPeriod = periodoNombre.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Horario_${turno}_${cleanPeriod}.xlsx`;

    if (Platform.OS === 'web') {
        XLSX.writeFile(wb, filename);
        return;
    }

    // Native: write base64 and share via Expo Sharing
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: `Exportar Horario (${periodoNombre})`,
            UTI: 'com.microsoft.excel.xlsx',
        });
    }
}

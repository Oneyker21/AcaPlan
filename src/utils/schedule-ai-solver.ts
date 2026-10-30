import { DiaSemana } from '@/types/database';

export interface SolverSection {
    id_seccion: number;
    codigo: string;
    id_carrera: number;
    carrera_nombre?: string;
    ano_estudio: number;
    cantidad_estudiantes: number;
    modalidad: string;
    turno: string;
    sede?: string;
}

export interface SolverSubject {
    id_asignatura: number;
    codigo: string;
    nombre: string;
}

export interface SolverTeacher {
    id_docente: number;
    nombre: string;
    tipo_docente?: 'planta' | 'horario';
}

export interface SolverRoom {
    id_aula: number;
    codigo: string;
    capacidad: number;
    tipo: string;
    estado: string;
    sede?: string;
    recursos?: number[];
}

export interface SolverBlock {
    id_bloque: number;
    dia: DiaSemana;
    modalidad: string;
    turno: string;
    hora_inicio: string;
    hora_fin: string;
    es_receso: boolean;
}

export interface SolverRestriction {
    id_docente: number;
    dia: DiaSemana;
    hora_inicio: string;
    hora_fin: string;
}

export interface SolverNeed {
    id_componente: number;
    id_seccion: number;
    id_asignatura: number;
    id_docente: number;
    sesiones_semana: number;
    duracion_minutos: number;
    requiere_espacio_especializado?: boolean;
    observacion_espacio?: string;
    recursos_requeridos?: number[];
}

export interface ProposedClass {
    id_horario: string;
    id_seccion: number;
    seccion_codigo: string;
    id_asignatura: number;
    asignatura_nombre: string;
    id_docente: number;
    docente_nombre: string;
    id_aula: number | null;
    aula_codigo?: string;
    id_bloque: number;
    dia: DiaSemana;
    hora_inicio: string;
    hora_fin: string;
    numero_sesion: number;
    es_fijada?: boolean;
}

export interface SolverResult {
    estado: 'propuesta' | 'sin_solucion' | 'busqueda_limitada' | 'datos_incompletos';
    mensaje: string;
    clases: ProposedClass[];
    estadisticas: {
        totalSesiones: number;
        sesionesColocadas: number;
        sesionesFijadasPreservadas: number;
        pasosExplorados: number;
        huecosEstudiantilesEvitados: number;
        tiempoCalculoMs: number;
        optimoDemostrado: boolean;
    };
    pendientes: {
        seccion: string;
        asignatura: string;
        sesion: number;
        motivo: string;
    }[];
}

const DAYS: DiaSemana[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function timeToMinutes(timeStr: string): number {
    const [h = '0', m = '0'] = timeStr.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA < endB && startB < endA;
}

export function solveScheduleAI({
    sections,
    subjects,
    teachers,
    rooms,
    blocks,
    restrictions,
    needs,
    fixedClasses = [],
    lockedDays = [],
    considerarAulas = false,
    previousUnfixedPlacements = [],
    maxNodos = 10000,
    maxTimeMs = 5000,
}: {
    sections: SolverSection[];
    subjects: SolverSubject[];
    teachers: SolverTeacher[];
    rooms: SolverRoom[];
    blocks: SolverBlock[];
    restrictions: SolverRestriction[];
    needs: SolverNeed[];
    fixedClasses?: ProposedClass[];
    lockedDays?: DiaSemana[];
    considerarAulas?: boolean;
    previousUnfixedPlacements?: {
        id_seccion: number;
        id_asignatura: number;
        sessionNumber: number;
        id_bloque: number;
    }[];
    maxNodos?: number;
    maxTimeMs?: number;
}): SolverResult {
    const startTime = Date.now();
    const lockedDaysSet = new Set<DiaSemana>(lockedDays);

    // Map for penalizing previous unpinned blocks during reassignments
    const previousBlockMap = new Map<string, number>();
    for (const p of previousUnfixedPlacements) {
        const key = `${p.id_seccion}:${p.id_asignatura}:${p.sessionNumber}`;
        previousBlockMap.set(key, p.id_bloque);
    }

    // Map helpers
    const sectionsMap = new Map(sections.map((s) => [s.id_seccion, s]));
    const subjectsMap = new Map(subjects.map((s) => [s.id_asignatura, s]));
    const teachersMap = new Map(teachers.map((t) => [t.id_docente, t]));
    const activeBlocks = blocks.filter((b) => !b.es_receso);

    // Filter active rooms if rooms are requested
    const activeRooms = considerarAulas
        ? rooms.filter((r) => r.estado === 'activo')
        : [];

    // Pre-flight checks
    if (!sections.length || !needs.length || !activeBlocks.length) {
        return {
            estado: 'datos_incompletos',
            mensaje: 'Faltan datos requeridos (secciones, necesidades académicas o bloques horarios).',
            clases: [],
            estadisticas: {
                totalSesiones: 0,
                sesionesColocadas: 0,
                sesionesFijadasPreservadas: 0,
                pasosExplorados: 0,
                huecosEstudiantilesEvitados: 0,
                tiempoCalculoMs: Date.now() - startTime,
                optimoDemostrado: false,
            },
            pendientes: [],
        };
    }

    interface PlacementTask {
        need: SolverNeed;
        section: SolverSection;
        subject: SolverSubject;
        teacher: SolverTeacher;
        sessionNumber: number;
        candidates: {
            block: SolverBlock;
            room: SolverRoom | null;
            startMin: number;
            endMin: number;
        }[];
    }

    interface PlacedCandidate {
        task: PlacementTask;
        candidate: PlacementTask['candidates'][0];
        isFixed?: boolean;
    }

    // 1. Process fixed classes and locked days
    const placed: PlacedCandidate[] = [];
    const fixedCountBySectionSubject = new Map<string, number>();

    for (const fc of fixedClasses) {
        const isDayLocked = lockedDaysSet.has(fc.dia);
        const isPinned = fc.es_fijada;

        if (isDayLocked || isPinned) {
            const section = sectionsMap.get(fc.id_seccion) || {
                id_seccion: fc.id_seccion,
                codigo: fc.seccion_codigo,
                id_carrera: 0,
                ano_estudio: 1,
                cantidad_estudiantes: 30,
                modalidad: 'regular',
                turno: 'matutino',
            };
            const subject = subjectsMap.get(fc.id_asignatura) || {
                id_asignatura: fc.id_asignatura,
                codigo: '',
                nombre: fc.asignatura_nombre,
            };
            const teacher = teachersMap.get(fc.id_docente) || {
                id_docente: fc.id_docente,
                nombre: fc.docente_nombre,
            };
            const block = blocks.find((b) => b.id_bloque === fc.id_bloque) || {
                id_bloque: fc.id_bloque,
                dia: fc.dia,
                modalidad: 'regular',
                turno: 'matutino',
                hora_inicio: fc.hora_inicio,
                hora_fin: fc.hora_fin,
                es_receso: false,
            };
            const room = fc.id_aula ? (rooms.find((r) => r.id_aula === fc.id_aula) || null) : null;

            const fakeNeed: SolverNeed = {
                id_componente: 0,
                id_seccion: fc.id_seccion,
                id_asignatura: fc.id_asignatura,
                id_docente: fc.id_docente,
                sesiones_semana: 2,
                duracion_minutos: 90,
            };

            const key = `${fc.id_seccion}:${fc.id_asignatura}`;
            fixedCountBySectionSubject.set(key, (fixedCountBySectionSubject.get(key) || 0) + 1);

            placed.push({
                task: {
                    need: fakeNeed,
                    section,
                    subject,
                    teacher,
                    sessionNumber: fc.numero_sesion,
                    candidates: [],
                },
                candidate: {
                    block,
                    room,
                    startMin: timeToMinutes(fc.hora_inicio),
                    endMin: timeToMinutes(fc.hora_fin),
                },
                isFixed: true,
            });
        }
    }

    const sesionesFijadasPreservadas = placed.length;

    // 2. Build task list for sessions that are NOT yet fixed
    const tasks: PlacementTask[] = [];

    for (const need of needs) {
        const section = sectionsMap.get(need.id_seccion);
        const subject = subjectsMap.get(need.id_asignatura);
        const teacher = teachersMap.get(need.id_docente);

        if (!section || !subject || !teacher) continue;

        // How many sessions of this subject are already fixed/preserved?
        const key = `${need.id_seccion}:${need.id_asignatura}`;
        const alreadyFixedCount = fixedCountBySectionSubject.get(key) || 0;

        // Institutional rule: 2 sessions of 90 min per week per subject
        const targetSessions = Math.min(2, need.sesiones_semana || 2);
        const sessionsToSchedule = Math.max(0, targetSessions - alreadyFixedCount);

        if (sessionsToSchedule <= 0) continue;

        // Eligible blocks for this section's turn and modality
        // Exclude locked days so new assignments don't touch locked days
        const compatibleBlocks = activeBlocks.filter(
            (b) =>
                (b.turno === section.turno || section.turno === 'todos') &&
                (b.modalidad === section.modalidad || section.modalidad === 'regular') &&
                !lockedDaysSet.has(b.dia)
        );

        // Teacher restrictions (only apply if docente is 'horario')
        const teacherRestrictions = teacher.tipo_docente === 'horario'
            ? restrictions.filter((r) => r.id_docente === teacher.id_docente)
            : [];

        // Candidate blocks that don't violate teacher restrictions
        const validBlocks = compatibleBlocks.filter((b) => {
            const bStart = timeToMinutes(b.hora_inicio);
            const bEnd = timeToMinutes(b.hora_fin);
            return !teacherRestrictions.some((r) => {
                if (r.dia !== b.dia) return false;
                const rStart = timeToMinutes(r.hora_inicio);
                const rEnd = timeToMinutes(r.hora_fin);
                return intervalsOverlap(bStart, bEnd, rStart, rEnd);
            });
        });

        // Eligible rooms (if considerarAulas is enabled, otherwise [null])
        const eligibleRoomsList: (SolverRoom | null)[] = considerarAulas
            ? activeRooms.filter((r) => {
                if (r.capacidad < section.cantidad_estudiantes) return false;
                if (need.requiere_espacio_especializado && need.observacion_espacio) {
                    if (!r.tipo.toLowerCase().includes(need.observacion_espacio.toLowerCase())) {
                        return false;
                    }
                }
                return true;
            })
            : [null];

        // Cross product of valid blocks and eligible rooms
        const candidates: PlacementTask['candidates'] = [];
        for (const block of validBlocks) {
            for (const room of eligibleRoomsList) {
                candidates.push({
                    block,
                    room,
                    startMin: timeToMinutes(block.hora_inicio),
                    endMin: timeToMinutes(block.hora_fin),
                });
            }
        }

        // Add remaining sessions as tasks
        for (let s = alreadyFixedCount + 1; s <= targetSessions; s++) {
            tasks.push({
                need,
                section,
                subject,
                teacher,
                sessionNumber: s,
                candidates,
            });
        }
    }

    const totalSesiones = placed.length + tasks.length;
    let nodosExplorados = 0;
    let tiempoAgotado = false;

    // Check for impossible tasks (domains of size 0)
    const impossible = tasks.filter((t) => t.candidates.length === 0);
    if (impossible.length > 0 && tasks.length === impossible.length && placed.length === 0) {
        return {
            estado: 'sin_solucion',
            mensaje: `No hay franjas horarias disponibles para ${impossible.length} sesión(es). Revise la disponibilidad del docente o días desbloqueados.`,
            clases: [],
            estadisticas: {
                totalSesiones,
                sesionesColocadas: 0,
                sesionesFijadasPreservadas: 0,
                pasosExplorados: 0,
                huecosEstudiantilesEvitados: 0,
                tiempoCalculoMs: Date.now() - startTime,
                optimoDemostrado: false,
            },
            pendientes: impossible.map((t) => ({
                seccion: t.section.codigo,
                asignatura: t.subject.nombre,
                sesion: t.sessionNumber,
                motivo: 'Sin bloques compatibles con las restricciones y días disponibles.',
            })),
        };
    }

    // Sort tasks using MRV (Minimum Remaining Values heuristic)
    tasks.sort((a, b) => a.candidates.length - b.candidates.length);

    let bestSolution: PlacedCandidate[] = [...placed];
    let maxPlacedCount = placed.length;

    function hasConflict(
        task: PlacementTask,
        cand: PlacementTask['candidates'][0],
        currentPlaced: PlacedCandidate[]
    ): boolean {
        // Hard constraint: Cannot place on locked days
        if (lockedDaysSet.has(cand.block.dia)) return true;

        for (const p of currentPlaced) {
            // Check only if same day and time intervals overlap
            if (p.candidate.block.dia !== cand.block.dia) continue;
            if (
                !intervalsOverlap(
                    cand.startMin,
                    cand.endMin,
                    p.candidate.startMin,
                    p.candidate.endMin
                )
            ) {
                continue;
            }

            // Same teacher conflict
            if (p.task.teacher.id_docente === task.teacher.id_docente) return true;

            // Same section conflict (student group can't be in 2 classes at the same time)
            if (p.task.section.id_seccion === task.section.id_seccion) return true;

            // Same room conflict (if rooms are being considered)
            if (
                considerarAulas &&
                cand.room &&
                p.candidate.room &&
                cand.room.id_aula === p.candidate.room.id_aula
            ) {
                return true;
            }
        }

        // Hard constraint: Maximum 2 blocks per week of the same subject for that teacher & section
        let countForSubject = 0;
        for (const p of currentPlaced) {
            if (
                p.task.section.id_seccion === task.section.id_seccion &&
                p.task.subject.id_asignatura === task.subject.id_asignatura &&
                p.task.teacher.id_docente === task.teacher.id_docente
            ) {
                countForSubject++;
                if (countForSubject >= 2) {
                    return true;
                }
            }
        }

        // Pedagogical spacing rule: A group CANNOT have the same subject twice on the SAME day
        for (const p of currentPlaced) {
            if (
                p.task.section.id_seccion === task.section.id_seccion &&
                p.task.subject.id_asignatura === task.subject.id_asignatura &&
                p.candidate.block.dia === cand.block.dia
            ) {
                return true;
            }
        }

        return false;
    }

    // Calculate student gap score (fewer gaps = better)
    function calculateGaps(assignments: PlacedCandidate[]): number {
        let gapsAvoided = 0;
        const bySectionDay = new Map<string, { start: number; end: number }[]>();
        for (const a of assignments) {
            const key = `${a.task.section.id_seccion}:${a.candidate.block.dia}`;
            const list = bySectionDay.get(key) || [];
            list.push({ start: a.candidate.startMin, end: a.candidate.endMin });
            bySectionDay.set(key, list);
        }

        for (const list of bySectionDay.values()) {
            if (list.length > 1) {
                list.sort((a, b) => a.start - b.start);
                let continuous = true;
                for (let i = 1; i < list.length; i++) {
                    if (list[i].start > list[i - 1].end) {
                        continuous = false;
                    }
                }
                if (continuous) gapsAvoided++;
            }
        }
        return gapsAvoided;
    }

    // Backtracking solver
    function backtrack(taskIndex: number): boolean {
        if (nodosExplorados >= maxNodos || Date.now() - startTime >= maxTimeMs) {
            tiempoAgotado = true;
            return false;
        }

        nodosExplorados++;

        // Base case: all tasks placed
        if (taskIndex >= tasks.length) {
            bestSolution = [...placed];
            return true;
        }

        const currentTask = tasks[taskIndex];

        // Find if this subject/section already has a session placed
        const sibling = placed.find(
            (p) =>
                p.task.section.id_seccion === currentTask.section.id_seccion &&
                p.task.subject.id_asignatura === currentTask.subject.id_asignatura
        );

        // Count current load per day for this section to balance across the week
        const sectionDayCount: Record<string, number> = {
            Lunes: 0,
            Martes: 0,
            Miercoles: 0,
            Jueves: 0,
            Viernes: 0,
            Sabado: 0,
            Domingo: 0,
        };
        for (const p of placed) {
            if (p.task.section.id_seccion === currentTask.section.id_seccion) {
                sectionDayCount[p.candidate.block.dia] = (sectionDayCount[p.candidate.block.dia] || 0) + 1;
            }
        }

        // Sort candidate blocks: prioritize pedagogical alternating day pairs (Lunes-Miércoles, Martes-Jueves)
        const sortedCandidates = [...currentTask.candidates].sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            if (sibling) {
                const siblingDay = sibling.candidate.block.dia;
                // Standard university alternating day pairs
                const idealPair: Record<string, DiaSemana> = {
                    Lunes: 'Miercoles',
                    Martes: 'Jueves',
                    Miercoles: 'Lunes',
                    Jueves: 'Martes',
                };
                if (idealPair[siblingDay] === a.block.dia) scoreA -= 200;
                if (idealPair[siblingDay] === b.block.dia) scoreB -= 200;

                // Penalize consecutive day slightly
                if (Math.abs(DAYS.indexOf(a.block.dia) - DAYS.indexOf(siblingDay)) === 1) scoreA += 50;
                if (Math.abs(DAYS.indexOf(b.block.dia) - DAYS.indexOf(siblingDay)) === 1) scoreB += 50;
            } else {
                // For session 1: prioritize days with lower load for this group
                scoreA += (sectionDayCount[a.block.dia] || 0) * 40;
                scoreB += (sectionDayCount[b.block.dia] || 0) * 40;
            }

            // Tie-breaker 1: Day order
            scoreA += DAYS.indexOf(a.block.dia) * 10;
            scoreB += DAYS.indexOf(b.block.dia) * 10;

            // Tie-breaker 2: Time order (earlier blocks first)
            scoreA += a.startMin / 100;
            scoreB += b.startMin / 100;

            // Reassignment exploration: penalize previous block location so alternatives are chosen
            const taskKey = `${currentTask.section.id_seccion}:${currentTask.subject.id_asignatura}:${currentTask.sessionNumber}`;
            const prevBlockId = previousBlockMap.get(taskKey);
            if (prevBlockId !== undefined) {
                if (a.block.id_bloque === prevBlockId) scoreA += 250;
                if (b.block.id_bloque === prevBlockId) scoreB += 250;

                // Exploration noise so repeated clicks explore alternative permutations
                scoreA += Math.random() * 25;
                scoreB += Math.random() * 25;
            }

            return scoreA - scoreB;
        });

        for (const cand of sortedCandidates) {
            if (!hasConflict(currentTask, cand, placed)) {
                placed.push({ task: currentTask, candidate: cand, isFixed: false });

                if (placed.length > maxPlacedCount) {
                    maxPlacedCount = placed.length;
                    bestSolution = [...placed];
                }

                const found = backtrack(taskIndex + 1);
                if (found) return true;

                placed.pop();
                if (tiempoAgotado) return false;
            }
        }

        return false;
    }

    const completeSuccess = tasks.length === 0 ? true : backtrack(0);
    const finalPlaced = bestSolution;
    const huecosEvitados = calculateGaps(finalPlaced);

    // Convert placed solution to ProposedClass objects
    const clasesPropuestas: ProposedClass[] = finalPlaced.map((p, idx) => ({
        id_horario: p.isFixed ? `fijada-${idx + 1}` : `propuesta-${idx + 1}`,
        id_seccion: p.task.section.id_seccion,
        seccion_codigo: p.task.section.codigo,
        id_asignatura: p.task.subject.id_asignatura,
        asignatura_nombre: p.task.subject.nombre,
        id_docente: p.task.teacher.id_docente,
        docente_nombre: p.task.teacher.nombre,
        id_aula: p.candidate.room?.id_aula ?? null,
        aula_codigo: p.candidate.room?.codigo,
        id_bloque: p.candidate.block.id_bloque,
        dia: p.candidate.block.dia,
        hora_inicio: p.candidate.block.hora_inicio,
        hora_fin: p.candidate.block.hora_fin,
        numero_sesion: p.task.sessionNumber,
        es_fijada: p.isFixed ?? false,
    }));

    // Find which tasks were left unplaced
    const placedKeys = new Set(
        finalPlaced.map((p) => `${p.task.section.id_seccion}:${p.task.subject.id_asignatura}:${p.task.sessionNumber}`)
    );
    const pendientes = tasks
        .filter((t) => !placedKeys.has(`${t.section.id_seccion}:${t.subject.id_asignatura}:${t.sessionNumber}`))
        .map((t) => ({
            seccion: t.section.codigo,
            asignatura: t.subject.nombre,
            sesion: t.sessionNumber,
            motivo: 'Colisión de horario de docente o sección con otras clases colocadas.',
        }));

    const durationMs = Date.now() - startTime;

    if (completeSuccess) {
        return {
            estado: 'propuesta',
            mensaje: sesionesFijadasPreservadas > 0
                ? `Propuesta generada exitosamente. Se preservaron ${sesionesFijadasPreservadas} clases fijadas/bloqueadas y se asignaron ${tasks.length} sesiones restantes.`
                : 'Propuesta completa generada exitosamente respetando disponibilidad, distribución y límite de 2 bloques semanales.',
            clases: clasesPropuestas,
            estadisticas: {
                totalSesiones,
                sesionesColocadas: clasesPropuestas.length,
                sesionesFijadasPreservadas,
                pasosExplorados: nodosExplorados,
                huecosEstudiantilesEvitados: huecosEvitados,
                tiempoCalculoMs: durationMs,
                optimoDemostrado: true,
            },
            pendientes: [],
        };
    }

    if (clasesPropuestas.length > 0) {
        return {
            estado: tiempoAgotado ? 'busqueda_limitada' : 'sin_solucion',
            mensaje: tiempoAgotado
                ? `Búsqueda acotada: Se colocaron ${clasesPropuestas.length} de ${totalSesiones} sesiones antes de alcanzar el límite de tiempo.`
                : `Se colocaron ${clasesPropuestas.length} de ${totalSesiones} sesiones (${sesionesFijadasPreservadas} fijadas). Quedan ${pendientes.length} pendientes.`,
            clases: clasesPropuestas,
            estadisticas: {
                totalSesiones,
                sesionesColocadas: clasesPropuestas.length,
                sesionesFijadasPreservadas,
                pasosExplorados: nodosExplorados,
                huecosEstudiantilesEvitados: huecosEvitados,
                tiempoCalculoMs: durationMs,
                optimoDemostrado: false,
            },
            pendientes,
        };
    }

    return {
        estado: 'sin_solucion',
        mensaje: 'No fue posible encontrar una combinación válida con las restricciones y franjas actuales.',
        clases: [],
        estadisticas: {
            totalSesiones,
            sesionesColocadas: 0,
            sesionesFijadasPreservadas: 0,
            pasosExplorados: nodosExplorados,
            huecosEstudiantilesEvitados: 0,
            tiempoCalculoMs: durationMs,
            optimoDemostrado: false,
        },
        pendientes,
    };
}


/**
 * Clase principal que encapsula la lógica de las 3 fases.
 * Mantiene el código aislado, testeable y limpio.
 */
class AirportSimulation {
    constructor(config) {
        this.maxTime = config.maxTime;
        this.arrivalInterval = config.arrivalInterval;
        this.runwayUseTime = config.runwayUseTime;
        this.startArrivalsAtZero = config.startArrivalsAtZero !== false;

        this.finished = false;
        this.clock = 0;
        
        // Estado del sistema
        this.runwayFreeAt = 0; 
        this.queueLanding = 0;
        this.queueTakeoff = 0;
        
        // Contadores y métricas
        this.landingsCompleted = 0;
        this.takeoffsCompleted = 0;
        this.lastEventTime = 0;
        this.totalQueueArea = 0;

        // Lista de Eventos Futuros (FEL) - [Tiempo, TipoEvento]
        const firstArrivalTime = this.startArrivalsAtZero ? 0 : this.arrivalInterval;
        this.fel = [
            { time: firstArrivalTime, type: 'ARRIBO_ATERRIZAJE' },
            { time: firstArrivalTime, type: 'ARRIBO_DESPEGUE' }
        ];

        // Historial para la UI
        this.logs = [];
    }

    // --- FUNCIONES AUXILIARES ---
    get isRunwayFree() { return this.clock >= this.runwayFreeAt; }
    get totalQueue() { return this.queueLanding + this.queueTakeoff; }

    addLog(phase, action) {
        this.logs.push({
            time: this.clock,
            phase: phase,
            queueL: this.queueLanding,
            queueT: this.queueTakeoff,
            runwayState: this.isRunwayFree ? 'Libre' : 'Ocupada',
            action: action
        });
    }

    updateQueueMetrics() {
        const timePassed = this.clock - this.lastEventTime;
        if (timePassed > 0) {
            this.totalQueueArea += this.totalQueue * timePassed;
            this.lastEventTime = this.clock;
        }
    }

    scheduleEvent(time, type) {
        this.fel.push({ time, type });
        this.fel.sort((a, b) => a.time - b.time); // Mantener la FEL ordenada por tiempo
    }

    finishSimulation(actionText) {
        this.finished = true;
        this.addLog('-', actionText);
    }

    // --- LAS 3 FASES DE TOCHER ---

    processNextEvent() {
        if (this.finished) {
            return { done: true, newLogs: [] };
        }

        if (this.fel.length === 0) {
            this.finishSimulation('FIN SIMULACIÓN (sin eventos pendientes)');
            return { done: true, newLogs: [this.logs[this.logs.length - 1]] };
        }

        const logStartIndex = this.logs.length;

        // FASE A: Salto en el tiempo
        const nextTime = this.fel[0].time;
        if (nextTime > this.maxTime) {
            this.clock = this.maxTime;
            this.updateQueueMetrics();
            this.finishSimulation('FIN SIMULACIÓN');
            return { done: true, newLogs: this.logs.slice(logStartIndex) };
        }

        this.clock = nextTime;
        this.updateQueueMetrics();

        // FASE B: Ejecutar todos los eventos ligados al tiempo actual
        const bEvents = this.fel.filter(e => e.time === this.clock);
        this.fel = this.fel.filter(e => e.time !== this.clock);

        const bActionText = [];
        bEvents.forEach(event => {
            if (event.type === 'ARRIBO_ATERRIZAJE') {
                this.queueLanding++;
                this.scheduleEvent(this.clock + this.arrivalInterval, 'ARRIBO_ATERRIZAJE');
                bActionText.push('Llega avión para aterrizar');
            }
            if (event.type === 'ARRIBO_DESPEGUE') {
                this.queueTakeoff++;
                this.scheduleEvent(this.clock + this.arrivalInterval, 'ARRIBO_DESPEGUE');
                bActionText.push('Llega avión para despegar');
            }
            if (event.type === 'FIN_PISTA_ATERRIZAJE') {
                this.landingsCompleted++;
                bActionText.push('Pista liberada (Fin Aterrizaje)');
            }
            if (event.type === 'FIN_PISTA_DESPEGUE') {
                this.takeoffsCompleted++;
                bActionText.push('Pista liberada (Fin Despegue)');
            }
        });

        if (bActionText.length > 0) {
            this.addLog('B', bActionText.join(' | '));
        }

        // FASE C: Eventos condicionales según colas y estado de pista.
        let conditionalExecuted = false;

        if (this.isRunwayFree) {
            if (this.queueLanding > 0) {
                this.queueLanding--;
                this.runwayFreeAt = this.clock + this.runwayUseTime;
                this.scheduleEvent(this.runwayFreeAt, 'FIN_PISTA_ATERRIZAJE');
                this.addLog('C', 'Inicia maniobra de Aterrizaje');
                conditionalExecuted = true;
            } else if (this.queueTakeoff > 0) {
                this.queueTakeoff--;
                this.runwayFreeAt = this.clock + this.runwayUseTime;
                this.scheduleEvent(this.runwayFreeAt, 'FIN_PISTA_DESPEGUE');
                this.addLog('C', 'Inicia maniobra de Despegue');
                conditionalExecuted = true;
            }
        }

        if (!conditionalExecuted && bActionText.length > 0 && !this.isRunwayFree) {
            this.addLog('C', '(Pista ocupada, aviones esperan)');
        }

        return { done: this.finished, newLogs: this.logs.slice(logStartIndex) };
    }

    getResults() {
        const avgDenominator = this.clock > 0 ? this.clock : 1;
        return {
            landings: this.landingsCompleted,
            takeoffs: this.takeoffsCompleted,
            averageQueue: (this.totalQueueArea / avgDenominator).toFixed(2),
            logs: this.logs,
            clock: this.clock,
            finished: this.finished,
            queueLanding: this.queueLanding,
            queueTakeoff: this.queueTakeoff
        };
    }
}

// --- CONEXIÓN CON LA INTERFAZ (UI Controller) ---
document.addEventListener('DOMContentLoaded', () => {
    const THEME_STORAGE_KEY = 'airport-sim-theme';
    const availableThemes = ['elegante', 'minimal', 'tecnico'];

    const maxTimeInput = document.getElementById('param-max-time');
    const arrivalInput = document.getElementById('param-arrival-interval');
    const runwayInput = document.getElementById('param-runway-time');
    const realtimeInput = document.getElementById('param-realtime-ms');
    const startModeInput = document.getElementById('param-start-mode');
    const themeTabButtons = Array.from(document.querySelectorAll('.theme-tab'));

    const startButton = document.getElementById('btn-start');
    const pauseButton = document.getElementById('btn-pause');
    const resetButton = document.getElementById('btn-reset');
    const statusLabel = document.getElementById('sim-status');

    const landingsEl = document.getElementById('res-landings');
    const takeoffsEl = document.getElementById('res-takeoffs');
    const queueEl = document.getElementById('res-queue');
    const analysisContent = document.getElementById('analysis-content');

    const tbody = document.getElementById('table-body');

    let sim = null;
    let timerId = null;
    let isRunning = false;
    let currentConfig = null;

    function toPositiveInt(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
            return fallback;
        }
        return Math.floor(n);
    }

    function applyTheme(themeName) {
        const safeTheme = availableThemes.includes(themeName) ? themeName : 'elegante';

        document.body.setAttribute('data-theme', safeTheme);
        themeTabButtons.forEach(button => {
            const isActive = button.dataset.theme === safeTheme;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    }

    function setStatus(text, tone = 'ready') {
        statusLabel.textContent = `Estado: ${text}`;
        statusLabel.setAttribute('data-tone', tone);
    }

    function stopTimer() {
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function updateButtons() {
        pauseButton.disabled = !sim;
        pauseButton.textContent = isRunning ? 'Pausar' : 'Reanudar';
    }

    function renderDashboard(results) {
        landingsEl.textContent = String(results.landings);
        takeoffsEl.textContent = String(results.takeoffs);
        queueEl.textContent = results.averageQueue;
    }

    function appendLogs(logs) {
        logs.forEach(log => {
            const tr = document.createElement('tr');

            const statusClass = log.runwayState === 'Libre' ? 'status-libre' : 'status-ocupada';

            tr.innerHTML = `
                <td><strong>${log.time}</strong></td>
                <td>${log.phase}</td>
                <td style="text-align:center">${log.queueL}</td>
                <td style="text-align:center">${log.queueT}</td>
                <td class="${statusClass}">${log.runwayState}</td>
                <td>${log.action}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function clearTable() {
        tbody.innerHTML = '';
    }

    function resetUI() {
        clearTable();
        renderDashboard({ landings: 0, takeoffs: 0, averageQueue: '0.00' });
        analysisContent.innerHTML = `
            <div class="analysis-report">
                <div class="analysis-block">
                    <h3>Análisis listo para generar</h3>
                    <p>Iniciá una simulación y al finalizar vas a ver un reporte con métricas clave, diagnóstico y mejoras recomendadas.</p>
                </div>
            </div>
        `;
        setStatus('Lista para iniciar', 'ready');
        pauseButton.disabled = true;
        pauseButton.textContent = 'Pausar';
    }

    function renderRunningAnalysis() {
        analysisContent.innerHTML = `
            <div class="analysis-report">
                <div class="analysis-block">
                    <h3>Simulación en curso</h3>
                    <p>Estamos recolectando eventos para calcular indicadores de carga, estabilidad y rendimiento operativo.</p>
                </div>
            </div>
        `;
    }

    function buildResultAnalysis(results, config) {
        const lambda = 2 / config.arrivalInterval;
        const mu = 1 / config.runwayUseTime;
        const trafficIntensity = lambda / mu;
        const throughput = (results.landings + results.takeoffs) / Math.max(results.clock, 1);
        const averageQueue = Number(results.averageQueue);
        const pendingQueue = results.queueLanding + results.queueTakeoff;
        const pressurePercent = trafficIntensity * 100;
        const throughputUsePercent = (throughput / Math.max(mu, 0.0001)) * 100;

        let levelLabel = 'Estable';
        let levelClass = 'analysis-badge--ok';
        if (trafficIntensity >= 1 || averageQueue >= 2 || pendingQueue >= 6) {
            levelLabel = 'Crítico';
            levelClass = 'analysis-badge--critical';
        } else if (trafficIntensity >= 0.8 || averageQueue >= 1.2 || pendingQueue >= 3) {
            levelLabel = 'En tensión';
            levelClass = 'analysis-badge--warn';
        }

        let diagnosis = '';
        if (trafficIntensity >= 1) {
            diagnosis = 'El sistema está pasado de carga: entran aviones al mismo ritmo o más rápido de lo que la pista puede absorber.';
        } else if (averageQueue >= 1.5) {
            diagnosis = 'La capacidad promedio alcanza, pero tenés picos de congestión que generan acumulaciones y demoras visibles.';
        } else {
            diagnosis = 'La operación se mantuvo estable: la pista sostuvo la demanda y las colas quedaron controladas.';
        }

        let nonViablePoint = '';
        if (trafficIntensity >= 1) {
            nonViablePoint = 'Con estos parámetros no es viable sostener fluidez: la tasa de llegada total es igual o mayor que la capacidad de pista, por lo que la cola tiende a crecer sin techo.';
        } else {
            nonViablePoint = 'Aunque el promedio da bien, no es viable aspirar a demoras cero: aterrizajes y despegues coinciden y la prioridad de aterrizaje desplaza la salida de despegues.';
        }

        const improvements = [];
        if (trafficIntensity >= 1) {
            const suggestedArrival = Math.ceil(2 * config.runwayUseTime + 1);
            improvements.push(`Aumentá el intervalo de llegada a ${suggestedArrival} min o más para bajar la presión de entrada.`);
            improvements.push('Reducí el tiempo de uso de pista por maniobra con mejoras operativas o procedimientos más ágiles.');
        } else {
            improvements.push('Desfasá el patrón de aterrizajes y despegues para evitar picos simultáneos.');
            improvements.push('Revisá una regla de prioridad dinámica cuando la cola de despegue supere un umbral.');
        }

        if (pendingQueue > 0) {
            improvements.push(`Quedaron ${pendingQueue} aviones en cola al cierre: considerá extender ventana de simulación para evaluar vaciado de backlog.`);
        } else {
            improvements.push('La cola final quedó en cero: el esquema actual es razonable para esta carga de trabajo.');
        }

        return `
            <div class="analysis-report">
                <div class="analysis-kpi-grid">
                    <article class="analysis-kpi">
                        <div class="analysis-kpi-label">Intensidad de tráfico (λ/μ)</div>
                        <div class="analysis-kpi-value">${trafficIntensity.toFixed(2)}</div>
                        <span class="analysis-badge ${levelClass}">${levelLabel}</span>
                    </article>
                    <article class="analysis-kpi">
                        <div class="analysis-kpi-label">Presión de pista</div>
                        <div class="analysis-kpi-value">${pressurePercent.toFixed(0)}%</div>
                        <span class="analysis-badge ${levelClass}">Carga operativa</span>
                    </article>
                    <article class="analysis-kpi">
                        <div class="analysis-kpi-label">Throughput observado</div>
                        <div class="analysis-kpi-value">${throughput.toFixed(2)}</div>
                        <span class="analysis-badge analysis-badge--ok">${throughputUsePercent.toFixed(0)}% de uso</span>
                    </article>
                    <article class="analysis-kpi">
                        <div class="analysis-kpi-label">Cola promedio</div>
                        <div class="analysis-kpi-value">${averageQueue.toFixed(2)}</div>
                        <span class="analysis-badge ${averageQueue >= 1.5 ? 'analysis-badge--warn' : 'analysis-badge--ok'}">${averageQueue >= 1.5 ? 'Con acumulación' : 'Controlada'}</span>
                    </article>
                </div>

                <section class="analysis-block">
                    <h3>Diagnóstico operativo</h3>
                    <p>${diagnosis}</p>
                </section>

                <section class="analysis-block">
                    <h3>Fundamento numérico</h3>
                    <p>Llegadas promedio: ${lambda.toFixed(2)} aviones/min. Capacidad de pista: ${mu.toFixed(2)} aviones/min. Intensidad: ${trafficIntensity.toFixed(2)}. Throughput medido: ${throughput.toFixed(2)} aviones/min.</p>
                </section>

                <section class="analysis-block">
                    <h3>Punto no viable con estos parámetros</h3>
                    <p>${nonViablePoint}</p>
                </section>

                <section class="analysis-block">
                    <h3>Plan de mejora sugerido</h3>
                    <ul class="analysis-list">
                        ${improvements.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </section>

                <section class="analysis-block">
                    <h3>Cierre de corrida</h3>
                    <p>Finalizó en T=${results.clock} con ${results.landings} aterrizajes, ${results.takeoffs} despegues y ${pendingQueue} aviones pendientes en cola.</p>
                </section>
            </div>
        `;
    }

    function renderFinalAnalysis(results) {
        if (!currentConfig) {
            analysisContent.innerHTML = `
                <div class="analysis-report">
                    <div class="analysis-block">
                        <h3>No se pudo generar el reporte</h3>
                        <p>No hay una configuración válida asociada a esta corrida para calcular el análisis.</p>
                    </div>
                </div>
            `;
            return;
        }

        analysisContent.innerHTML = buildResultAnalysis(results, currentConfig);
    }

    function runStep() {
        if (!sim) {
            return;
        }

        const stepResult = sim.processNextEvent();
        appendLogs(stepResult.newLogs);
        const results = sim.getResults();
        renderDashboard(results);

        if (stepResult.done) {
            stopTimer();
            isRunning = false;
            updateButtons();
            setStatus(`Finalizada en T=${results.clock}`, 'done');
            renderFinalAnalysis(results);
        }
    }

    function startTimer() {
        const msPerEvent = toPositiveInt(realtimeInput.value, 1000);
        timerId = setInterval(runStep, msPerEvent);
    }

    function buildSimulationFromInputs() {
        const config = {
            maxTime: toPositiveInt(maxTimeInput.value, 20),
            arrivalInterval: toPositiveInt(arrivalInput.value, 4),
            runwayUseTime: toPositiveInt(runwayInput.value, 3),
            startArrivalsAtZero: startModeInput.value === 't0'
        };

        currentConfig = config;
        sim = new AirportSimulation(config);
    }

    startButton.addEventListener('click', () => {
        stopTimer();
        buildSimulationFromInputs();
        clearTable();
        renderDashboard({ landings: 0, takeoffs: 0, averageQueue: '0.00' });

        isRunning = true;
        updateButtons();
        setStatus('Ejecutando', 'running');
        renderRunningAnalysis();

        runStep();
        if (sim && !sim.finished) {
            startTimer();
        }
    });

    pauseButton.addEventListener('click', () => {
        if (!sim) {
            return;
        }

        if (sim.finished) {
            setStatus('La simulación ya terminó', 'done');
            return;
        }

        if (isRunning) {
            stopTimer();
            isRunning = false;
            setStatus('Pausada', 'paused');
        } else {
            isRunning = true;
            setStatus('Ejecutando', 'running');
            startTimer();
        }

        updateButtons();
    });

    resetButton.addEventListener('click', () => {
        stopTimer();
        sim = null;
        isRunning = false;
        currentConfig = null;
        resetUI();
    });

    realtimeInput.addEventListener('change', () => {
        if (!sim || !isRunning) {
            return;
        }

        stopTimer();
        startTimer();
    });

    themeTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            applyTheme(button.dataset.theme);
        });

        button.addEventListener('keydown', event => {
            const currentIndex = themeTabButtons.indexOf(button);
            if (currentIndex === -1) {
                return;
            }

            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                const nextIndex = (currentIndex + 1) % themeTabButtons.length;
                themeTabButtons[nextIndex].focus();
                applyTheme(themeTabButtons[nextIndex].dataset.theme);
            }

            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                const prevIndex = (currentIndex - 1 + themeTabButtons.length) % themeTabButtons.length;
                themeTabButtons[prevIndex].focus();
                applyTheme(themeTabButtons[prevIndex].dataset.theme);
            }

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                applyTheme(button.dataset.theme);
            }
        });
    });

    const initialTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'elegante';
    applyTheme(initialTheme);

    resetUI();
});
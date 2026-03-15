
/**
 * Clase principal que encapsula la lógica de las 3 fases.
 * Mantiene el código aislado, testeable y limpio.
 */
class AirportSimulation {
    constructor(config) {
        this.maxTime = config.maxTime;
        this.arrivalInterval = config.arrivalInterval;
        this.runwayUseTime = config.runwayUseTime;

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
        this.fel = [
            { time: 0, type: 'ARRIBO_ATERRIZAJE' },
            { time: 0, type: 'ARRIBO_DESPEGUE' }
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
    const maxTimeInput = document.getElementById('param-max-time');
    const arrivalInput = document.getElementById('param-arrival-interval');
    const runwayInput = document.getElementById('param-runway-time');
    const realtimeInput = document.getElementById('param-realtime-ms');

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

    function setStatus(text) {
        statusLabel.textContent = `Estado: ${text}`;
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
        analysisContent.innerHTML = 'Ejecutá una simulación para ver el análisis automático.';
        setStatus('Lista para iniciar');
        pauseButton.disabled = true;
        pauseButton.textContent = 'Pausar';
    }

    function renderRunningAnalysis() {
        analysisContent.innerHTML = '<p>La simulación está en curso. El análisis aparecerá automáticamente al finalizar.</p>';
    }

    function buildResultAnalysis(results, config) {
        const lambda = 2 / config.arrivalInterval;
        const mu = 1 / config.runwayUseTime;
        const trafficIntensity = lambda / mu;
        const throughput = (results.landings + results.takeoffs) / Math.max(results.clock, 1);
        const averageQueue = Number(results.averageQueue);
        const pendingQueue = results.queueLanding + results.queueTakeoff;

        let diagnosis = '';
        if (trafficIntensity >= 1) {
            diagnosis = 'El sistema quedó exigido: están entrando aviones al mismo ritmo o más rápido de lo que la pista puede atender.';
        } else if (averageQueue >= 1.5) {
            diagnosis = 'La capacidad alcanza en promedio, pero la cola sigue alta por acumulaciones en ciertos momentos.';
        } else {
            diagnosis = 'El comportamiento fue estable: la pista logró sostener la operación con colas relativamente controladas.';
        }

        let nonViablePoint = '';
        if (trafficIntensity >= 1) {
            nonViablePoint = 'Con estos parámetros no es viable mantener una operación fluida: la tasa de llegada total es igual o mayor que la capacidad de pista, así que la cola tiende a crecer.';
        } else {
            nonViablePoint = 'Aunque la capacidad promedio parece suficiente, no es viable esperar demoras cero con estos parámetros: llegan aterrizajes y despegues al mismo instante y la prioridad de aterrizaje desplaza despegues.';
        }

        let improvement = '';
        if (trafficIntensity >= 1) {
            const suggestedArrival = Math.ceil(2 * config.runwayUseTime + 1);
            improvement = `Mejora sugerida: aumentá el intervalo de llegada al menos a ${suggestedArrival} min o reducí el uso de pista por maniobra para bajar la presión sobre la cola.`;
        } else {
            improvement = 'Mejora sugerida: separá el intervalo de llegadas de aterrizajes y despegues para evitar picos simultáneos y reducir esperas puntuales.';
        }

        return `
            <p><strong>Diagnóstico:</strong> ${diagnosis}</p>
            <p><strong>Fundamento numérico:</strong> Llegadas promedio = ${lambda.toFixed(2)} aviones/min, capacidad de pista = ${mu.toFixed(2)} aviones/min, intensidad de tráfico = ${trafficIntensity.toFixed(2)}. Además, el throughput observado fue ${throughput.toFixed(2)} aviones/min y la cola promedio ${averageQueue.toFixed(2)}.</p>
            <p><strong>Punto no viable con estos parámetros:</strong> ${nonViablePoint}</p>
            <p><strong>Mejora concreta:</strong> ${improvement}</p>
            <p><strong>Cierre:</strong> Terminaste en T=${results.clock} con ${results.landings} aterrizajes, ${results.takeoffs} despegues y ${pendingQueue} aviones pendientes en cola.</p>
        `;
    }

    function renderFinalAnalysis(results) {
        if (!currentConfig) {
            analysisContent.innerHTML = '<p>No hay configuración disponible para analizar esta corrida.</p>';
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
            setStatus(`Finalizada en T=${results.clock}`);
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
            runwayUseTime: toPositiveInt(runwayInput.value, 3)
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
        setStatus('Ejecutando');
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
            setStatus('La simulación ya terminó');
            return;
        }

        if (isRunning) {
            stopTimer();
            isRunning = false;
            setStatus('Pausada');
        } else {
            isRunning = true;
            setStatus('Ejecutando');
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

    resetUI();
});
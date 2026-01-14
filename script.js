const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas de résultats
const mainCtx = document.getElementById('mainGraph').getContext('2d');
const subCtx1 = document.getElementById('subGraph1').getContext('2d');
const subCtx2 = document.getElementById('subGraph2').getContext('2d');
const subCtx3 = document.getElementById('subGraph3').getContext('2d');
const miniGraph = document.getElementById('miniGraph').getContext('2d');

// Redimensionnement initial
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- CONFIGURATION ---
const PHASE1_DURATION = 30000;
const PHASE2_DURATION = 20000;
const ROBOT_SPEED = 0.25;
const DASHBOARD_W = 320;

// --- VARIABLES GLOBALES ---
let gameState = 'MENU';
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
let prevMouse = { x: 0, y: 0, t: 0 };
let startTime = 0;
let phaseTimeLeft = 0;

// Données scientifiques
let phase1Data = [];
let phase2Data = [];
let currentStroke = [];

// Métriques avancées
let correctionCount = 0;
let lastCorrectionTime = 0;

// Objets de jeu
let guide = { x: 0, y: 0, currentPoint: 0 };
let pathPoints = [];
let targets = [];

// Traînée visuelle
let trail = [];

// --- GESTION DU RESIZE ---
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (gameState === 'PHASE1') {
        generateRobotPath();
    }
});

// --- INITIALISATION DU CHEMIN ROBOT ---
function generateRobotPath() {
    pathPoints = [];

    let margin = 80;
    let safeWidth = canvas.width - DASHBOARD_W - (margin * 2);
    let safeHeight = canvas.height - (margin * 2);

    if (safeWidth < 100) safeWidth = 100;
    if (safeHeight < 100) safeHeight = 100;

    let x = margin;
    let y = margin;

    pathPoints.push({ x: x, y: y });
    pathPoints.push({ x: x + safeWidth, y: y });
    pathPoints.push({ x: x + safeWidth, y: y + safeHeight });
    pathPoints.push({ x: x, y: y + safeHeight });
    pathPoints.push({ x: x, y: y });

    guide.x = pathPoints[0].x;
    guide.y = pathPoints[0].y;
    guide.currentPoint = 0;
}

// --- GESTION DES INPUTS ---
document.getElementById('btn-start').addEventListener('click', () => {
    document.getElementById('card-intro').classList.add('hidden');
    document.getElementById('game-overlay').style.display = 'none';
    startPhase1();
});

document.getElementById('btn-learn-more').addEventListener('click', () => {
    document.getElementById('card-result').classList.add('hidden');
    document.getElementById('card-science').classList.remove('hidden');
});

window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', () => {
    if (gameState === 'PHASE2') {
        for (let i = 0; i < targets.length; i++) {
            let d = Math.hypot(mouse.x - targets[i].x, mouse.y - targets[i].y);
            if (d < targets[i].r + 20) {
                // Effet visuel de destruction
                createParticles(targets[i].x, targets[i].y);
                targets.splice(i, 1);
                spawnTarget();
                break;
            }
        }
    }
});

// --- SYSTÈME DE PARTICULES ---
let particles = [];

function createParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.fillStyle = `rgba(255, 63, 52, ${p.life})`;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
}

// --- BOUCLE PRINCIPALE ---
function loop() {
    if (gameState === 'MENU' || gameState === 'RESULTS') return;

    let now = Date.now();
    let dt = now - prevMouse.t;

    // Calcul vitesse
    let dist = Math.hypot(mouse.x - prevMouse.x, mouse.y - prevMouse.y);
    let velocity = (dt > 0) ? dist / dt : 0;
    velocity = velocity * 0.85;

    // Gestion chronomètre
    let elapsed = now - startTime;
    let duration = (gameState === 'PHASE1') ? PHASE1_DURATION : PHASE2_DURATION;
    phaseTimeLeft = Math.max(0, Math.ceil((duration - elapsed) / 1000));

    let timerDiv = document.getElementById('timer-display');
    timerDiv.innerText = phaseTimeLeft < 10 ? "00:0" + phaseTimeLeft : "00:" + phaseTimeLeft;
    timerDiv.style.color = (phaseTimeLeft <= 5) ? "#ff3f34" : "white";

    // --- PHASE 1 ---
    if (gameState === 'PHASE1') {
        moveGuide(dt);

        if (velocity > 0.05) {
            phase1Data.push({ t: now, v: velocity });
        }

        // Détection des micro-corrections (Feedback Loop Struggle)
        // Si l'erreur de vitesse est > 30% et qu'il s'est écoulé 200ms depuis la dernière
        let speedError = Math.abs(velocity - ROBOT_SPEED);
        if (speedError > ROBOT_SPEED * 0.3 && now - lastCorrectionTime > 200) {
            correctionCount++;
            lastCorrectionTime = now;
        }

        // Score robotique
        let distToGuide = Math.hypot(mouse.x - guide.x, mouse.y - guide.y);
        let panicScore = (speedError * 150) + (distToGuide / 3);
        updateMeter(panicScore);

        // Feedback temps réel
        updateSpeedFeedback(velocity, speedError);

        if (elapsed >= PHASE1_DURATION) {
            startPhase2();
            return;
        }
    }

    // --- PHASE 2 ---
    if (gameState === 'PHASE2') {
        if (velocity > 0.1) {
            currentStroke.push({ t: now, v: velocity });
        } else {
            // Fin d'un mouvement, on regarde si c'est le meilleur (le plus long)
            if (currentStroke.length > 15) {
                if (currentStroke.length > phase2Data.length) {
                    phase2Data = [...currentStroke];
                }
            }
            currentStroke = [];
        }

        // Traînée visuelle
        trail.push({ x: mouse.x, y: mouse.y, alpha: 1.0 });
        if (trail.length > 15) trail.shift();

        for (let t of trail) {
            t.alpha -= 0.07;
        }

        updateParticles();

        if (elapsed >= PHASE2_DURATION) {
            endGame();
            return;
        }
    }

    // Dessin
    drawGame(velocity);
    drawMiniGraph(velocity);

    // Update
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    prevMouse.t = now;

    requestAnimationFrame(loop);
}

// --- FEEDBACK TEMPS RÉEL ---
function updateSpeedFeedback(velocity, speedError) {
    document.getElementById('current-speed').textContent = velocity.toFixed(2);
    document.getElementById('target-speed').textContent = ROBOT_SPEED.toFixed(2);

    let errorPct = ((speedError / ROBOT_SPEED) * 100).toFixed(0);
    let errorEl = document.getElementById('speed-error');
    errorEl.textContent = errorPct + "%";
    errorEl.style.color = errorPct > 30 ? "#ff3f34" : "#0be881";
}

// --- DÉPLACEMENT GUIDE ---
function moveGuide(dt) {
    if (pathPoints.length < 2) return;

    let distToTravel = ROBOT_SPEED * dt;
    let targetP = pathPoints[guide.currentPoint + 1];
    if (!targetP) return;

    let dx = targetP.x - guide.x;
    let dy = targetP.y - guide.y;
    let distToTarget = Math.hypot(dx, dy);

    if (distToTravel >= distToTarget) {
        guide.x = targetP.x;
        guide.y = targetP.y;
        guide.currentPoint++;
        if (guide.currentPoint >= pathPoints.length - 1) guide.currentPoint = 0;
    } else {
        let ratio = distToTravel / distToTarget;
        guide.x += dx * ratio;
        guide.y += dy * ratio;
    }
}

// --- GESTION DES PHASES ---
function startPhase1() {
    gameState = 'PHASE1';
    startTime = Date.now();
    prevMouse.t = startTime;
    phase1Data = [];
    correctionCount = 0;
    lastCorrectionTime = 0;

    generateRobotPath();

    document.getElementById('phase-indicator').innerText = "PHASE 1: ESCORTE";
    document.getElementById('phase-indicator').style.color = "#00e5ff";
    loop();
}

function startPhase2() {
    gameState = 'PHASE2';
    startTime = Date.now();
    phase2Data = [];
    trail = [];

    document.body.style.backgroundColor = "#220000";
    setTimeout(() => document.body.style.backgroundColor = "#050505", 200);

    document.getElementById('phase-indicator').innerText = "PHASE 2: SURCHARGE";
    document.getElementById('phase-indicator').style.color = "#ff3f34";

    spawnTarget();
    loop();
}

function spawnTarget() {
    if (gameState !== 'PHASE2') return;

    let r = 25;
    let padding = 50;

    let minX = padding;
    let maxX = canvas.width - DASHBOARD_W - padding;
    let minY = padding;
    let maxY = canvas.height - padding;

    let t = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
        r: r
    };
    targets.push(t);
}

function endGame() {
    gameState = 'RESULTS';
    document.getElementById('game-overlay').style.display = 'flex';
    document.getElementById('card-result').classList.remove('hidden');

    renderResults();
}

// --- RENDU RÉSULTATS ---
function renderResults() {
    // 1. Calcul des corrections Phase 2 (Hésitations dans le geste)
    // On analyse la courbe enregistrée (phase2Data)
    // Une courbe parfaite a 1 seul pic de vitesse.
    // Chaque pic supplémentaire est une "hésitation" (micro-correction).
    let p2Peaks = countPeaks(phase2Data);
    // Si 0 ou 1 pic, c'est parfait (0 correction). Sinon corrections = pics - 1.
    let correctionCountP2 = Math.max(0, p2Peaks - 1);

    // --- MISE À JOUR DOM ---

    // Robot : Toujours 0
    document.getElementById('corrections-robot').textContent = "0";

    // Phase 1 : Le compteur accumulé pendant les 30s
    document.getElementById('corrections-phase1').textContent = correctionCount;

    // Phase 2 : Calculé sur le meilleur mouvement
    // On ajoute un astérisque ou texte pour dire que c'est sur le geste
    document.getElementById('corrections-phase2').textContent = correctionCountP2;

    // Graphiques
    drawSingleCurve(subCtx1, "ROBOT", '#00e5ff', true);
    drawSingleCurve(subCtx2, "INFILTRATION", '#ff3f34', false, phase1Data);
    drawSingleCurve(subCtx3, "NATUREL", '#0be881', false, phase2Data);
    drawOverlayChart(mainCtx);

    // Texte d'analyse
    updateAnalysisText(correctionCount, correctionCountP2);
}

// Compte les pics locaux de vitesse (Hésitations)
function countPeaks(data) {
    if (data.length < 3) return 0;
    let peaks = 0;
    // On lisse un peu les données pour éviter le bruit de la souris
    for (let i = 1; i < data.length - 1; i++) {
        let prev = data[i - 1].v;
        let curr = data[i].v;
        let next = data[i + 1].v;

        if (curr > prev && curr > next && curr > 0.1) {
            peaks++;
        }
    }
    return peaks;
}

function updateAnalysisText(c1, c2) {
    let text = `📊 INTERPRÉTATION DES RÉSULTATS

🔵 ROBOT (Théorique) :
0 Micro-correction. Le mouvement est calculé parfaitement.

🔴 PHASE 1 (Contrôle Conscient) :
${c1} Micro-corrections détectées !
Votre cerveau lutte pour corriger l'erreur en permanence (Feedback).
C'est lent, haché et coûteux en énergie.

🟢 PHASE 2 (Contrôle Naturel) :
${c2} Micro-correction(s) sur ce geste.
Votre cerveau a planifié tout le mouvement à l'avance (Feedforward).
C'est fluide, balistique et efficace (Minimum Jerk).

CONCLUSION :
A faire.`;

    document.getElementById('analysis-text').textContent = text;
}

// --- FONCTIONS MATHÉMATIQUES UTILES ---
function average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

// --- RENDU GRAPHIQUE ---
function drawGame(vel) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'PHASE2') {
        // Traînée
        trail.forEach(t => {
            if (t.alpha > 0) {
                ctx.fillStyle = `rgba(255, 63, 52, ${t.alpha * 0.5})`;
                ctx.fillRect(t.x - 3, t.y - 3, 6, 6);
            }
        });

        drawParticles();
    }

    // Curseur
    ctx.strokeStyle = gameState === 'PHASE1' ? '#00e5ff' : '#ff3f34';
    ctx.lineWidth = 3;
    ctx.strokeRect(mouse.x - 10, mouse.y - 10, 20, 20);

    if (gameState === 'PHASE1') {
        // Guide avec zone de tolérance
        let distToGuide = Math.hypot(mouse.x - guide.x, mouse.y - guide.y);
        let inZone = distToGuide < 50;

        ctx.fillStyle = inZone ? 'rgba(11, 232, 129, 0.15)' : 'rgba(255, 63, 52, 0.15)';
        ctx.beginPath();
        ctx.arc(guide.x, guide.y, 50, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(guide.x, guide.y, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = "12px monospace";
        ctx.fillText("GUIDE", guide.x - 20, guide.y - 40);

        // Lien élastique
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(guide.x, guide.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.stroke();
    }

    if (gameState === 'PHASE2') {
        ctx.fillStyle = '#ff3f34';
        targets.forEach(t => {
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ff3f34';
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.r + 5 + Math.sin(Date.now() * 0.01) * 5, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
}

// --- HUD ---
let graphHistory = [];
function drawMiniGraph(vel) {
    graphHistory.push(vel);
    if (graphHistory.length > 80) graphHistory.shift();

    miniGraph.clearRect(0, 0, 200, 100);
    miniGraph.strokeStyle = '#00e5ff';
    miniGraph.lineWidth = 1;
    miniGraph.beginPath();
    for (let i = 0; i < graphHistory.length; i++) {
        let y = 100 - (graphHistory[i] * 50);
        if (i === 0) miniGraph.moveTo(i * 2.5, y);
        else miniGraph.lineTo(i * 2.5, y);
    }
    miniGraph.stroke();
}

function updateMeter(val) {
    let fill = document.getElementById('jerk-meter-fill');
    let pct = Math.min(val, 100);
    fill.style.width = pct + "%";

    let label = document.getElementById('jerk-label');
    let alert = document.getElementById('alert-msg');

    if (pct > 50) {
        label.innerText = "HUMAIN DÉTECTÉ";
        label.style.color = "#ff3f34";
        alert.style.visibility = "visible";
        alert.innerText = "ERREUR DE TRAJECTOIRE";
    } else {
        label.innerText = "ROBOTIQUE";
        label.style.color = "#0be881";
        alert.style.visibility = "hidden";
    }
}

// --- FONCTIONS DE DESSIN GRAPHIQUES ---
function drawSingleCurve(ctx, label, color, isRobot, data) {
    let w = ctx.canvas.width;
    let h = ctx.canvas.height;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (isRobot) {
        ctx.moveTo(w * 0.1, h * 0.8);
        ctx.lineTo(w * 0.15, h * 0.3);
        ctx.lineTo(w * 0.85, h * 0.3);
        ctx.lineTo(w * 0.9, h * 0.8);
    } else if (data && data.length > 1) {
        let startTime = data[0].t;
        let totalTime = data[data.length - 1].t - startTime;

        for (let i = 0; i < data.length; i++) {
            let p = data[i];
            let nx = (p.t - startTime) / totalTime;
            let x = w * 0.1 + (nx * w * 0.8);

            let y = h * 0.8 - (p.v * 100);
            if (y < h * 0.1) y = h * 0.1;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function drawOverlayChart(ctx) {
    let w = ctx.canvas.width;
    let h = ctx.canvas.height;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Robot (pointillés)
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.8);
    ctx.lineTo(w * 0.15, h * 0.25);
    ctx.lineTo(w * 0.85, h * 0.25);
    ctx.lineTo(w * 0.9, h * 0.8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Phase 1
    let subset1 = phase1Data.slice(0, 150);
    if (subset1.length > 0) {
        drawNormalizedPath(ctx, subset1, '#ff3f34');
    }

    // Phase 2
    if (phase2Data.length > 0) {
        drawNormalizedPath(ctx, phase2Data, '#0be881');
    }
}

function drawNormalizedPath(ctx, data, color) {
    let w = ctx.canvas.width;
    let h = ctx.canvas.height;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    let startT = data[0].t;
    let totT = data[data.length - 1].t - startT;

    for (let i = 0; i < data.length; i++) {
        let p = data[i];
        let nx = (p.t - startT) / totT;
        let x = w * 0.1 + (nx * w * 0.8);
        let y = h * 0.8 - (p.v * 120);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}
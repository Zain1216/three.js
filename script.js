/**
 * Doodle3D - Main Application Script
 * Powered by Three.js and Web Audio API
 */

// --- GLOBAL STATE ---
const state = {
    color: '#ff5e7e',
    brush: 'solid',
    size: 15,
    stamp: null,
    environment: 'meadow',
    soundEnabled: true,
    history: [],
    redoHistory: [],
    toys: [],
    toyCounter: 0
};

// --- DOM ELEMENTS ---
let canvas, ctx;
let btnUndo, btnClear, btnTransform, btnDance, btnClearToys, btnSoundToggle;
let brushSizeSlider, brushSizeVal, brushBtns, colorSwatches, stampBtns, envBtns;
let customColorPicker, container3D, loadingOverlay, welcomeModal, btnStart;
let galleryList;

// --- AUDIO SYNTHESIZER ENGINE ---
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn("Web Audio API not supported", e);
    }
}

function playSound(type) {
    if (!audioCtx || !state.soundEnabled) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (type === 'scribble') {
        // Short, quiet triangle wave scratch
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150 + Math.random() * 200, now);
        osc.frequency.exponentialRampToValueAtTime(600 + Math.random() * 300, now + 0.04);
        
        gain.gain.setValueAtTime(0.008, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(now + 0.05);
    } 
    else if (type === 'pop') {
        // Cute upward bubble pop
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(now + 0.15);
    } 
    else if (type === 'magic') {
        // Starry chime arpeggio + whoosh
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C major chord arpeggio
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            
            gain.gain.setValueAtTime(0.04, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.3);
        });

        // Soft white noise swept sweep
        const bufferSize = audioCtx.sampleRate * 0.6;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(2500, now + 0.5);
        
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.03, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(now);
        noise.stop(now + 0.6);
    } 
    else if (type === 'boing') {
        // Cute springy boing
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.28);
        
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(now + 0.3);
    }
    else if (type === 'clear') {
        // Downward scale
        const notes = [523.25, 392.00, 329.63, 261.63];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.06, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.2);
        });
    }
}

// Throttling scribbles so we don't saturate audio channel
let lastScribbleTime = 0;
function throttleScribble() {
    const now = Date.now();
    if (now - lastScribbleTime > 120) {
        playSound('scribble');
        lastScribbleTime = now;
    }
}

// --- 2D CANVAS DRAWING CONTROLLER ---
function initDrawingCanvas() {
    canvas = document.getElementById('paint-canvas');
    ctx = canvas.getContext('2d');

    // Make canvas scale cleanly based on layout
    resizeCanvasElement();

    let isDrawing = false;
    let strokePoints = [];

    // Helper to get mouse coordinates relative to canvas
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        // Handle touch events
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Scale to match canvas internal resolution
        return {
            x: ((clientX - rect.left) / rect.width) * canvas.width,
            y: ((clientY - rect.top) / rect.height) * canvas.height
        };
    }

    // Input events
    function startDraw(e) {
        // If stamp is selected, draw stamp on click
        if (state.stamp) {
            const pos = getMousePos(e);
            addStampToHistory(pos.x, pos.y, state.stamp);
            return;
        }

        isDrawing = true;
        const pos = getMousePos(e);
        strokePoints = [pos];
        
        // Pre-setup brush contexts
        setupCtxStyle(state.brush, state.color, state.size);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        
        throttleScribble();
    }

    function doDraw(e) {
        if (!isDrawing) return;
        e.preventDefault(); // Stop mobile scrolling
        const pos = getMousePos(e);
        strokePoints.push(pos);

        // Drawing path interpolation
        redrawHistory();
        drawActiveStroke(strokePoints, state.brush, state.color, state.size);
        
        throttleScribble();
    }

    function endDraw() {
        if (!isDrawing) return;
        isDrawing = false;

        // Save stroke to history
        if (strokePoints.length > 0) {
            state.history.push({
                type: 'stroke',
                points: strokePoints,
                brush: state.brush,
                color: state.color,
                size: state.size
            });
            state.redoHistory = []; // clear redo
        }
        strokePoints = [];
        redrawHistory();
    }

    // Mouse bindings
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', doDraw);
    window.addEventListener('mouseup', endDraw);

    // Touch bindings (mobile friendly)
    canvas.addEventListener('touchstart', (e) => {
        const pos = getMousePos(e);
        startDraw(e);
    });
    canvas.addEventListener('touchmove', doDraw);
    canvas.addEventListener('touchend', endDraw);
}

function resizeCanvasElement() {
    // Keep internal canvas resolution at 500x500
    canvas.width = 500;
    canvas.height = 500;
    redrawHistory();
}

function setupCtxStyle(brush, color, size) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 0; // reset
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';

    if (brush === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = size * 1.5;
    } else if (brush === 'neon') {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.shadowColor = color;
        ctx.shadowBlur = size * 0.8;
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
    }
}

// Renders the path using smooth Bezier midpoints
function drawActiveStroke(points, brush, color, size) {
    if (points.length < 2) return;

    ctx.save();
    setupCtxStyle(brush, color, size);

    if (brush === 'rainbow') {
        // Draw rainbow segments with changing hue
        for (let i = 1; i < points.length; i++) {
            ctx.beginPath();
            ctx.moveTo(points[i - 1].x, points[i - 1].y);
            ctx.lineTo(points[i].x, points[i].y);
            const hue = (i * 6) % 360;
            ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`;
            ctx.stroke();
        }
    } else if (brush === 'glitter') {
        // Base line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.3;
        ctx.globalAlpha = 0.6;
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            const xc = (points[i].x + points[i - 1].x) / 2;
            const yc = (points[i].y + points[i - 1].y) / 2;
            ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
        ctx.stroke();

        // Stars along path
        ctx.globalAlpha = 1.0;
        for (let i = 0; i < points.length; i += 5) {
            drawMiniStar(points[i].x, points[i].y, size * 0.6, color);
        }
    } else {
        // Solid or Neon smooth curve
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            const xc = (points[i].x + points[i - 1].x) / 2;
            const yc = (points[i].y + points[i - 1].y) / 2;
            ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawMiniStar(cx, cy, radius, color) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = radius * 0.6;
    ctx.beginPath();
    const spikes = 4;
    const outerRadius = radius;
    const innerRadius = radius * 0.35;
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;

    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        let x = cx + Math.cos(rot) * outerRadius;
        let y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function addStampToHistory(cx, cy, stampType) {
    state.history.push({
        type: 'stamp',
        x: cx,
        y: cy,
        stamp: stampType,
        size: state.size * 3.5 // Stamps should be proportional but larger
    });
    state.redoHistory = [];
    playSound('pop');
    redrawHistory();
}

function drawStamp(cx, cy, stampType, size) {
    ctx.save();
    ctx.font = `bold ${size}px 'Fredoka', 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let emoji = '⭐';
    if (stampType === 'heart') emoji = '❤️';
    else if (stampType === 'star') emoji = '⭐';
    else if (stampType === 'smile') emoji = '😊';
    else if (stampType === 'crown') emoji = '👑';
    else if (stampType === 'cat') emoji = '🐱';
    else if (stampType === 'flower') emoji = '🌸';
    
    // Slight shadow to give it separation
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillText(emoji, cx, cy);
    ctx.restore();
}

function redrawHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.history.forEach(item => {
        if (item.type === 'stroke') {
            drawActiveStroke(item.points, item.brush, item.color, item.size);
        } else if (item.type === 'stamp') {
            drawStamp(item.x, item.y, item.stamp, item.size);
        }
    });
}

function undoDrawing() {
    if (state.history.length === 0) return;
    const item = state.history.pop();
    state.redoHistory.push(item);
    playSound('clear');
    redrawHistory();
}

function clearDrawing() {
    if (state.history.length === 0) return;
    state.history = [];
    state.redoHistory = [];
    playSound('clear');
    redrawHistory();
}


// --- THREE.JS 3D PLAYGROUND WORLD ---
let scene, camera, renderer, controls;
let decosGroup; // holds environment decor meshes
let mouseNDC = new THREE.Vector2(-999, -999); // Track normalized cursor coordinates for eyes

const environmentConfigs = {
    meadow: {
        skyColor: 0xa5d8ff,
        groundColor: 0x6ab04c,
        init: (decos) => {
            // Add clouds
            for (let i = 0; i < 4; i++) {
                const cloud = createCloudModel();
                cloud.position.set((Math.random() - 0.5) * 15, 3.5 + Math.random() * 1.5, (Math.random() - 0.5) * 12);
                decos.add(cloud);
            }
            // Add simple colorful cylinder-sphere flowers
            const flowerColors = [0xff5e7e, 0xfeca57, 0xff7675, 0x00d2d3, 0xff9ff3];
            for (let i = 0; i < 20; i++) {
                const flower = new THREE.Group();
                const stemGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
                const stemMat = new THREE.MeshStandardMaterial({color: 0x26de81});
                const stem = new THREE.Mesh(stemGeom, stemMat);
                stem.position.y = 0.2;
                flower.add(stem);

                const petalGeom = new THREE.SphereGeometry(0.08, 6, 6);
                const petalMat = new THREE.MeshStandardMaterial({
                    color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
                    roughness: 0.3
                });
                const petals = new THREE.Mesh(petalGeom, petalMat);
                petals.position.y = 0.4;
                flower.add(petals);

                flower.position.set((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
                flower.scale.setScalar(0.7 + Math.random() * 0.6);
                decos.add(flower);
            }
        },
        update: (decos, time) => {
            // Drift clouds slowly
            decos.children.forEach(child => {
                if (child.userData.isCloud) {
                    child.position.x += 0.004;
                    if (child.position.x > 10) child.position.x = -10;
                    // Gentle wave float
                    child.position.y += Math.sin(time * 0.8 + child.position.x) * 0.002;
                }
            });
        }
    },
    space: {
        skyColor: 0x0f0b29,
        groundColor: 0x57606f,
        init: (decos) => {
            // Create a starfield
            const starCount = 120;
            const geom = new THREE.BufferGeometry();
            const positions = new Float32Array(starCount * 3);
            for (let i = 0; i < starCount * 3; i += 3) {
                positions[i] = (Math.random() - 0.5) * 25;
                positions[i+1] = 1 + Math.random() * 8;
                positions[i+2] = (Math.random() - 0.5) * 25;
            }
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({color: 0xffffff, size: 0.08, transparent: true});
            const stars = new THREE.Points(geom, mat);
            decos.add(stars);

            // Add craters to moon ground
            for (let i = 0; i < 8; i++) {
                const crater = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.8 + Math.random()*0.8, 0.9 + Math.random()*0.8, 0.06, 12),
                    new THREE.MeshStandardMaterial({color: 0x2f3542, roughness: 0.9})
                );
                crater.position.set((Math.random() - 0.5) * 14, 0.01, (Math.random() - 0.5) * 14);
                decos.add(crater);
            }

            // Floating planet
            const planetGeom = new THREE.SphereGeometry(0.8, 16, 16);
            const planetMat = new THREE.MeshStandardMaterial({color: 0xffa502, roughness: 0.5, metalness: 0.2});
            const planet = new THREE.Mesh(planetGeom, planetMat);
            planet.position.set(5, 4, -4);
            planet.userData.isPlanet = true;
            decos.add(planet);

            // Add ring to planet
            const ringGeom = new THREE.RingGeometry(1.0, 1.4, 24);
            const ringMat = new THREE.MeshBasicMaterial({color: 0xff7f50, side: THREE.DoubleSide, transparent: true, opacity: 0.8});
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.rotation.x = Math.PI / 3;
            planet.add(ring);
        },
        update: (decos, time) => {
            // Spin floating planet
            decos.children.forEach(child => {
                if (child.userData.isPlanet) {
                    child.rotation.y += 0.005;
                    child.position.y += Math.sin(time * 0.5) * 0.003;
                }
            });
        }
    },
    ocean: {
        skyColor: 0x0652dd,
        groundColor: 0xf39c12, // sand
        init: (decos) => {
            // Enable sea fog
            scene.fog = new THREE.FogExp2(0x0652dd, 0.06);

            // Stacks of seaweed
            for (let k = 0; k < 12; k++) {
                const seaweed = new THREE.Group();
                const count = 4 + Math.floor(Math.random() * 4);
                let currentY = 0.2;
                for (let i = 0; i < count; i++) {
                    const segment = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.08 - i*0.01, 0.08 - (i-1)*0.01, 0.4),
                        new THREE.MeshStandardMaterial({color: 0x10ac84, roughness: 0.8})
                    );
                    segment.position.y = currentY;
                    segment.name = `seg-${i}`;
                    seaweed.add(segment);
                    currentY += 0.38;
                }
                seaweed.position.set((Math.random() - 0.5) * 15, 0, (Math.random() - 0.5) * 15);
                seaweed.userData.isSeaweed = true;
                decos.add(seaweed);
            }

            // Water bubble particles
            const bubbleCount = 40;
            const geom = new THREE.BufferGeometry();
            const positions = new Float32Array(bubbleCount * 3);
            for (let i = 0; i < bubbleCount * 3; i += 3) {
                positions[i] = (Math.random() - 0.5) * 15;
                positions[i+1] = Math.random() * 6;
                positions[i+2] = (Math.random() - 0.5) * 15;
            }
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({color: 0x70a1ff, size: 0.12, transparent: true, opacity: 0.6});
            const bubbles = new THREE.Points(geom, mat);
            bubbles.userData.isBubbles = true;
            decos.add(bubbles);
        },
        update: (decos, time) => {
            decos.children.forEach(child => {
                // Sway seaweed segments
                if (child.userData.isSeaweed) {
                    child.children.forEach((seg, idx) => {
                        seg.rotation.z = Math.sin(time + child.position.x + idx) * 0.08;
                        seg.rotation.x = Math.cos(time + child.position.z + idx) * 0.08;
                    });
                }
                // Float bubbles upward
                if (child.userData.isBubbles) {
                    const posAttr = child.geometry.attributes.position;
                    for (let i = 0; i < posAttr.count; i++) {
                        let y = posAttr.getY(i);
                        y += 0.015;
                        if (y > 6.0) {
                            y = 0;
                            posAttr.setX(i, (Math.random() - 0.5) * 15);
                            posAttr.setZ(i, (Math.random() - 0.5) * 15);
                        }
                        posAttr.setY(i, y);
                    }
                    posAttr.needsUpdate = true;
                }
            });
        }
    },
    candy: {
        skyColor: 0xffe8f6,
        groundColor: 0xff9ff3, // strawberry ground
        init: (decos) => {
            // Sprinkles on ground
            const sprinkleColors = [0x54a0ff, 0xfeca57, 0x1dd1a1, 0xff6b6b, 0xffffff, 0x5f27cd];
            for (let i = 0; i < 40; i++) {
                const sprinkle = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.04, 0.35),
                    new THREE.MeshStandardMaterial({
                        color: sprinkleColors[Math.floor(Math.random() * sprinkleColors.length)],
                        roughness: 0.4
                    })
                );
                sprinkle.position.set((Math.random() - 0.5) * 16, 0.02, (Math.random() - 0.5) * 16);
                sprinkle.rotation.y = Math.random() * Math.PI;
                decos.add(sprinkle);
            }

            // Giant wiggling lollipops
            for (let i = 0; i < 4; i++) {
                const lollipop = new THREE.Group();
                const stick = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.06, 1.8),
                    new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9})
                );
                stick.position.y = 0.9;
                lollipop.add(stick);

                const candy = new THREE.Mesh(
                    new THREE.TorusGeometry(0.4, 0.16, 10, 24),
                    new THREE.MeshStandardMaterial({
                        color: i % 2 === 0 ? 0xff5e7e : 0xff9f43,
                        roughness: 0.2
                    })
                );
                candy.position.y = 1.7;
                lollipop.add(candy);

                lollipop.position.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12);
                lollipop.userData.isLollipop = true;
                lollipop.userData.wiggleOffset = Math.random() * 5;
                decos.add(lollipop);
            }
        },
        update: (decos, time) => {
            // Sway lollipops
            decos.children.forEach(child => {
                if (child.userData.isLollipop) {
                    const offset = child.userData.wiggleOffset;
                    child.rotation.z = Math.sin(time * 1.5 + offset) * 0.06;
                }
            });
        }
    }
};

function createCloudModel() {
    const cloudGroup = new THREE.Group();
    cloudGroup.userData.isCloud = true;
    
    const geom = new THREE.SphereGeometry(0.5, 12, 12);
    const mat = new THREE.MeshLambertMaterial({color: 0xffffff, transparent: true, opacity: 0.9});
    
    const s1 = new THREE.Mesh(geom, mat);
    s1.scale.set(1, 0.8, 0.9);
    
    const s2 = new THREE.Mesh(geom, mat);
    s2.position.set(0.4, -0.05, 0.1);
    s2.scale.set(0.8, 0.7, 0.8);

    const s3 = new THREE.Mesh(geom, mat);
    s3.position.set(-0.4, -0.05, -0.1);
    s3.scale.set(0.8, 0.6, 0.7);

    cloudGroup.add(s1, s2, s3);
    return cloudGroup;
}

function initThreeJS() {
    container3D = document.getElementById('threejs-canvas-container');
    const w = container3D.clientWidth;
    const h = container3D.clientHeight;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa5d8ff);

    // Camera setup
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 5, 12);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container3D.appendChild(renderer.domElement);

    // Controls setup
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below ground level

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(8, 12, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Ground plane setup
    const groundGeom = new THREE.BoxGeometry(20, 1, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.y = -0.5; // top surface exactly at y=0
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);

    // Group for environmental deco
    decosGroup = new THREE.Group();
    scene.add(decosGroup);

    // Initialize default environment (Meadow)
    switchEnvironment('meadow');

    // Raycaster for toy clicks
    const raycaster = new THREE.Raycaster();
    const mouse2D = new THREE.Vector2();

    container3D.addEventListener('mousedown', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse2D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse2D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse2D, camera);
        const intersects = raycaster.intersectObjects(state.toys.map(t => t.mesh), true);
        
        if (intersects.length > 0) {
            // Find parent toy mesh group with user data
            let obj = intersects[0].object;
            while (obj && obj.parent && obj.userData.toyIndex === undefined) {
                obj = obj.parent;
            }
            if (obj && obj.userData && obj.userData.toyIndex !== undefined) {
                const toyIndex = obj.userData.toyIndex;
                const toy = state.toys.find(t => t.index === toyIndex);
                if (toy) {
                    triggerToyAction(toy);
                }
            }
        }
    });

    // Track mouse coordinates over Three.js viewport for googly eyes target
    container3D.addEventListener('mousemove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const w = container3D.clientWidth;
    const h = container3D.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function switchEnvironment(envName) {
    state.environment = envName;
    const config = environmentConfigs[envName];
    if (!config) return;

    // Reset fog
    scene.fog = null;

    // Set sky and ground colors
    scene.background.setHex(config.skyColor);
    
    const ground = scene.getObjectByName('ground');
    if (ground) {
        ground.material.color.setHex(config.groundColor);
    }

    // Clear old decorations
    while(decosGroup.children.length > 0) {
        decosGroup.remove(decosGroup.children[0]);
    }

    // Init new decorations
    config.init(decosGroup);
}


// --- CONTOUR TRACING & 3D EXTRUSION ENGINE ---

function makeDrawing3D() {
    // 1. Check if the user has drawn anything
    if (state.history.length === 0) {
        alert("Draw something on the canvas first! 🎨");
        return;
    }

    // 2. Play spell chime
    playSound('magic');

    // 3. Show magic spinner
    loadingOverlay.classList.remove('hidden');

    // Wait slightly to let the UI update and run the script asynchronously
    setTimeout(() => {
        try {
            // Get pixels of current canvas drawing
            const width = canvas.width;
            const height = canvas.height;
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // Downsample the 500x500 canvas to a 125x125 binary grid
            const gridWidth = 125;
            const gridHeight = 125;
            const grid = new Uint8Array(gridWidth * gridHeight);
            
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    let alphaSum = 0;
                    // Check 4x4 block
                    for (let py = 0; py < 4; py++) {
                        for (let px = 0; px < 4; px++) {
                            const pX = x * 4 + px;
                            const pY = y * 4 + py;
                            const idx = (pY * width + pX) * 4;
                            alphaSum += data[idx + 3];
                        }
                    }
                    // If average alpha of block is significant
                    grid[y * gridWidth + x] = (alphaSum / 16 > 30) ? 1 : 0;
                }
            }

            // Find all connected components
            const visited = new Uint8Array(gridWidth * gridHeight);
            const components = [];

            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const idx = y * gridWidth + x;
                    if (grid[idx] === 1 && !visited[idx]) {
                        // Found a component!
                        // Trace its outer contour loop
                        const contour = traceContour(x, y, grid, gridWidth, gridHeight);
                        // Flood-fill all pixels of this component to mark them visited
                        const componentPixels = floodFillComponent(x, y, grid, gridWidth, gridHeight, visited);

                        // Only proceed if it is a substantial shape, not noise
                        if (contour && contour.length > 6 && componentPixels.length > 25) {
                            components.push({
                                contour: contour,
                                pixels: componentPixels
                            });
                        }
                    }
                }
            }

            if (components.length === 0) {
                alert("Your drawing is too small! Make some bigger lines or stamps. 💖");
                loadingOverlay.classList.add('hidden');
                return;
            }

            // Create a 3D Toy for each component found
            components.forEach((component, index) => {
                create3DToyFromComponent(component, data, width, height);
            });

            // Play final pop sound
            playSound('pop');

            // Clear the 2D canvas drawing after converting
            state.history = [];
            state.redoHistory = [];
            redrawHistory();

        } catch (err) {
            console.error("Error creating 3D toy:", err);
            alert("Oops! The 3D magic wand had a tiny hiccup. Try drawing again!");
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }, 100);
}

// Moore-Neighbor Tracing (8-connected clockwise search)
function traceContour(startX, startY, grid, width, height) {
    const contour = [];
    
    // Clockwise directions starting from Up (index 0)
    const dirs = [
        {x: 0, y: -1}, // 0: Up
        {x: 1, y: -1}, // 1: Up-Right
        {x: 1, y: 0},  // 2: Right
        {x: 1, y: 1},  // 3: Down-Right
        {x: 0, y: 1},  // 4: Down
        {x: -1, y: 1}, // 5: Down-Left
        {x: -1, y: 0}, // 6: Left
        {x: -1, y: -1} // 7: Up-Left
    ];

    let cx = startX;
    let cy = startY;
    let prevDir = 6; // We came from Left (index 6) since we scan Left-to-Right
    
    let limit = 1500; // anti-hang safety
    while (limit-- > 0) {
        contour.push({x: cx, y: cy});

        let foundNext = false;
        // Search clockwise starting from the next direction clockwise from prevDir
        for (let i = 0; i < 8; i++) {
            const checkDir = (prevDir + 1 + i) % 8;
            const nx = cx + dirs[checkDir].x;
            const ny = cy + dirs[checkDir].y;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (grid[ny * width + nx] === 1) {
                    cx = nx;
                    cy = ny;
                    prevDir = (checkDir + 4) % 8; // Invert direction for next step's backtrack
                    foundNext = true;
                    break;
                }
            }
        }

        if (!foundNext) break;

        // If returned to start, terminate loop
        if (cx === startX && cy === startY) {
            break;
        }
    }
    return contour;
}

// BFS Floodfill to tag all pixels in a component
function floodFillComponent(startX, startY, grid, width, height, visited) {
    const pixels = [];
    const queue = [{x: startX, y: startY}];
    visited[startY * width + startX] = true;

    while(queue.length > 0) {
        const curr = queue.shift();
        pixels.push(curr);

        const neighbors = [
            {x: curr.x + 1, y: curr.y},
            {x: curr.x - 1, y: curr.y},
            {x: curr.x, y: curr.y + 1},
            {x: curr.x, y: curr.y - 1}
        ];

        for (const n of neighbors) {
            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
                const idx = n.y * width + n.x;
                if (grid[idx] === 1 && !visited[idx]) {
                    visited[idx] = true;
                    queue.push(n);
                }
            }
        }
    }
    return pixels;
}

// Smooth contour coordinates
function smoothContourPoints(contour, passes = 2) {
    let points = [...contour];
    for (let p = 0; p < passes; p++) {
        const smoothed = [];
        for (let i = 0; i < points.length; i++) {
            const prev = points[(i - 1 + points.length) % points.length];
            const curr = points[i];
            const next = points[(i + 1) % points.length];
            
            smoothed.push({
                x: curr.x * 0.45 + prev.x * 0.275 + next.x * 0.275,
                y: curr.y * 0.45 + prev.y * 0.275 + next.y * 0.275
            });
        }
        points = smoothed;
    }
    return points;
}

function create3DToyFromComponent(component, fullCanvasData, canvasW, canvasH) {
    const scale = 0.08; // scale grid cells to Three.js units (125 * 0.08 = 10 units wide max)
    
    // 1. Calculate bounding box of component in 125x125 grid
    let minX = 125, maxX = 0, minY = 125, maxY = 0;
    component.pixels.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    const bboxW = maxX - minX + 1;
    const bboxH = maxY - minY + 1;
    const cX = minX + bboxW / 2;
    const cY = minY + bboxH / 2;

    // 2. Smooth and simplify contour
    let smoothedPoints = smoothContourPoints(component.contour, 3);
    // Downsample (take every 2nd point) to keep vertex count small
    const simplifiedPoints = [];
    for (let i = 0; i < smoothedPoints.length; i += 2) {
        simplifiedPoints.push(smoothedPoints[i]);
    }

    if (simplifiedPoints.length < 3) return;

    // 3. Create THREE.Shape
    const shape = new THREE.Shape();
    // Center geometry around (0,0) locally so rotations work correctly
    // Invert Y coordinate since canvas Y is down and 3D Y is up
    const startPt = simplifiedPoints[0];
    shape.moveTo((startPt.x - cX) * scale, (cY - startPt.y) * scale);
    for (let i = 1; i < simplifiedPoints.length; i++) {
        const pt = simplifiedPoints[i];
        shape.lineTo((pt.x - cX) * scale, (cY - pt.y) * scale);
    }
    shape.closePath();

    // 4. Extrude shape
    const depth = 0.6;
    const bevelThickness = 0.15;
    const extrudeSettings = {
        depth: depth,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.1,
        bevelThickness: bevelThickness
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // We center the geometry's local coordinate center
    geometry.center();

    // 5. Generate Texture for front/back faces matching bounding box of component
    // Bbox in pixels:
    const pMinX = Math.max(0, minX * 4 - 4);
    const pMaxX = Math.min(canvasW, (maxX + 1) * 4 + 4);
    const pMinY = Math.max(0, minY * 4 - 4);
    const pMaxY = Math.min(canvasH, (maxY + 1) * 4 + 4);
    const pW = pMaxX - pMinX;
    const pH = pMaxY - pMinY;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = pW;
    cropCanvas.height = pH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, pMinX, pMinY, pW, pH, 0, 0, pW, pH);

    const texture = new THREE.CanvasTexture(cropCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // 6. Find side clay color (average color of drawn pixels)
    let rSum = 0, gSum = 0, bSum = 0, colCount = 0;
    component.pixels.forEach(p => {
        // Map 125x125 coordinate to 500x500 canvas coordinates
        const px = p.x * 4;
        const py = p.y * 4;
        const idx = (py * canvasW + px) * 4;
        const a = fullCanvasData[idx + 3];
        if (a > 30) {
            rSum += fullCanvasData[idx];
            gSum += fullCanvasData[idx + 1];
            bSum += fullCanvasData[idx + 2];
            colCount++;
        }
    });

    const rAvg = colCount > 0 ? Math.round(rSum / colCount) : 255;
    const gAvg = colCount > 0 ? Math.round(gSum / colCount) : 94;
    const bAvg = colCount > 0 ? Math.round(bSum / colCount) : 126;
    const sideColorHex = (rAvg << 16) + (gAvg << 8) + bAvg;

    // Create front/back material and solid clay side material
    const frontMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        alphaTest: 0.05
    });

    const sideMat = new THREE.MeshStandardMaterial({
        color: sideColorHex,
        roughness: 0.5,
        metalness: 0.05
    });

    // 7. Assemble Mesh
    const toyMesh = new THREE.Mesh(geometry, [frontMat, sideMat]);
    toyMesh.castShadow = true;
    toyMesh.receiveShadow = true;

    // Create Toy Group to hold mesh + googly eyes
    const toyGroup = new THREE.Group();
    toyGroup.add(toyMesh);

    // Compute dimensions in 3D
    const localBbox = new THREE.Box3().setFromObject(toyMesh);
    const sizeVec = new THREE.Vector3();
    localBbox.getSize(sizeVec);
    const toyW = sizeVec.x;
    const toyH = sizeVec.y;

    // 8. Place Googly Eyes
    // Sclera size relative to toy size
    const eyeRadius = Math.min(Math.max(Math.min(toyW, toyH) * 0.12, 0.12), 0.4);
    
    // Add two eyes, or one large eye if the toy is very narrow
    const eyeZ = depth / 2 + bevelThickness + 0.02; // sit on the front face
    const eyeY = toyH * 0.22; // position slightly above center Y (since geometry is centered, origin is in center)
    
    const eyeGroupList = [];

    if (toyW < eyeRadius * 2.8) {
        // Cyclops (single eye)
        const eye = createGooglyEye(eyeRadius);
        eye.position.set(0, eyeY, eyeZ);
        toyGroup.add(eye);
        eyeGroupList.push(eye);
    } else {
        // Two eyes
        const eyeSpacing = toyW * 0.22;
        const leftEye = createGooglyEye(eyeRadius);
        leftEye.position.set(-eyeSpacing, eyeY, eyeZ);
        toyGroup.add(leftEye);
        eyeGroupList.push(leftEye);

        const rightEye = createGooglyEye(eyeRadius);
        rightEye.position.set(eyeSpacing, eyeY, eyeZ);
        toyGroup.add(rightEye);
        eyeGroupList.push(rightEye);
    }

    // 9. Initial Position in Scene
    // Map center X and Y from grid to Three.js coordinates
    // grid width is 125, so we offset by 62.5
    const spawnX = (cX - 62.5) * scale;
    const spawnZ = (cY - 62.5) * scale * 0.6; // compress depth slightly so they stay near camera
    const spawnY = 4.0; // spawn in mid-air and fall down!

    toyGroup.position.set(spawnX, spawnY, spawnZ);

    // Assign indexes
    state.toyCounter++;
    toyGroup.userData.toyIndex = state.toyCounter;

    // Add to Three.js Scene
    scene.add(toyGroup);

    // 10. Store in Toy State
    state.toys.push({
        index: state.toyCounter,
        mesh: toyGroup,
        eyes: eyeGroupList,
        vx: 0,
        vy: 0, // falling velocity
        vz: 0,
        isJumping: true, // starts by falling
        bounceTimer: 0,
        animationState: 'idle',
        animationTimer: Math.random() * 10, // random offset
        thumbnailUrl: cropCanvas.toDataURL()
    });

    // 11. Add to Thumbnail Gallery UI
    addToyToGalleryUI(state.toyCounter, cropCanvas.toDataURL());
}

function createGooglyEye(radius) {
    const eyeGroup = new THREE.Group();

    // White backing sclera
    const scleraGeom = new THREE.SphereGeometry(radius, 16, 16);
    const scleraMat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.2});
    const sclera = new THREE.Mesh(scleraGeom, scleraMat);
    sclera.scale.set(1, 1, 0.45); // flatten back
    eyeGroup.add(sclera);

    // Black pupil
    const pupilGeom = new THREE.SphereGeometry(radius * 0.48, 12, 12);
    const pupilMat = new THREE.MeshBasicMaterial({color: 0x111111});
    const pupil = new THREE.Mesh(pupilGeom, pupilMat);
    pupil.scale.set(1, 1, 0.15);
    pupil.position.set(0, 0, radius * 0.42);
    eyeGroup.add(pupil);

    eyeGroup.userData = {
        pupil: pupil,
        radius: radius,
        pupilRadius: radius * 0.48,
        // Physics for jiggle
        pupilX: 0, pupilY: 0,
        targetX: 0, targetY: 0,
        vx: 0, vy: 0
    };

    return eyeGroup;
}

function triggerToyAction(toy) {
    if (toy.isJumping) return;
    
    // Choose a random trick or toggle animation state!
    const actions = ['jump', 'dance', 'roll', 'idle'];
    // Filter out current state to make sure it changes
    const available = actions.filter(a => a !== toy.animationState);
    const choice = available[Math.floor(Math.random() * available.length)];
    
    if (choice === 'jump') {
        toy.isJumping = true;
        toy.vy = 0.25 + Math.random() * 0.1;
        toy.vx = (Math.random() - 0.5) * 0.08;
        toy.vz = (Math.random() - 0.5) * 0.08;
        playSound('boing');
    } else {
        toy.animationState = choice;
        playSound('pop');
    }
}

// Make all toys jump and dance
function triggerAllToysDance() {
    if (state.toys.length === 0) return;
    playSound('magic');
    state.toys.forEach(toy => {
        toy.animationState = 'dance';
        if (!toy.isJumping) {
            toy.isJumping = true;
            toy.vy = 0.2 + Math.random() * 0.15;
            toy.vx = (Math.random() - 0.5) * 0.05;
        }
    });
}

function removeAllToys() {
    if (state.toys.length === 0) return;
    playSound('clear');
    state.toys.forEach(toy => {
        scene.remove(toy.mesh);
    });
    state.toys = [];
    state.toyCounter = 0;
    
    // Clear Gallery list
    galleryList.innerHTML = '<p class="empty-gallery-msg">Draw and click the wand to build your collection! 🎁</p>';
}

// --- GALLERY THUMBNAIL UI ---
function addToyToGalleryUI(index, imgUrl) {
    const emptyMsg = galleryList.querySelector('.empty-gallery-msg');
    if (emptyMsg) emptyMsg.remove();

    const card = document.createElement('div');
    card.className = 'toy-card';
    card.title = `Toy #${index} - Click to focus!`;
    card.innerHTML = `
        <img src="${imgUrl}" alt="Toy Thumbnail">
        <span>Toy #${index}</span>
    `;

    card.addEventListener('click', () => {
        const toy = state.toys.find(t => t.index === index);
        if (toy) {
            // Animate camera to look at the toy
            const pos = toy.mesh.position;
            // Shift controls target
            controls.target.copy(pos);
            playSound('pop');
            // Trigger a quick wiggle
            triggerToyAction(toy);
        }
    });

    galleryList.appendChild(card);
}

// --- MAIN ANIMATION LOOP ---
const gravity = -0.01;
const tempWorldPos = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    // 1. Update active environment animations (seaweed, clouds, lollipops)
    const envConfig = environmentConfigs[state.environment];
    if (envConfig && envConfig.update) {
        envConfig.update(decosGroup, time);
    }

    // 2. Update toys physics and behaviors
    state.toys.forEach(toy => {
        const mesh = toy.mesh;
        toy.animationTimer += 0.05;
        const t = toy.animationTimer;

        // Bouncing/Physics state
        if (toy.isJumping) {
            toy.vy += gravity;
            mesh.position.y += toy.vy;
            mesh.position.x += toy.vx;
            mesh.position.z += toy.vz;

            // Flip/Spin in mid-air
            mesh.rotation.y += 0.08;
            mesh.rotation.z += 0.04;

            // Ground crash detection (ground surface is at y = 0)
            if (mesh.position.y <= 0) {
                mesh.position.y = 0;
                toy.vy = 0;
                toy.vx = 0;
                toy.vz = 0;
                toy.isJumping = false;
                toy.bounceTimer = 0.5; // Trigger bounce squash and stretch
                mesh.rotation.set(0, 0, 0); // reset rotation
                playSound('boing');
            }
        } else {
            // Idle and standard wiggles
            switch (toy.animationState) {
                case 'idle':
                    // Breathe wiggles
                    mesh.position.y = Math.abs(Math.sin(t * 1.5)) * 0.12;
                    mesh.rotation.z = Math.sin(t * 1.5) * 0.04;
                    mesh.rotation.y = Math.cos(t * 0.8) * 0.04;
                    break;
                case 'dance':
                    // High bouncing and severe wiggle
                    mesh.position.y = Math.abs(Math.sin(t * 5.0)) * 1.2;
                    mesh.rotation.z = Math.sin(t * 6.5) * 0.22;
                    mesh.rotation.y = Math.cos(t * 3.0) * 0.12;
                    break;
                case 'swim':
                    // Underwater floating wave
                    mesh.position.y = 1.2 + Math.sin(t * 1.8) * 0.45;
                    mesh.position.x += Math.sin(t * 0.6) * 0.015;
                    mesh.rotation.x = Math.cos(t * 1.8) * 0.15;
                    mesh.rotation.z = Math.sin(t * 0.9) * 0.08;
                    break;
                case 'roll':
                    // Rolling left and right
                    const range = 3.5;
                    const nextX = Math.sin(t * 1.2) * range;
                    const diffX = nextX - mesh.position.x;
                    mesh.position.x = nextX;
                    mesh.rotation.z -= diffX * 0.7; // roll orientation
                    mesh.position.y = Math.abs(Math.sin(mesh.rotation.z * 2)) * 0.1;
                    break;
            }
        }

        // 3. Squash and stretch bouncing animation
        if (toy.bounceTimer > 0) {
            toy.bounceTimer -= 0.04;
            const bt = Math.max(0, toy.bounceTimer);
            const scaleY = 1.0 - Math.sin(bt * Math.PI) * 0.38; // squash down
            const scaleXZ = 1.0 + Math.sin(bt * Math.PI) * 0.22; // stretch wide
            mesh.scale.set(scaleXZ, scaleY, scaleXZ);
        } else {
            if (toy.animationState === 'idle' && !toy.isJumping) {
                // Gentle organic breathing scale
                const breathe = 1.0 + Math.sin(t * 2.5) * 0.02;
                mesh.scale.set(breathe, 1.0 / breathe, breathe);
            } else {
                mesh.scale.set(1.0, 1.0, 1.0);
            }
        }

        // Keep toys within play boundary limits
        const boundary = 7.0;
        if (mesh.position.x > boundary) { mesh.position.x = boundary; toy.vx *= -1; }
        if (mesh.position.x < -boundary) { mesh.position.x = -boundary; toy.vx *= -1; }
        if (mesh.position.z > boundary) { mesh.position.z = boundary; toy.vz *= -1; }
        if (mesh.position.z < -boundary) { mesh.position.z = -boundary; toy.vz *= -1; }

        // 4. Update googly eyes pupil direction (look at mouse NDC)
        toy.eyes.forEach(eyeGroup => {
            const ud = eyeGroup.userData;
            if (!ud) return;

            // Project 3D eye world coordinates to NDC screen coordinates
            eyeGroup.getWorldPosition(tempWorldPos);
            tempWorldPos.project(camera); // maps values between -1 and 1

            // Vector from eye center to mouse position
            const dx = mouseNDC.x - tempWorldPos.x;
            const dy = mouseNDC.y - tempWorldPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Compute target offset for pupil
            let angle = Math.atan2(dy, dx);
            let lookIntensity = Math.min(1.0, dist * 1.8); // reach full edge quickly

            const maxOffset = ud.radius * 0.42;
            const targetX = Math.cos(angle) * lookIntensity * maxOffset;
            const targetY = Math.sin(angle) * lookIntensity * maxOffset;

            // Spring physics equations for bouncy pupil jiggle
            const spring = 0.16;
            const friction = 0.72;

            const ax = (targetX - ud.pupilX) * spring;
            const ay = (targetY - ud.pupilY) * spring;

            ud.vx = (ud.vx + ax) * friction;
            ud.vy = (ud.vy + ay) * friction;

            ud.pupilX += ud.vx;
            ud.pupilY += ud.vy;

            // Apply position offset (keep z fixed)
            ud.pupil.position.set(ud.pupilX, ud.pupilY, ud.radius * 0.42);
        });
    });

    // 5. Update camera orbit controls
    controls.update();

    // 6. Draw scene
    renderer.render(scene, camera);
}

// Global clock for elapsed time
const clock = new THREE.Clock();


// --- USER INTERFACE BINDINGS ---
function initUI() {
    // Buttons
    btnUndo = document.getElementById('btn-undo');
    btnClear = document.getElementById('btn-clear');
    btnTransform = document.getElementById('btn-transform');
    btnDance = document.getElementById('btn-dance');
    btnClearToys = document.getElementById('btn-clear-toys');
    btnSoundToggle = document.getElementById('btn-sound-toggle');
    btnStart = document.getElementById('btn-start');

    // Controls
    brushSizeSlider = document.getElementById('brush-size');
    brushSizeVal = document.getElementById('brush-size-val');
    customColorPicker = document.getElementById('custom-color-picker');
    loadingOverlay = document.getElementById('magic-loading-overlay');
    welcomeModal = document.getElementById('welcome-modal');
    galleryList = document.getElementById('toy-gallery-list');

    // Selectors groups
    brushBtns = document.querySelectorAll('.brush-btn');
    colorSwatches = document.querySelectorAll('.color-swatch');
    stampBtns = document.querySelectorAll('.stamp-btn');
    envBtns = document.querySelectorAll('.env-btn');

    // Start/Welcome Modal
    btnStart.addEventListener('click', () => {
        welcomeModal.classList.add('hidden');
        initAudio();
        // Trigger a tiny chime when starting
        setTimeout(() => {
            playSound('magic');
        }, 150);
    });

    // Brush click handler
    brushBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            brushBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.brush = btn.dataset.brush;
            
            // If selecting eraser, clear stamp
            if (state.brush === 'eraser') {
                clearActiveStamps();
            } else {
                // Return to previous colors if brush selected
                state.stamp = null;
                stampBtns.forEach(b => b.classList.remove('active'));
            }
            playSound('pop');
        });
    });

    // Color swatches click handler
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.color = swatch.dataset.color;
            customColorPicker.value = state.color;

            // Clear eraser or stamps and return to solid brush
            returnToSolidBrush();
            playSound('pop');
        });
    });

    // Custom Color picker input handler
    customColorPicker.addEventListener('input', (e) => {
        colorSwatches.forEach(s => s.classList.remove('active'));
        state.color = e.target.value;
        returnToSolidBrush();
    });

    function returnToSolidBrush() {
        state.stamp = null;
        stampBtns.forEach(b => b.classList.remove('active'));
        if (state.brush === 'eraser') {
            state.brush = 'solid';
            brushBtns.forEach(b => b.classList.remove('active'));
            document.getElementById('brush-solid').classList.add('active');
        }
    }

    function clearActiveStamps() {
        state.stamp = null;
        stampBtns.forEach(b => b.classList.remove('active'));
    }

    // Stamps handler
    stampBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const isActive = btn.classList.contains('active');
            stampBtns.forEach(b => b.classList.remove('active'));
            
            if (isActive) {
                state.stamp = null;
            } else {
                btn.classList.add('active');
                state.stamp = btn.dataset.stamp;
                // De-activate eraser/brushes to show active stamp mode
                brushBtns.forEach(b => b.classList.remove('active'));
                state.brush = 'solid'; // defaults back end logic
            }
            playSound('pop');
        });
    });

    // Brush Size Slider
    brushSizeSlider.addEventListener('input', (e) => {
        state.size = parseInt(e.target.value);
        brushSizeVal.innerText = state.size;
    });

    // Action buttons
    btnUndo.addEventListener('click', undoDrawing);
    btnClear.addEventListener('click', clearDrawing);
    btnTransform.addEventListener('click', makeDrawing3D);
    btnDance.addEventListener('click', triggerAllToysDance);
    btnClearToys.addEventListener('click', removeAllToys);

    // Sound toggle button
    btnSoundToggle.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        const icon = btnSoundToggle.querySelector('i');
        if (state.soundEnabled) {
            icon.className = 'fa-solid fa-volume-high';
            initAudio();
            playSound('pop');
        } else {
            icon.className = 'fa-solid fa-volume-xmark';
        }
    });

    // Environment Toggles
    envBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            envBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const env = btn.dataset.env;
            switchEnvironment(env);
            playSound('magic');
        });
    });
}

// --- INIT APP ---
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    initDrawingCanvas();
    initThreeJS();
    animate();
});

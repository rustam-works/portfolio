import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw, Undo2, Redo2, Settings, Brush, Eraser, FileCode, Maximize, Pipette, Plus, Download, FileImage } from 'lucide-react';

const PixelArtEditor = () => {
    const canvasRef = useRef(null);

    // --- State ---
    // Pixel Data: Map<"x,y", "hexColor">
    const [pixelMap, setPixelMap] = useState(new Map());
    const [isDrawing, setIsDrawing] = useState(false);

    // History
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Algorithm params
    const [roundness, setRoundness] = useState(0.25);
    const [roundedRatio, setRoundedRatio] = useState(0.5);
    const [brushSize, setBrushSize] = useState(1);
    const [tool, setTool] = useState('brush'); // 'brush', 'eraser', 'eyedropper'
    const [roundedCorners, setRoundedCorners] = useState(new Set());
    const [cornerType, setCornerType] = useState('round'); // 'round' or 'bevel'

    // Colors
    const [currentColor, setCurrentColor] = useState('#000000');
    const [palette, setPalette] = useState(['#000000', '#FF3B30', '#4CD964', '#007AFF', '#FF9500', '#5856D6', '#FF2D55']);

    // Render Settings
    const [blendPower, setBlendPower] = useState(0.25); // Range 0.1 to 1.0

    // Bridges
    const [bridges, setBridges] = useState([]);
    const [bridgeMap, setBridgeMap] = useState(new Map());
    const [hardCongestedCells, setHardCongestedCells] = useState(new Set());
    const [softCongestedCells, setSoftCongestedCells] = useState(new Set());
    const [cornerMode, setCornerMode] = useState('random');
    const [seed, setSeed] = useState(12345);

    // View & Scale
    const [aspectRatio, setAspectRatio] = useState(1); // Width multiplier (1 = square, 2 = 2:1 rectangle)
    const [lastActivePixel, setLastActivePixel] = useState(null); // For Shift+Click lines
    const [strokeOrigin, setStrokeOrigin] = useState(null); // For Shift+Drag orthogonal lock
    const [overlap, setOverlap] = useState(0); // Pixel overlap/gap (-1 to 1)

    // Interaction Metadata
    const [cursorX, setCursorX] = useState(0);
    const [cursorY, setCursorY] = useState(0);
    const [isCursorVisible, setIsCursorVisible] = useState(false);

    // Settings
    const [gridWidth, setGridWidth] = useState(16);
    const [gridHeight, setGridHeight] = useState(16);
    const [fileName, setFileName] = useState('liquid-pixels');
    const [customPalette, setCustomPalette] = useState([]);

    // Constants
    const MAX_DISPLAY_SIZE = 700;
    const CANVAS_RESOLUTION_SCALE = 2; // Internal resolution multiplier for smoother curves

    // --- Helpers ---

    // Bresenham's Line Algorithm for integer grids
    const getLinePixels = (x0, y0, x1, y1) => {
        const points = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            points.push({ x: x0, y: y0 });
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
        return points;
    };

    const getDisplayMetrics = useCallback(() => {
        const safeRatio = Math.max(0.1, aspectRatio);
        const totalGridWidth = Math.max(1, gridWidth) * safeRatio;
        const totalGridHeight = Math.max(1, gridHeight);
        const scaleFactor = MAX_DISPLAY_SIZE / Math.max(totalGridWidth, totalGridHeight);
        const visualPixelWidth = scaleFactor * safeRatio;
        const visualPixelHeight = scaleFactor;
        const displayWidth = Math.round(gridWidth * visualPixelWidth);
        const displayHeight = Math.round(gridHeight * visualPixelHeight);

        return { visualPixelWidth, visualPixelHeight, scaleFactor, displayWidth, displayHeight };
    }, [gridWidth, gridHeight, aspectRatio]);

    const getPixelCoords = (clientX, clientY) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        const x = Math.floor((clientX - rect.left) / visualPixelWidth);
        const y = Math.floor((clientY - rect.top) / visualPixelHeight);
        return { x, y };
    };

    const updatePixels = (points, actionType) => {
        setPixelMap(prev => {
            const next = new Map(prev);
            const offset = Math.floor(brushSize / 2);

            points.forEach(pt => {
                for (let dy = 0; dy < brushSize; dy++) {
                    for (let dx = 0; dx < brushSize; dx++) {
                        const px = pt.x + dx - offset;
                        const py = pt.y + dy - offset;
                        if (px >= 0 && px < gridWidth && py >= 0 && py < gridHeight) {
                            const key = `${px},${py}`;
                            if (actionType === 'brush') next.set(key, currentColor);
                            else if (actionType === 'eraser') next.delete(key);
                        }
                    }
                }
            });
            return next;
        });
    };

    // --- History ---
    const saveToHistory = () => {
        const currentMap = new Map(pixelMap);
        if (history.length > 0) {
            const lastState = history[history.length - 1];
            if (lastState.size === currentMap.size && [...lastState.keys()].every(x => currentMap.has(x) && currentMap.get(x) === lastState.get(x))) return;
        }
        setHistory(prev => [...prev, currentMap].slice(-50));
        setRedoStack([]);
    };

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        setRedoStack(prev => [new Map(pixelMap), ...prev]);
        setPixelMap(previousState);
        setHistory(h => h.slice(0, -1));
        setLastActivePixel(null);
    }, [history, pixelMap]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[0];
        setHistory(prev => [...prev, new Map(pixelMap)]);
        setPixelMap(nextState);
        setRedoStack(s => s.slice(1));
    }, [redoStack, pixelMap]);

    useEffect(() => {
        const onKeyDown = (e) => {
            // Undo/Redo: KeyZ
            if (e.code === 'KeyZ') {
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    if (e.shiftKey) handleRedo(); else handleUndo();
                }
            }
            // Tool selection
            if (e.code === 'KeyB') { e.preventDefault(); setTool('brush'); }
            if (e.code === 'KeyE') { e.preventDefault(); setTool('eraser'); }
            if (e.code === 'KeyI') { e.preventDefault(); setTool('eyedropper'); }
            // Brush size
            if (e.code === 'BracketLeft') { e.preventDefault(); setBrushSize(prev => Math.max(1, prev - 1)); }
            if (e.code === 'BracketRight') { e.preventDefault(); setBrushSize(prev => Math.min(6, prev + 1)); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleUndo, handleRedo]);

    // --- Interaction ---

    const handlePointerDown = (e) => {
        e.target.setPointerCapture(e.pointerId);
        e.preventDefault();
        const { x, y } = getPixelCoords(e.clientX, e.clientY);

        if (tool === 'eyedropper' || e.altKey) {
            const color = pixelMap.get(`${x},${y}`);
            if (color) {
                setCurrentColor(color);
                setTool('brush');
            }
            return;
        }

        const isTempEraser = e.metaKey || e.ctrlKey;
        const effectiveTool = isTempEraser ? (tool === 'brush' ? 'eraser' : 'brush') : tool;

        saveToHistory();
        setIsDrawing(true);
        setStrokeOrigin({ x, y });

        if (e.shiftKey && lastActivePixel && effectiveTool === 'brush') {
            updatePixels(getLinePixels(lastActivePixel.x, lastActivePixel.y, x, y), effectiveTool);
        } else {
            updatePixels([{ x, y }], effectiveTool);
        }
        setLastActivePixel({ x, y });
    };

    const handlePointerMove = (e) => {
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        let { x, y } = getPixelCoords(e.clientX, e.clientY);

        if (isDrawing && e.shiftKey && strokeOrigin) {
            const dx = Math.abs(x - strokeOrigin.x);
            const dy = Math.abs(y - strokeOrigin.y);
            if (dx > dy) y = strokeOrigin.y; else x = strokeOrigin.x;
        }

        setCursorX(x * visualPixelWidth);
        setCursorY(y * visualPixelHeight);

        if (!isDrawing) return;
        const isTempEraser = e.metaKey || e.ctrlKey;
        const effectiveTool = isTempEraser ? (tool === 'brush' ? 'eraser' : 'brush') : tool;
        updatePixels([{ x, y }], effectiveTool);
        setLastActivePixel({ x, y });
    };

    const handlePointerUp = (e) => {
        setIsDrawing(false);
        setStrokeOrigin(null);
        e.target.releasePointerCapture(e.pointerId);
    };

    // --- Geometry logic ---

    const findContour = useCallback(() => {
        const edges = [];
        const hasPixel = (x, y) => pixelMap.has(`${x},${y}`);
        pixelMap.forEach((_, key) => {
            const [x, y] = key.split(',').map(Number);
            if (x >= gridWidth || y >= gridHeight || x < 0 || y < 0) return;
            if (!hasPixel(x, y - 1)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, side: 'top' });
            if (!hasPixel(x + 1, y)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, side: 'right' });
            if (!hasPixel(x, y + 1)) edges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1, side: 'bottom' });
            if (!hasPixel(x - 1, y)) edges.push({ x1: x, y1: y + 1, x2: x, y2: y, side: 'left' });
        });

        if (edges.length === 0) return [];
        const rawContours = [];
        const used = new Set();
        for (let i = 0; i < edges.length; i++) {
            if (used.has(i)) continue;
            const contour = [edges[i]];
            used.add(i);
            let current = edges[i];
            while (true) {
                let found = false;
                for (let j = 0; j < edges.length; j++) {
                    if (used.has(j)) continue;
                    const next = edges[j];
                    if (Math.abs(current.x2 - next.x1) < 0.001 && Math.abs(current.y2 - next.y1) < 0.001) {
                        contour.push(next);
                        used.add(j);
                        current = next;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
                if (Math.abs(current.x2 - contour[0].x1) < 0.001 && Math.abs(current.y2 - contour[0].y1) < 0.001) break;
            }
            if (contour.length > 2) rawContours.push(contour);
        }

        return rawContours.map(contour => {
            let simplified = [];
            let current = { ...contour[0] };
            for (let i = 1; i < contour.length; i++) {
                const next = contour[i];
                if (current.side === next.side) {
                    current.x2 = next.x2; current.y2 = next.y2;
                } else {
                    simplified.push(current);
                    current = { ...next };
                }
            }
            simplified.push(current);
            if (simplified.length > 2 && simplified[0].side === simplified[simplified.length - 1].side) {
                const last = simplified.pop();
                simplified[0].x1 = last.x1; simplified[0].y1 = last.y1;
            }
            return simplified;
        });
    }, [pixelMap, gridWidth, gridHeight]);

    const getCornerType = (edge1, edge2) => {
        const dx1 = edge1.x2 - edge1.x1; const dy1 = edge1.y2 - edge1.y1;
        const dx2 = edge2.x2 - edge2.x1; const dy2 = edge2.y2 - edge2.y1;
        const cross = dx1 * dy2 - dy1 * dx2;
        return cross > 0 ? 'convex' : (cross < 0 ? 'concave' : 'straight');
    };

    const drawBridgeFillet = (ctx, b, r, isSvg = false) => {
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        const safeRatio = Math.max(0.1, aspectRatio);
        const budgetFactor = Math.min(1, safeRatio);
        const oX = ((overlap / 2) * budgetFactor / safeRatio) * visualPixelWidth;
        const oY = ((overlap / 2) * budgetFactor) * visualPixelHeight;

        let cx = b.X * visualPixelWidth; let cy = b.Y * visualPixelHeight;
        if (b.quadrant === 'TR_GAP_FILLET') { cx += oX; cy -= oY; }
        else if (b.quadrant === 'BL_GAP_FILLET') { cx -= oX; cy += oY; }
        else if (b.quadrant === 'BR_GAP_FILLET') { cx += oX; cy += oY; }
        else if (b.quadrant === 'TL_GAP_FILLET') { cx -= oX; cy -= oY; }

        const cellX = (b.quadrant.includes('TR') || b.quadrant.includes('BR')) ? b.X : b.X - 1;
        const cellY = (b.quadrant.includes('TR') || b.quadrant.includes('TL')) ? b.Y - 1 : b.Y;
        const isNarrow = hardCongestedCells.has(`${cellX},${cellY}`);
        const gapBudget = visualPixelWidth * (0.5 * (1 - Math.abs(overlap)) / (1 + Math.abs(overlap)));
        const maxR = Math.min(r, isNarrow ? gapBudget : visualPixelWidth * 0.499);
        const K = 0.552284;

        let sx, sy, ex, ey, swapped = false;
        if (b.quadrant === 'TR_GAP_FILLET') { sx = cx; sy = cy - maxR; ex = cx + maxR; ey = cy; }
        else if (b.quadrant === 'BL_GAP_FILLET') { sx = cx - maxR; sy = cy; ex = cx; ey = cy + maxR; swapped = true; }
        else if (b.quadrant === 'BR_GAP_FILLET') { sx = cx + maxR; sy = cy; ex = cx; ey = cy + maxR; }
        else if (b.quadrant === 'TL_GAP_FILLET') { sx = cx; sy = cy - maxR; ex = cx - maxR; ey = cy; swapped = true; }

        if (sx === undefined) return isSvg ? '' : null;
        const p1x = swapped ? ex : sx; const p1y = swapped ? ey : sy;
        const p2x = swapped ? sx : ex; const p2y = swapped ? sy : ey;

        if (isSvg) {
            return `M ${cx} ${cy} L ${p1x} ${p1y} C ${p1x + (cx - p1x) * K} ${p1y + (cy - p1y) * K} ${p2x + (cx - p2x) * K} ${p2y + (cy - p2y) * K} ${p2x} ${p2y} Z `;
        } else {
            ctx.moveTo(cx, cy); ctx.lineTo(p1x, p1y);
            ctx.bezierCurveTo(p1x + (cx - p1x) * K, p1y + (cy - p1y) * K, p2x + (cx - p2x) * K, p2y + (cy - p2y) * K, p2x, p2y);
            ctx.closePath(); return null;
        }
    };

    const regenerateRounding = useCallback(() => {
        const pseudoRandom = (x, y, s) => {
            const n = Math.sin(x * 12.9 + y * 78.2 + s * 43758) * 43758;
            return n - Math.floor(n);
        };

        const contours = findContour();
        const newCorners = new Set();
        contours.forEach((c) => {
            c.forEach((edge, i) => {
                const type = getCornerType(edge, c[(i + 1) % c.length]);
                if (cornerMode === 'outer' && type !== 'convex') return;
                if (cornerMode === 'inner' && type !== 'concave') return;
                // Stable key: Coordinate of the corner junction
                const key = `${edge.x2},${edge.y2}`;
                if (pseudoRandom(edge.x2, edge.y2, seed) < roundedRatio) newCorners.add(key);
            });
        });
        setRoundedCorners(newCorners);

        const newBridges = []; const newBridgeMap = new Map();
        if (cornerMode !== 'outer' && pixelMap.size > 0 && overlap >= 0) {
            const has = (x, y) => pixelMap.has(`${x},${y}`);
            for (let X = 1; X < gridWidth; X++) {
                for (let Y = 1; Y < gridHeight; Y++) {
                    if (has(X - 1, Y - 1) && has(X, Y) && !has(X, Y - 1) && !has(X - 1, Y)) {
                        if (pseudoRandom(X, Y, seed + 1) < roundedRatio) {
                            newBridges.push({ X, Y, quadrant: 'TR_GAP_FILLET' });
                            newBridges.push({ X, Y, quadrant: 'BL_GAP_FILLET' });
                            newBridgeMap.set(`${X},${Y}`, true);
                        }
                    }
                    if (has(X, Y - 1) && has(X - 1, Y) && !has(X - 1, Y - 1) && !has(X, Y)) {
                        if (pseudoRandom(X, Y, seed + 2) < roundedRatio) {
                            newBridges.push({ X, Y, quadrant: 'BR_GAP_FILLET' });
                            newBridges.push({ X, Y, quadrant: 'TL_GAP_FILLET' });
                            newBridgeMap.set(`${X},${Y}`, true);
                        }
                    }
                }
            }
        }
        setBridges(newBridges); setBridgeMap(newBridgeMap);

        const counts = new Map(); const convexFaced = new Set(); const hard = new Set(); const soft = new Set();
        contours.forEach((cnt) => {
            cnt.forEach((e, i) => {
                const next = cnt[(i + 1) % cnt.length];
                const type = getCornerType(e, next);
                const key = `${next.x1},${next.y1}`; // Simplified stable key
                if (type === 'concave' && newCorners.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
                if (type === 'convex') convexFaced.add(key);
            });
        });
        newBridges.forEach(b => {
            const keys = {
                'TR_GAP_FILLET': `${b.X},${b.Y - 1}`, 'BL_GAP_FILLET': `${b.X - 1},${b.Y}`,
                'TL_GAP_FILLET': `${b.X - 1},${b.Y - 1}`, 'BR_GAP_FILLET': `${b.X},${b.Y}`
            };
            const k = keys[b.quadrant]; counts.set(k, (counts.get(k) || 0) + 1);
        });
        counts.forEach((count, k) => {
            if (count > 1) hard.add(k);
            if (convexFaced.has(k)) { if (cornerMode === 'inner') hard.add(k); else if (cornerMode === 'random') soft.add(k); }
        });
        setHardCongestedCells(hard); setSoftCongestedCells(soft);
    }, [findContour, gridWidth, gridHeight, pixelMap, cornerMode, roundedRatio, seed, overlap]);

    useEffect(() => { regenerateRounding(); }, [pixelMap, roundedRatio, cornerMode, seed, regenerateRounding]);

    // --- Rendering ---

    const drawScene = useCallback((ctx, isExport = false) => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, displayWidth, displayHeight);

        if (!isExport) {
            ctx.beginPath(); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5;
            for (let i = 0; i <= gridWidth; i++) { ctx.moveTo(i * visualPixelWidth, 0); ctx.lineTo(i * visualPixelWidth, displayHeight); }
            for (let i = 0; i <= gridHeight; i++) { ctx.moveTo(0, i * visualPixelHeight); ctx.lineTo(displayWidth, i * visualPixelHeight); }
            ctx.stroke();
        }

        if (pixelMap.size === 0) return;
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim;

        ctx.beginPath();
        if (overlap < 0) {
            pixelMap.forEach((_, key) => {
                const [x, y] = key.split(',').map(Number);
                const safeRatio = Math.max(0.1, aspectRatio); const budgetFactor = Math.min(1, safeRatio);
                const x1 = (x - (overlap / 2 * budgetFactor) / safeRatio) * visualPixelWidth;
                const y1 = (y - (overlap / 2 * budgetFactor)) * visualPixelHeight;
                const x2 = (x + 1 + (overlap / 2 * budgetFactor) / safeRatio) * visualPixelWidth;
                const y2 = (y + 1 + (overlap / 2 * budgetFactor)) * visualPixelHeight;
                const rad = Math.min(r, (x2 - x1) * 0.5, (y2 - y1) * 0.5);
                ctx.moveTo(x1 + rad, y1); ctx.lineTo(x2 - rad, y1); ctx.arcTo(x2, y1, x2, y1 + rad, rad);
                ctx.lineTo(x2, y2 - rad); ctx.arcTo(x2, y2, x2 - rad, y2, rad);
                ctx.lineTo(x1 + rad, y2); ctx.arcTo(x1, y2, x1, y2 - rad, rad);
                ctx.lineTo(x1, y1 + rad); ctx.arcTo(x1, y1, x1 + rad, y1, rad); ctx.closePath();
            });
        } else {
            const contours = findContour();
            const getAdjusted = (v, sIn, sOut) => {
                let dx = 0, dy = 0; const safeRatio = Math.max(0.1, aspectRatio); const budgetFactor = Math.min(1, safeRatio);
                if (sIn === 'top' || sOut === 'top') dy -= overlap / 2 * budgetFactor;
                if (sIn === 'bottom' || sOut === 'bottom') dy += overlap / 2 * budgetFactor;
                if (sIn === 'left' || sOut === 'left') dx -= (overlap / 2 * budgetFactor) / safeRatio;
                if (sIn === 'right' || sOut === 'right') dx += (overlap / 2 * budgetFactor) / safeRatio;
                return { x: (v.x + dx) * visualPixelWidth, y: (v.y + dy) * visualPixelHeight };
            };
            const K = 0.552284;
            contours.forEach((contour) => {
                const cornerData = contour.map((edge, i) => {
                    const nextEdge = contour[(i + 1) % contour.length];
                    const nextNextEdge = contour[(i + 2) % contour.length];
                    const p = getAdjusted({ x: edge.x1, y: edge.y1 }, contour[(i - 1 + contour.length) % contour.length].side, edge.side);
                    const next = getAdjusted({ x: edge.x2, y: edge.y2 }, edge.side, nextEdge.side);
                    const after = getAdjusted({ x: nextEdge.x2, y: nextEdge.y2 }, nextEdge.side, nextNextEdge.side);

                    const junctionKey = `${edge.x2},${edge.y2}`;
                    const congestionKey = junctionKey;
                    const isRounded = roundedCorners.has(junctionKey) && !bridgeMap.has(junctionKey);

                    let mR = 0;
                    let bX = next.x, bY = next.y, fX = next.x, fY = next.y;
                    const dx1 = next.x - p.x, dy1 = next.y - p.y, dx2 = after.x - next.x, dy2 = after.y - next.y;
                    const L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1), L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (isRounded && r > 0 && L1 > 0.01 && L2 > 0.01) {
                        const gB = visualPixelWidth * (0.5 * (1 - Math.abs(overlap)) / (1 + Math.abs(overlap)));
                        let cB = visualPixelWidth * 0.499;
                        if (getCornerType(edge, nextEdge) === 'concave') { if (hardCongestedCells.has(congestionKey)) cB = gB; }
                        else if (cornerMode === 'random' && softCongestedCells.has(congestionKey)) {
                            let f = (overlap <= 0.8) ? Math.max(0, overlap) / 0.8 : 1;
                            cB = visualPixelWidth * (0.499 * (1 - f * 0.45) + (gB / visualPixelWidth) * (f * 0.45));
                        }
                        mR = Math.min(r, L1 * 0.499, L2 * 0.499, cB);
                        if (mR > 0.01) {
                            bX = next.x - (dx1 / L1) * mR; bY = next.y - (dy1 / L1) * mR;
                            fX = next.x + (dx2 / L2) * mR; fY = next.y + (dy2 / L2) * mR;
                        }
                    }
                    return { bX, bY, fX, fY, mR, nextX: next.x, nextY: next.y, dx1: dx1 / Math.max(0.1, L1), dy1: dy1 / Math.max(0.1, L1), dx2: dx2 / Math.max(0.1, L2), dy2: dy2 / Math.max(0.1, L2) };
                });

                ctx.moveTo(cornerData[cornerData.length - 1].fX, cornerData[cornerData.length - 1].fY);
                cornerData.forEach((d) => {
                    ctx.lineTo(d.bX, d.bY);
                    if (d.mR > 0.01) {
                        if (cornerType === 'bevel') ctx.lineTo(d.fX, d.fY);
                        else ctx.bezierCurveTo(d.bX + d.dx1 * d.mR * K, d.bY + d.dy1 * d.mR * K, d.fX - d.dx2 * d.mR * K, d.fY - d.dy2 * d.mR * K, d.fX, d.fY);
                    }
                });
                ctx.closePath();
            });
            if (bridges.length > 0 && r > 0) bridges.forEach(b => drawBridgeFillet(ctx, b, r, false));
        }

        // --- Liquid Color Field ---
        ctx.save();
        ctx.clip();

        // Efficient Real-time Liquid Preview
        const buffer = document.createElement('canvas');
        buffer.width = gridWidth; buffer.height = gridHeight;
        const bCtx = buffer.getContext('2d');

        // Neighborhood Color Expansion (Dilation) to prevent edge-fade
        const expansionArea = new Map();
        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]].forEach(([nx, ny]) => {
                if (!pixelMap.has(`${nx},${ny}`) && nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                    const nKey = `${nx},${ny}`;
                    if (!expansionArea.has(nKey)) expansionArea.set(nKey, []);
                    expansionArea.get(nKey).push(color);
                }
            });
        });

        expansionArea.forEach((colors, key) => {
            const [x, y] = key.split(',').map(Number);
            const avg = colors.reduce((acc, c) => {
                acc[0] += parseInt(c.slice(1, 3), 16);
                acc[1] += parseInt(c.slice(3, 5), 16);
                acc[2] += parseInt(c.slice(5, 7), 16);
                return acc;
            }, [0, 0, 0]).map(v => Math.round(v / colors.length));
            bCtx.fillStyle = '#' + avg.map(v => v.toString(16).padStart(2, '0')).join('');
            bCtx.fillRect(x, y, 1, 1);
        });

        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            bCtx.fillStyle = color;
            bCtx.fillRect(x, y, 1, 1);
        });

        // Pixel-Level Blending
        let finalBuffer = buffer;
        if (blendPower > 0.1) {
            const tempBuffer = document.createElement('canvas');
            tempBuffer.width = gridWidth; tempBuffer.height = gridHeight;
            const tCtx = tempBuffer.getContext('2d');
            tCtx.filter = `blur(${blendPower * 1.25}px)`;
            tCtx.drawImage(buffer, 0, 0);
            finalBuffer = tempBuffer;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(finalBuffer, 0, 0, gridWidth, gridHeight, 0, 0, displayWidth, displayHeight);
        ctx.restore();
    }, [gridWidth, gridHeight, pixelMap, findContour, roundness, overlap, roundedCorners, hardCongestedCells, softCongestedCells, bridges, cornerType, getDisplayMetrics, cornerMode, blendPower, aspectRatio]);

    useEffect(() => {
        const cvs = canvasRef.current; if (!cvs) return;
        const ctx = cvs.getContext('2d'); const { displayWidth, displayHeight } = getDisplayMetrics();
        cvs.width = displayWidth * CANVAS_RESOLUTION_SCALE; cvs.height = displayHeight * CANVAS_RESOLUTION_SCALE;
        ctx.scale(CANVAS_RESOLUTION_SCALE, CANVAS_RESOLUTION_SCALE);
        drawScene(ctx, false);
    }, [drawScene, getDisplayMetrics]);

    // --- Export ---

    const getSVGString = () => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim;
        const getAdjusted = (v, sIn, sOut) => {
            let dx = 0, dy = 0; const safeRatio = Math.max(0.1, aspectRatio); const budgetFactor = Math.min(1, safeRatio);
            if (sIn === 'top' || sOut === 'top') dy -= overlap / 2 * budgetFactor;
            if (sIn === 'bottom' || sOut === 'bottom') dy += overlap / 2 * budgetFactor;
            if (sIn === 'left' || sOut === 'left') dx -= (overlap / 2 * budgetFactor) / safeRatio;
            if (sIn === 'right' || sOut === 'right') dx += (overlap / 2 * budgetFactor) / safeRatio;
            return { x: (v.x + dx) * visualPixelWidth, y: (v.y + dy) * visualPixelHeight };
        };
        const K = 0.552284; let pathData = '';
        if (overlap < 0) {
            pixelMap.forEach((_, key) => {
                const [x, y] = key.split(',').map(Number);
                const safeRatio = Math.max(0.1, aspectRatio); const budgetFactor = Math.min(1, safeRatio);
                const x1 = (x - (overlap / 2 * budgetFactor) / safeRatio) * visualPixelWidth, y1 = (y - overlap / 2 * budgetFactor) * visualPixelHeight;
                const x2 = (x + 1 + (overlap / 2 * budgetFactor) / safeRatio) * visualPixelWidth, y2 = (y + 1 + overlap / 2 * budgetFactor) * visualPixelHeight;
                const rad = Math.min(r, (x2 - x1) * 0.499, (y2 - y1) * 0.499);
                pathData += `M ${x1 + rad} ${y1} L ${x2 - rad} ${y1} Q ${x2} ${y1} ${x2} ${y1 + rad} L ${x2} ${y2 - rad} Q ${x2} ${y2} ${x2 - rad} ${y2} L ${x1 + rad} ${y2} Q ${x1} ${y2} ${x1} ${y2 - rad} L ${x1} ${y1 + rad} Q ${x1} ${y1} ${x1 + rad} ${y1} Z `;
            });
        } else {
            const contours = findContour();
            contours.forEach((contour) => {
                const cornerData = contour.map((edge, i) => {
                    const nextEdge = contour[(i + 1) % contour.length];
                    const nextNextEdge = contour[(i + 2) % contour.length];
                    const p = getAdjusted({ x: edge.x1, y: edge.y1 }, contour[(i - 1 + contour.length) % contour.length].side, edge.side);
                    const next = getAdjusted({ x: edge.x2, y: edge.y2 }, edge.side, nextEdge.side);
                    const after = getAdjusted({ x: nextEdge.x2, y: nextEdge.y2 }, nextEdge.side, nextNextEdge.side);

                    const junctionKey = `${edge.x2},${edge.y2}`;
                    const congestionKey = junctionKey;
                    const isRounded = roundedCorners.has(junctionKey) && !bridgeMap.has(junctionKey);

                    let mR = 0;
                    let bX = next.x, bY = next.y, fX = next.x, fY = next.y;
                    const dx1 = next.x - p.x, dy1 = next.y - p.y, dx2 = after.x - next.x, dy2 = after.y - next.y;
                    const L1 = Math.sqrt(dx1 * dx1 + dy1 * dy1), L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (isRounded && r > 0 && L1 > 0.01 && L2 > 0.01) {
                        const gB = visualPixelWidth * (0.5 * (1 - Math.abs(overlap)) / (1 + Math.abs(overlap)));
                        let cB = visualPixelWidth * 0.499;
                        if (getCornerType(edge, nextEdge) === 'concave') { if (hardCongestedCells.has(congestionKey)) cB = gB; }
                        else if (cornerMode === 'random' && softCongestedCells.has(congestionKey)) {
                            let f = (overlap <= 0.8) ? Math.max(0, overlap) / 0.8 : Math.max(0, 1 - (overlap - 0.8) / 0.2);
                            cB = visualPixelWidth * (0.499 * (1 - f * 0.4) + (gB / visualPixelWidth) * (f * 0.4));
                        }
                        mR = Math.min(r, L1 * 0.499, L2 * 0.499, cB);
                        if (mR > 0.01) {
                            bX = next.x - (dx1 / L1) * mR; bY = next.y - (dy1 / L1) * mR;
                            fX = next.x + (dx2 / L2) * mR; fY = next.y + (dy2 / L2) * mR;
                        }
                    }
                    return { bX, bY, fX, fY, mR, dx1: dx1 / Math.max(0.1, L1), dy1: dy1 / Math.max(0.1, L1), dx2: dx2 / Math.max(0.1, L2), dy2: dy2 / Math.max(0.1, L2) };
                });

                pathData += `M ${cornerData[cornerData.length - 1].fX} ${cornerData[cornerData.length - 1].fY} `;
                cornerData.forEach((d) => {
                    pathData += `L ${d.bX} ${d.bY} `;
                    if (d.mR > 0.01) {
                        if (cornerType === 'bevel') pathData += `L ${d.fX} ${d.fY} `;
                        else pathData += `C ${d.bX + d.dx1 * d.mR * K} ${d.bY + d.dy1 * d.mR * K} ${d.fX - d.dx2 * d.mR * K} ${d.fY - d.dy2 * d.mR * K} ${d.fX} ${d.fY} `;
                    }
                });
                pathData += 'Z ';
            });
            if (bridges.length > 0 && r > 0) bridges.forEach(b => { pathData += drawBridgeFillet(null, b, r, true); });
        }
        // To ensure 100% Figma/Illustrator compatibility and perfect aspect ratio handling,
        // we use a Bilinear Image Fill approach for the internal colors.
        // This exactly matches the canvas preview and is totally reliable in vector tools.

        // High-Fidelity "Baking" for Export (Figma/Illustrator Compatibility)
        // Optimized for small file size (KBs instead of MBs) using moderate resolution JPEG
        const targetRes = 1024;
        const upscale = Math.max(1, Math.floor(targetRes / Math.max(gridWidth, gridHeight)));
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = (gridWidth + 2) * upscale;
        exportCanvas.height = (gridHeight + 2) * upscale;
        const eCtx = exportCanvas.getContext('2d');
        eCtx.imageSmoothingEnabled = true;

        // 1. Dilation Pass (Edge Expansion)
        const expansionArea = new Map();
        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]].forEach(([nx, ny]) => {
                if (!pixelMap.has(`${nx},${ny}`) && nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                    const nKey = `${nx},${ny}`;
                    if (!expansionArea.has(nKey)) expansionArea.set(nKey, []);
                    expansionArea.get(nKey).push(color);
                }
            });
        });

        expansionArea.forEach((colors, key) => {
            const [x, y] = key.split(',').map(Number);
            const avg = colors.reduce((acc, c) => {
                acc[0] += parseInt(c.slice(1, 3), 16);
                acc[1] += parseInt(c.slice(3, 5), 16);
                acc[2] += parseInt(c.slice(5, 7), 16);
                return acc;
            }, [0, 0, 0]).map(v => Math.round(v / colors.length));
            eCtx.fillStyle = '#' + avg.map(v => v.toString(16).padStart(2, '0')).join('');
            eCtx.fillRect((x + 1) * upscale, (y + 1) * upscale, upscale, upscale);
        });

        // 2. Main Pixel Pass
        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            eCtx.fillStyle = color;
            eCtx.fillRect((x + 1) * upscale, (y + 1) * upscale, upscale, upscale);
        });

        // 3. Bake the Liquid Blur into the High-Res Image
        if (blendPower > 0.1) {
            const tempCvs = document.createElement('canvas');
            tempCvs.width = exportCanvas.width; tempCvs.height = exportCanvas.height;
            const tCtx = tempCvs.getContext('2d');
            tCtx.filter = `blur(${blendPower * 1.25 * upscale}px)`; // Blur scaled to upscale factor
            tCtx.drawImage(exportCanvas, 0, 0);
            eCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
            eCtx.drawImage(tempCvs, 0, 0);
        }

        // PNG at 1024px resolution is efficient and supports transparency (no black BG issues)
        const dataUrl = exportCanvas.toDataURL("image/png");

        return `<svg width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${displayWidth} ${displayHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <path id="blob" d="${pathData}" />
    <clipPath id="blobClip"><use xlink:href="#blob" /></clipPath>
  </defs>
  <rect width="100%" height="100%" fill="white"/>
  <g clip-path="url(#blobClip)">
    <image 
        x="${-visualPixelWidth}" y="${-visualPixelHeight}" 
        width="${(gridWidth + 2) * visualPixelWidth}" 
        height="${(gridHeight + 2) * visualPixelHeight}" 
        href="${dataUrl}"
        xlink:href="${dataUrl}" 
        preserveAspectRatio="none"
    />
  </g>
</svg>`.trim();
    };

    const exportSVG = () => {
        const blob = new Blob([getSVGString()], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${fileName}.svg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const clearCanvas = () => {
        saveToHistory(); setPixelMap(new Map()); setRoundedCorners(new Set()); setBridges([]); setBridgeMap(new Map()); setHardCongestedCells(new Set()); setSoftCongestedCells(new Set()); setLastActivePixel(null);
    };

    // UI helpers
    const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
    const cursorStyle = {
        width: `${brushSize * visualPixelWidth}px`, height: `${brushSize * visualPixelHeight}px`,
        left: `${cursorX - (Math.floor(brushSize / 2) * visualPixelWidth)}px`,
        top: `${cursorY - (Math.floor(brushSize / 2) * visualPixelHeight)}px`,
        borderColor: 'white', backgroundColor: 'transparent', mixBlendMode: 'difference',
        borderRadius: '2px', borderWidth: '1px', borderStyle: 'solid', position: 'absolute', pointerEvents: 'none', zIndex: 10,
    };

    return (
        <div className="flex flex-col lg:flex-row items-start justify-center gap-12 p-4 lg:p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
            <div className="flex flex-col items-center flex-none">
                <div className="flex items-start justify-center select-none mb-4" style={{ minWidth: `${MAX_DISPLAY_SIZE + 32}px` }}>
                    <div className="relative border border-gray-200 rounded-[3px] overflow-hidden bg-white" style={{ width: displayWidth, height: displayHeight }}>
                        {isCursorVisible && <div style={cursorStyle} />}
                        <canvas ref={canvasRef} className="block touch-none" style={{ width: '100%', height: '100%' }}
                            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                            onPointerLeave={() => { setIsDrawing(false); setIsCursorVisible(false); }} onPointerEnter={() => setIsCursorVisible(true)}
                        />
                    </div>
                </div>

                <div className="w-full max-w-[700px]">
                    <div className="flex flex-wrap items-center gap-6 py-2 justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={handleUndo} disabled={history.length === 0} className="p-2.5 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-30 transition text-gray-900"><Undo2 size={20} /></button>
                            <button onClick={handleRedo} disabled={redoStack.length === 0} className="p-2.5 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-30 transition text-gray-900"><Redo2 size={20} /></button>
                        </div>

                        <div className="flex items-center gap-2 bg-transparent px-0 py-2">
                            <Settings size={16} className="text-gray-400" />
                            <input type="number" min="4" max="128" step="1" value={gridWidth} onChange={(e) => setGridWidth(Number(e.target.value))} className="bg-transparent w-10 text-sm font-bold outline-none text-gray-900 text-right" />
                            <span className="text-xs text-gray-400">×</span>
                            <input type="number" min="4" max="128" step="1" value={gridHeight} onChange={(e) => setGridHeight(Number(e.target.value))} className="bg-transparent w-10 text-sm font-bold outline-none text-gray-900 text-right" />
                            <span className="text-xs font-bold text-gray-400 ml-1 uppercase letter-spacing-1">px</span>
                        </div>

                        <p className="text-[11px] font-medium text-gray-400 max-w-[400px] leading-tight text-center lg:text-left">Shift+Click for lines. Shift+Drag for orthogonal. [ ] for brush size.</p>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-sm flex flex-col gap-12">
                <div>
                    <div className="flex gap-1.5 mb-5">
                        <button onClick={() => setTool('brush')} className={`flex-1 py-2 text-[11px] font-medium rounded-lg border transition-all flex items-center justify-center gap-2 ${tool === 'brush' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}><Brush size={14} /> Brush (B)</button>
                        <button onClick={() => setTool('eraser')} className={`flex-1 py-2 text-[11px] font-medium rounded-lg border transition-all flex items-center justify-center gap-2 ${tool === 'eraser' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}><Eraser size={14} /> Eraser (E)</button>
                        <button onClick={clearCanvas} className="px-3 py-2 rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-red-500 hover:border-red-100 transition shadow-sm" title="Clear Canvas"><Trash2 size={16} /></button>
                    </div>

                    <div className="grid grid-cols-6 gap-1.5 mb-2">
                        {/* Static Row: first 5 colors */}
                        {palette.slice(0, 5).map(c => (
                            <button key={c} onClick={() => { setCurrentColor(c); setTool('brush'); }} style={{ backgroundColor: c }} className={`w-full h-8 rounded border border-gray-100 transition hover:scale-105 ${currentColor === c ? 'ring-2 ring-black ring-offset-1' : ''}`} />
                        ))}
                    </div>

                    <div className="grid grid-cols-6 gap-1.5 mb-12">
                        {/* Custom Swatches Row */}
                        {customPalette.map((c, idx) => (
                            <div key={idx} className="relative w-full h-8 rounded border border-gray-200 bg-white flex items-center justify-center overflow-hidden transition hover:bg-gray-50 group">
                                <div className="absolute inset-0" style={{ backgroundColor: c }} onClick={() => { setCurrentColor(c); setTool('brush'); }} />
                                <input type="color" value={c} onChange={(e) => {
                                    const next = [...customPalette];
                                    next[idx] = e.target.value;
                                    setCustomPalette(next);
                                    setCurrentColor(e.target.value);
                                    setTool('brush');
                                }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </div>
                        ))}

                        {customPalette.length < 4 && (
                            <button
                                onClick={() => setCustomPalette([...customPalette, currentColor])}
                                className="w-full h-8 rounded border-2 border-dashed border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500 transition flex items-center justify-center"
                                title="Add Custom Color"
                            >
                                <Plus size={14} />
                            </button>
                        )}

                        <button onClick={() => setTool('eyedropper')} className={`w-full h-8 rounded border flex items-center justify-center transition ${tool === 'eyedropper' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:border-gray-100'}`} title="Eyedropper"><Pipette size={14} /></button>
                    </div>

                    <div className="mb-6">
                        <div className="text-xs font-normal text-gray-600 mb-1.5">Liquid intensity</div>
                        <div className="flex items-center gap-3">
                            <input type="number" value={Math.round(blendPower * 100)} onChange={(e) => setBlendPower(Math.max(0.1, Math.min(1, parseInt(e.target.value) / 100)))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                            <input type="range" min="0.1" max="1" step="0.01" value={blendPower} onChange={(e) => setBlendPower(parseFloat(e.target.value))} className="flex-1 h-3 cursor-pointer accent-black" />
                        </div>
                    </div>

                    <div className="mb-4 space-y-5">
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Brush size</div>
                            <div className="flex items-center gap-3">
                                <input type="number" min="1" max="6" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                                <input type="range" min="1" max="6" step="1" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="flex-1 h-3 cursor-pointer accent-black" />
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Pixel ratio</div>
                            <div className="flex items-center gap-3">
                                <input type="number" step="0.01" value={aspectRatio.toFixed(2)} onChange={(e) => setAspectRatio(parseFloat(e.target.value))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                                <div className="relative flex-1 group/slider">
                                    <input
                                        type="range"
                                        min="-1" max="1" step="0.01"
                                        value={aspectRatio === 1 ? 0 : (aspectRatio < 1 ? (aspectRatio - 1) / 0.75 : (aspectRatio - 1) / 3)}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            const snappedV = Math.abs(v) < 0.08 ? 0 : v;
                                            const mapped = snappedV === 0 ? 1 : (snappedV < 0 ? 1 + snappedV * 0.75 : 1 + snappedV * 3);
                                            setAspectRatio(mapped);
                                        }}
                                        className="w-full h-3 cursor-pointer accent-black"
                                    />
                                    <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-1 h-1 bg-black/40 rounded-full pointer-events-none group-hover/slider:bg-black/80 transition-colors" />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Overlap / Gap</div>
                            <div className="flex items-center gap-3">
                                <input type="number" step="0.01" value={overlap.toFixed(2)} onChange={(e) => setOverlap(parseFloat(e.target.value))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                                <div className="relative flex-1 group/slider">
                                    <input
                                        type="range"
                                        min="-1" max="1" step="0.01"
                                        value={overlap}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            setOverlap(Math.abs(v) < 0.08 ? 0 : v);
                                        }}
                                        className="w-full h-3 cursor-pointer accent-black"
                                    />
                                    <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-1 h-1 bg-black/40 rounded-full pointer-events-none group-hover/slider:bg-black/80 transition-colors" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="space-y-6">
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Smoothing</div>
                            <div className="grid grid-cols-3 gap-1 mb-1.5">
                                {['random', 'outer', 'inner'].map(mode => (
                                    <button key={mode} onClick={() => setCornerMode(mode)} className={`py-1.5 text-[11px] font-medium rounded border transition-all ${cornerMode === mode ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{mode === 'random' ? 'Mixed' : mode === 'outer' ? 'Convex' : 'Concave'}</button>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                {['round', 'bevel'].map(type => (
                                    <button key={type} onClick={() => setCornerType(type)} className={`flex-1 py-1 text-[11px] font-medium border transition rounded ${cornerType === type ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{type}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Corner radius</div>
                            <div className="flex items-center gap-3">
                                <input type="number" step="0.01" value={roundness.toFixed(2)} onChange={(e) => setRoundness(parseFloat(e.target.value))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                                <input type="range" min="0" max="0.5" step="0.01" value={roundness} onChange={(e) => setRoundness(parseFloat(e.target.value))} className="flex-1 h-3 cursor-pointer accent-black" />
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-normal text-gray-600 mb-1.5">Smooth probability</div>
                            <div className="flex items-center gap-3">
                                <input type="number" step="0.01" value={roundedRatio.toFixed(2)} onChange={(e) => setRoundedRatio(parseFloat(e.target.value))} className="w-16 text-xs font-mono font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-md px-2 py-1 outline-none focus:border-gray-300" />
                                <input type="range" min="0" max="1" step="0.05" value={roundedRatio} onChange={(e) => setRoundedRatio(parseFloat(e.target.value))} className="flex-1 h-3 cursor-pointer accent-black" />
                            </div>
                        </div>
                        <button onClick={() => setSeed(Math.random())} className="w-full py-2.5 rounded border border-gray-100 bg-white hover:border-gray-200 text-gray-400 hover:text-black transition flex items-center justify-center gap-2 text-[10px] font-medium tracking-widest uppercase"><RefreshCw size={14} /> Shuffle Seed</button>
                    </div>
                </div>

                <div>
                    <div className="flex flex-col gap-2">
                        <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 outline-none focus:border-gray-300 font-normal text-gray-700 mb-1" placeholder="filename" />
                        <div className="flex gap-2">
                            <button onClick={exportSVG} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition flex items-center justify-center gap-2 text-[11px] font-medium tracking-wider text-gray-600"><FileCode size={16} /> SVG</button>
                            <button onClick={() => {
                                const { displayWidth, displayHeight } = getDisplayMetrics();
                                const scale = 4;
                                const canvas = document.createElement('canvas');
                                canvas.width = displayWidth * scale;
                                canvas.height = displayHeight * scale;
                                const ctx = canvas.getContext('2d');
                                ctx.scale(scale, scale);
                                drawScene(ctx, false);
                                const link = document.createElement('a');
                                link.download = `${fileName}.png`;
                                link.href = canvas.toDataURL('image/png');
                                link.click();
                            }} className="flex-1 px-4 py-2.5 rounded-lg bg-black text-white hover:bg-gray-800 transition flex items-center justify-center gap-2 text-[11px] font-medium tracking-wider"><FileImage size={16} /> PNG</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PixelArtEditor;
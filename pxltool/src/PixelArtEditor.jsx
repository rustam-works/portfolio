import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw, Undo2, Redo2, Settings, Brush, Eraser, FileCode, Maximize, Move } from 'lucide-react';

const PixelArtEditor = () => {
    const canvasRef = useRef(null);
    
    // --- State ---
    const [pixels, setPixels] = useState(new Set());
    const [isDrawing, setIsDrawing] = useState(false);
    
    // History
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Algorithm params
    const [roundness, setRoundness] = useState(0.4);
    const [roundedRatio, setRoundedRatio] = useState(0.7);
    const [brushSize, setBrushSize] = useState(1);
    const [tool, setTool] = useState('brush');
    const [roundedCorners, setRoundedCorners] = useState(new Set());
    
    // Bridges
    const [bridges, setBridges] = useState([]);
    const [bridgeMap, setBridgeMap] = useState(new Map());
    const [cornerMode, setCornerMode] = useState('random');
    const [seed, setSeed] = useState(12345);

    // New Features State
    const [aspectRatio, setAspectRatio] = useState(1); // Width multiplier (1 = square, 2 = 2:1 rectangle)
    const [lastActivePixel, setLastActivePixel] = useState(null); // For Shift+Click lines
    const [strokeOrigin, setStrokeOrigin] = useState(null); // For Shift+Drag orthogonal lock

    // Cursor
    const [cursorX, setCursorX] = useState(0);
    const [cursorY, setCursorY] = useState(0);
    const [isCursorVisible, setIsCursorVisible] = useState(false);

    // Settings
    const [gridWidth, setGridWidth] = useState(32);
    const [gridHeight, setGridHeight] = useState(32);
    const [fileName, setFileName] = useState('smooth-pixels');

    // Constants
    const MAX_DISPLAY_SIZE = 700; // Increased from 512
    const CANVAS_RESOLUTION_SCALE = 2; // Internal resolution multiplier for smoother curves

    // --- Helpers for Geometry ---

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

    // Calculate scaling to fit the rectangular grid into the square display area
    const getDisplayMetrics = useCallback(() => {
        const totalGridWidth = gridWidth * aspectRatio;
        const totalGridHeight = gridHeight;
        
        // Fit the largest dimension into MAX_DISPLAY_SIZE
        const scaleFactor = MAX_DISPLAY_SIZE / Math.max(totalGridWidth, totalGridHeight);
        
        const visualPixelWidth = scaleFactor * aspectRatio;
        const visualPixelHeight = scaleFactor;
        
        // Calculate the actual dimensions of the canvas container
        const displayWidth = Math.round(gridWidth * visualPixelWidth);
        const displayHeight = Math.round(gridHeight * visualPixelHeight);
        
        return { visualPixelWidth, visualPixelHeight, scaleFactor, displayWidth, displayHeight };
    }, [gridWidth, gridHeight, aspectRatio]);

    const getPixelCoords = (clientX, clientY) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();

        // Relative coordinates within the canvas element
        const relX = clientX - rect.left;
        const relY = clientY - rect.top;

        // Map to grid coordinates
        // Dynamically calculate scale based on actual DOM size vs Internal Canvas size
        // Note: canvas.width is now scaled by CANVAS_RESOLUTION_SCALE, but CSS size (rect) is not.
        // We need the ratio between DOM pixels and Logical pixels.
        
        // Since we want coordinates relative to the visual display, we can ignore the internal resolution here
        // as long as visualPixelWidth is based on the display size.
        
        const cssScaleX = 1; // Since we calculate relative to DOM rect, and visualPixelWidth is based on DOM size
        const cssScaleY = 1;

        const scaledX = relX;
        const scaledY = relY;

        const x = Math.floor(scaledX / visualPixelWidth);
        const y = Math.floor(scaledY / visualPixelHeight);
        
        return { x, y };
    };

    // Updated to accept an array of points for batch operations (Lines)
    const updatePixels = (points, actionType) => {
        setPixels(prev => {
            const next = new Set(prev);
            const offset = Math.floor(brushSize / 2);

            points.forEach(pt => {
                // Apply brush size to every point in the list
                for (let dy = 0; dy < brushSize; dy++) {
                    for (let dx = 0; dx < brushSize; dx++) {
                        const px = pt.x + dx - offset;
                        const py = pt.y + dy - offset;
                        if (px >= 0 && px < gridWidth && py >= 0 && py < gridHeight) {
                            if (actionType === 'brush') next.add(`${px},${py}`);
                            else next.delete(`${px},${py}`);
                        }
                    }
                }
            });
            return next;
        });
    };

    // --- History ---
    const saveToHistory = () => {
        if (history.length > 0) {
            const lastState = history[history.length - 1];
            if (lastState.size === pixels.size && [...lastState].every(x => pixels.has(x))) return;
        }
        const newHistory = [...history, new Set(pixels)].slice(-50);
        setHistory(newHistory);
        setRedoStack([]);
    };

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const previousState = history[history.length - 1];
        const newHistory = history.slice(0, -1);
        setRedoStack(prev => [new Set(pixels), ...prev]);
        setPixels(previousState);
        setHistory(newHistory);
        setLastActivePixel(null); // Reset line anchor on undo
    }, [history, pixels]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[0];
        const newRedoStack = redoStack.slice(1);
        setHistory(prev => [...prev, new Set(pixels)]);
        setPixels(nextState);
        setRedoStack(newRedoStack);
    }, [redoStack, pixels]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
            }
            if (e.key === 'b') setTool('brush');
            if (e.key === 'e') setTool('eraser');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    // --- Interaction Handlers ---

    const handlePointerDown = (e) => {
        e.target.setPointerCapture(e.pointerId);
        e.preventDefault();

        const isTempEraser = e.metaKey || e.ctrlKey;
        const effectiveTool = isTempEraser ? (tool === 'brush' ? 'eraser' : 'brush') : tool;
        
        saveToHistory();
        setIsDrawing(true);
        
        const { x, y } = getPixelCoords(e.clientX, e.clientY);
        setStrokeOrigin({ x, y }); // Record start for orthogonal lock

        // Feature: Shift + Click (Straight Line from last point)
        // If Shift is held AND we have a previous point, connect them.
        if (e.shiftKey && lastActivePixel && tool === 'brush') {
            const linePoints = getLinePixels(lastActivePixel.x, lastActivePixel.y, x, y);
            updatePixels(linePoints, effectiveTool);
        } else {
            // Standard click (Dot)
            updatePixels([{ x, y }], effectiveTool);
        }

        setLastActivePixel({ x, y });
    };

    const handlePointerMove = (e) => {
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        const canvasElement = canvasRef.current;
        if (!canvasElement) return;

        let { x, y } = getPixelCoords(e.clientX, e.clientY);

        // Feature: Shift + Drag (Orthogonal Lock)
        // If drawing and Shift is held, lock to the axis relative to where the stroke started.
        if (isDrawing && e.shiftKey && strokeOrigin) {
            const dx = Math.abs(x - strokeOrigin.x);
            const dy = Math.abs(y - strokeOrigin.y);
            
            // Lock to the axis with the greater movement
            if (dx > dy) {
                y = strokeOrigin.y;
            } else {
                x = strokeOrigin.x;
            }
        }

        // Snap cursor to calculated grid slot
        const snappedX = x * visualPixelWidth; 
        const snappedY = y * visualPixelHeight;
        
        setCursorX(snappedX);
        setCursorY(snappedY);

        if (!isDrawing) return;
        e.preventDefault();

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

    // --- Geometry Logic (Contours & Bridges) ---
    // This logic operates on abstract Grid Coordinates (Integers)

    const findContour = useCallback(() => {
        const edges = [];
        const hasPixel = (x, y) => pixels.has(`${x},${y}`);
        pixels.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (x >= gridWidth || y >= gridHeight || x < 0 || y < 0) return;

            if (!hasPixel(x, y - 1)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, side: 'top' });
            if (!hasPixel(x + 1, y)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, side: 'right' });
            if (!hasPixel(x, y + 1)) edges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1, side: 'bottom' });
            if (!hasPixel(x - 1, y)) edges.push({ x1: x, y1: y + 1, x2: x, y2: y, side: 'left' });
        });
        
        if (edges.length === 0) return [];
        const contours = [];
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
                    if (Math.abs(current.x2 - next.x1) < 0.01 && Math.abs(current.y2 - next.y1) < 0.01) {
                        contour.push(next);
                        used.add(j);
                        current = next;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
                if (Math.abs(current.x2 - contour[0].x1) < 0.01 && Math.abs(current.y2 - contour[0].y1) < 0.01) break;
            }
            if (contour.length > 2) contours.push(contour);
        }
        return contours;
    }, [pixels, gridWidth, gridHeight]);

    const getCornerType = (edge1, edge2) => {
        const dx1 = edge1.x2 - edge1.x1;
        const dy1 = edge1.y2 - edge1.y1;
        const dx2 = edge2.x2 - edge2.x1;
        const dy2 = edge2.y2 - edge2.y1;
        const cross = dx1 * dy2 - dy1 * dx2;
        return cross > 0 ? 'convex' : 'concave';
    };

    const pseudoRandom = (x, y, seed) => {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
        return n - Math.floor(n);
    };

    const drawBridgeFillet = (ctx, b, r, isSvg = false) => {
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        // Calculate screen coordinates
        const cx = b.X * visualPixelWidth;
        const cy = b.Y * visualPixelHeight;
        
        // Clamp radius to shortest dimension to avoid overlap in rectangular pixels
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const maxR = Math.min(r, minDim * 0.5);

        let sx, sy, ex, ey;

        // Note: For rectangular pixels, the bridge fillets need to align with the stretched edges.
        // The vertex is (cx, cy). 
        if (b.quadrant === 'TR_GAP_FILLET') { 
            sx = cx; sy = cy - maxR; 
            ex = cx + maxR; ey = cy; 
        } 
        else if (b.quadrant === 'BL_GAP_FILLET') { 
            sx = cx - maxR; sy = cy; 
            ex = cx; ey = cy + maxR; 
        } 
        else if (b.quadrant === 'BR_GAP_FILLET') { 
            sx = cx + maxR; sy = cy; 
            ex = cx; ey = cy + maxR; 
        } 
        else if (b.quadrant === 'TL_GAP_FILLET') { 
            sx = cx; sy = cy - maxR; 
            ex = cx - maxR; ey = cy; 
        }

        if (sx === undefined) return isSvg ? '' : null;

        if (isSvg) {
            return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey} L ${cx} ${cy} Z `;
        } else {
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(cx, cy, ex, ey);
            ctx.lineTo(cx, cy);
            ctx.lineTo(sx, sy);
            return null;
        }
    };

    const regenerateRounding = useCallback(() => {
        const contours = findContour();
        const newRoundedCorners = new Set();
        contours.forEach((contour, cId) => {
            contour.forEach((edge, i) => {
                const nextEdge = contour[(i + 1) % contour.length];
                const cornerType = getCornerType(edge, nextEdge);
                
                if (cornerMode === 'outer' && cornerType !== 'convex') return;
                if (cornerMode === 'inner' && cornerType !== 'concave') return;
                
                const val = pseudoRandom(edge.x2, edge.y2, seed);
                if (val < roundedRatio) {
                    newRoundedCorners.add(`${cId}-${i}`);
                }
            });
        });
        setRoundedCorners(newRoundedCorners);

        const newBridges = [];
        const newBridgeMap = new Map();
        if (cornerMode !== 'outer' && pixels.size > 0) {
            const hasPixel = (x, y) => pixels.has(`${x},${y}`);
            for (let X = 1; X < gridWidth; X++) {
                for (let Y = 1; Y < gridHeight; Y++) {
                    const Ptl = hasPixel(X - 1, Y - 1);
                    const Ptr = hasPixel(X, Y - 1);
                    const Pbl = hasPixel(X - 1, Y);
                    const Pbr = hasPixel(X, Y);

                    if (Ptl && Pbr && !Ptr && !Pbl) {
                        if (pseudoRandom(X, Y, seed + 1) < roundedRatio) {
                            newBridges.push({ X, Y, quadrant: 'TR_GAP_FILLET' });
                            newBridges.push({ X, Y, quadrant: 'BL_GAP_FILLET' });
                            newBridgeMap.set(`${X},${Y}`, true);
                        }
                    }
                    if (Ptr && Pbl && !Ptl && !Pbr) {
                        if (pseudoRandom(X, Y, seed + 2) < roundedRatio) {
                            newBridges.push({ X, Y, quadrant: 'BR_GAP_FILLET' });
                            newBridges.push({ X, Y, quadrant: 'TL_GAP_FILLET' });
                            newBridgeMap.set(`${X},${Y}`, true);
                        }
                    }
                }
            }
        }
        setBridges(newBridges);
        setBridgeMap(newBridgeMap);

    }, [findContour, cornerMode, roundedRatio, seed, pixels, gridWidth, gridHeight]);

    useEffect(() => {
        regenerateRounding();
    }, [pixels, roundedRatio, cornerMode, seed, regenerateRounding]);


    // --- Rendering ---

    const drawScene = useCallback((ctx, isExport = false) => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, displayWidth, displayHeight);

        if (!isExport) {
            ctx.beginPath();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 0.5;
            
            // Draw Vertical lines
            for (let i = 0; i <= gridWidth; i++) {
                const xPos = i * visualPixelWidth;
                ctx.moveTo(xPos, 0);
                ctx.lineTo(xPos, displayHeight);
            }
            // Draw Horizontal lines
            for (let i = 0; i <= gridHeight; i++) {
                const yPos = i * visualPixelHeight;
                ctx.moveTo(0, yPos);
                ctx.lineTo(displayWidth, yPos);
            }
            ctx.stroke();
        }

        if (pixels.size === 0) return;
        
        const contours = findContour();
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim; 

        ctx.fillStyle = '#000000';
        ctx.beginPath();

        contours.forEach((contour, contourId) => {
            if (contour.length > 0) ctx.moveTo(contour[0].x1 * visualPixelWidth, contour[0].y1 * visualPixelHeight);
            
            contour.forEach((edge, i) => {
                const nextEdge = contour[(i + 1) % contour.length];
                
                // Screen coordinates
                const px = edge.x2 * visualPixelWidth;
                const py = edge.y2 * visualPixelHeight;
                
                const vertexX = edge.x2;
                const vertexY = edge.y2;
                
                let shouldRound = roundedCorners.has(`${contourId}-${i}`);
                if (bridgeMap.has(`${vertexX},${vertexY}`)) shouldRound = false;
                
                if (shouldRound && r > 0) {
                    const dx1 = edge.x2 - edge.x1;
                    const dy1 = edge.y2 - edge.y1;
                    const dx2 = nextEdge.x2 - nextEdge.x1;
                    const dy2 = nextEdge.y2 - nextEdge.y1;
                    
                    const maxR = Math.min(r, minDim * 0.5);

                    const backX = px - (dx1 !== 0 ? Math.sign(dx1) * maxR : 0);
                    const backY = py - (dy1 !== 0 ? Math.sign(dy1) * maxR : 0);
                    
                    const fwdX = px + (dx2 !== 0 ? Math.sign(dx2) * maxR : 0);
                    const fwdY = py + (dy2 !== 0 ? Math.sign(dy2) * maxR : 0);
                    
                    ctx.lineTo(backX, backY);
                    ctx.arcTo(px, py, fwdX, fwdY, maxR);
                } else {
                    ctx.lineTo(px, py);
                }
            });
            ctx.closePath();
        });

        if (bridges.length > 0 && r > 0) {
            bridges.forEach(b => drawBridgeFillet(ctx, b, r * minDim, false));
        }
        ctx.fill('evenodd');
    }, [gridWidth, gridHeight, pixels, findContour, roundness, roundedCorners, bridgeMap, bridges, getDisplayMetrics]);

    const { displayWidth, displayHeight } = getDisplayMetrics();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // High DPI Handling
        // Set internal dimensions to scaled size
        canvas.width = displayWidth * CANVAS_RESOLUTION_SCALE;
        canvas.height = displayHeight * CANVAS_RESOLUTION_SCALE;
        
        // Scale context so we can draw using logical coordinates
        ctx.scale(CANVAS_RESOLUTION_SCALE, CANVAS_RESOLUTION_SCALE);
        
        drawScene(ctx, false);
    }, [drawScene, displayWidth, displayHeight]);


    // --- Export ---
    const getSVGString = () => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        const contours = findContour();
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim;
        
        let pathData = '';
        contours.forEach((contour, contourId) => {
            if (contour.length === 0) return;
            pathData += `M ${contour[0].x1 * visualPixelWidth} ${contour[0].y1 * visualPixelHeight} `;
            
            contour.forEach((edge, i) => {
                const nextEdge = contour[(i + 1) % contour.length];
                const px = edge.x2 * visualPixelWidth;
                const py = edge.y2 * visualPixelHeight;
                const vertexX = edge.x2;
                const vertexY = edge.y2;
                let shouldRound = roundedCorners.has(`${contourId}-${i}`);
                if (bridgeMap.has(`${vertexX},${vertexY}`)) shouldRound = false;
                
                if (shouldRound && r > 0) {
                    const dx1 = edge.x2 - edge.x1;
                    const dy1 = edge.y2 - edge.y1;
                    const dx2 = nextEdge.x2 - nextEdge.x1;
                    const dy2 = nextEdge.y2 - nextEdge.y1;
                    
                    const maxR = Math.min(r, minDim * 0.5);

                    const backX = px - (dx1 !== 0 ? Math.sign(dx1) * maxR : 0);
                    const backY = py - (dy1 !== 0 ? Math.sign(dy1) * maxR : 0);
                    const fwdX = px + (dx2 !== 0 ? Math.sign(dx2) * maxR : 0);
                    const fwdY = py + (dy2 !== 0 ? Math.sign(dy2) * maxR : 0);

                    pathData += `L ${backX} ${backY} `;
                    // Q control point is the vertex (px, py), end point is fwd
                    pathData += `Q ${px} ${py} ${fwdX} ${fwdY} `;
                } else {
                    pathData += `L ${px} ${py} `;
                }
            });
            pathData += 'Z ';
        });

        if (bridges.length > 0 && r > 0) {
            bridges.forEach(b => {
                pathData += drawBridgeFillet(null, b, r, true);
            });
        }
        
        return `
<svg width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${displayWidth} ${displayHeight}" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="white"/>
<path d="${pathData}" fill="black" fill-rule="evenodd"/>
</svg>
`.trim();
    };

    const exportSVG = () => {
        const svgContent = getSVGString();
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName || 'smooth-pixels'}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const clearCanvas = () => {
        saveToHistory();
        setPixels(new Set());
        setRoundedCorners(new Set());
        setBridges([]);
        setBridgeMap(new Map());
        setLastActivePixel(null);
    };

    // UI helpers
    const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
    const brushScreenSizeW = brushSize * visualPixelWidth;
    const brushScreenSizeH = brushSize * visualPixelHeight;
    const brushCenterOffsetW = Math.floor(brushSize / 2) * visualPixelWidth;
    const brushCenterOffsetH = Math.floor(brushSize / 2) * visualPixelHeight;
    
    // Convert cursor grid pos back to screen pos for the div
    const cursorStyle = {
        width: `${brushScreenSizeW}px`, 
        height: `${brushScreenSizeH}px`,
        left: `${cursorX - brushCenterOffsetW}px`, 
        top: `${cursorY - brushCenterOffsetH}px`,
        
        // Updated Cursor Styling:
        borderColor: 'white',        // Sharp white border
        backgroundColor: 'transparent', // Transparent fill so you see underlying grid
        mixBlendMode: 'difference',   // Difference blend mode to invert colors (white on black, black on white)
        
        borderRadius: '2px', borderWidth: '1px', borderStyle: 'solid',
        transition: 'width 0.1s, height 0.1s',
    };

    return (
        <div className="flex flex-col lg:flex-row items-start justify-center gap-8 p-4 lg:p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
            <div className="flex flex-col items-center flex-none">
                <h1 className="text-3xl font-extrabold mb-2 tracking-tight text-center uppercase">Smooth Pixels 2.0</h1>
                <p className="text-sm text-gray-500 mb-6 text-center max-w-md">Shift+Click for Lines. Shift+Drag for Orthogonal.</p>
                <div className="flex flex-wrap items-center gap-2 mb-4 w-full max-w-[700px] justify-between">
                    <div className="flex gap-2">
                        <button onClick={handleUndo} disabled={history.length === 0} className="p-2 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-30 transition shadow-sm text-gray-900"><Undo2 size={18}/></button>
                        <button onClick={handleRedo} disabled={redoStack.length === 0} className="p-2 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-30 transition shadow-sm text-gray-900"><Redo2 size={18}/></button>
                    </div>
                    <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm">
                        <Settings size={14} className="text-gray-500 mr-1"/>
                        <input type="number" min="4" max="128" step="1" value={gridWidth} onChange={(e) => setGridWidth(Number(e.target.value))} className="bg-transparent w-8 text-sm font-bold outline-none text-gray-900 text-right" />
                        <span className="text-xs text-gray-400">x</span>
                        <input type="number" min="4" max="128" step="1" value={gridHeight} onChange={(e) => setGridHeight(Number(e.target.value))} className="bg-transparent w-8 text-sm font-bold outline-none text-gray-900 text-right" />
                        <span className="text-xs font-medium text-gray-500 ml-1">px</span>
                    </div>
                </div>

                {/* Outer Container:
                   - Fixed min-width/height equal to MAX_DISPLAY_SIZE (700) + Padding.
                */}
                <div 
                    className="flex items-center justify-center select-none" 
                    style={{ minWidth: `${MAX_DISPLAY_SIZE + 32}px`, minHeight: `${MAX_DISPLAY_SIZE + 32}px` }}
                >
                    {/* Inner Canvas Container:
                       - Fits the actual canvas size tightly.
                       - Has the border and shadow.
                    */}
                    <div className="relative shadow-xl border-3 border--100 overflow-hidden bg-white" style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}>
                        {isCursorVisible && <div className="absolute z-10 pointer-events-none transition-transform duration-50" style={cursorStyle} />}
                        <canvas
                            ref={canvasRef} 
                            // Removed 'cursor-none' so standard pointer is visible
                            className="block touch-none"
                            style={{ width: '100%', height: '100%' }}
                            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                            onPointerLeave={() => { setIsDrawing(false); setIsCursorVisible(false); }}
                            onPointerEnter={() => setIsCursorVisible(true)}
                        />
                    </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 font-medium">
                    {aspectRatio > 1 ? 'Wide Pixels' : aspectRatio < 1 ? 'Tall Pixels' : 'Square Pixels'} (Ratio: {aspectRatio.toFixed(2)})
                </div>
            </div>

            <div className="w-full max-w-sm flex flex-col gap-5 pt-2">
                
                {/* Tools Panel */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-lg">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Tools</h3>
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => setTool('brush')} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${tool === 'brush' ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><Brush size={16} /> Draw</button>
                        <button onClick={() => setTool('eraser')} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${tool === 'eraser' ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><Eraser size={16} /> Erase</button>
                    </div>
                    
                    <div className="mb-4 space-y-3">
                         <div>
                            <div className="flex justify-between items-center mb-1"><span className="text-xs font-medium text-gray-500">Brush Size</span><span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{brushSize}</span></div>
                            <input type="range" min="1" max="6" step="1" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Maximize size={10}/> Pixel Ratio</span>
                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{aspectRatio.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0.25" max="3" step="0.25" value={aspectRatio} onChange={(e) => setAspectRatio(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                        </div>
                    </div>

                    <button onClick={clearCanvas} className="w-full py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black transition flex items-center justify-center gap-2"><Trash2 size={16} /> Clear Canvas</button>
                </div>

                {/* Algorithm Panel */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-lg">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Smoothing</h3>
                    <div className="grid grid-cols-3 gap-2 mb-6">
                        {['random', 'outer', 'inner'].map(mode => (
                            <button key={mode} onClick={() => setCornerMode(mode)} className={`py-2 px-1 text-xs font-bold rounded-md border transition-all capitalize ${cornerMode === mode ? 'bg-black text-white border-black shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{mode === 'random' ? 'Mixed' : mode === 'outer' ? 'Convex' : 'Concave'}</button>
                        ))}
                    </div>
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-2"><span>Smoothness</span><span className="font-medium text-gray-900">{roundness.toFixed(2)}</span></div>
                            <input type="range" min="0" max="0.5" step="0.01" value={roundness} onChange={(e) => setRoundness(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                        </div>
                        <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-2"><span>Probability</span><span className="font-medium text-gray-900">{Math.round(roundedRatio * 100)}%</span></div>
                            <input type="range" min="0" max="1" step="0.05" value={roundedRatio} onChange={(e) => setRoundedRatio(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                        </div>
                        <button onClick={() => setSeed(Math.random())} className="w-full py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition flex items-center justify-center gap-2 text-sm font-medium"><RefreshCw size={16} /> Shuffle Corners</button>
                    </div>
                </div>

                {/* Export Panel */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-lg">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Export</h3>
                    <div className="flex gap-2">
                        <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-black focus:border-black outline-none" placeholder="filename" />
                        <button onClick={exportSVG} className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition flex items-center justify-center gap-2 text-sm font-semibold"><FileCode size={18} /> Download SVG</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PixelArtEditor;
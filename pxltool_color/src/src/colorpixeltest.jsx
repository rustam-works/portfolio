import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, RefreshCw, Undo2, Redo2, Settings, Brush, Eraser, FileCode, Maximize, Droplet, Plus } from 'lucide-react';

const PixelArtEditor = () => {
    const canvasRef = useRef(null);
    
    // --- State ---
    
    // Pixel Data: Map<"x,y", "hexColor">
    const [pixelMap, setPixelMap] = useState(new Map());
    
    // Tools
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState('brush'); // 'brush', 'eraser', 'eyedropper'
    const [brushSize, setBrushSize] = useState(1);
    
    // Colors
    const [currentColor, setCurrentColor] = useState('#000000');
    const [palette, setPalette] = useState(['#000000', '#FF3B30', '#4CD964', '#007AFF', '#FF9500', '#5856D6', '#FF2D55']);
    
    // Render Settings
    const [showGradient, setShowGradient] = useState(false);
    const [blendBg, setBlendBg] = useState(false); // New: Allow blending with white background
    const [showStroke, setShowStroke] = useState(false);
    
    // History
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Algorithm params
    const [roundness, setRoundness] = useState(0.4);
    const [roundedRatio, setRoundedRatio] = useState(0.7);
    const [roundedCorners, setRoundedCorners] = useState(new Set());
    const [cornerMode, setCornerMode] = useState('random');
    const [bridges, setBridges] = useState([]);
    const [bridgeMap, setBridgeMap] = useState(new Map());
    const [seed, setSeed] = useState(12345);

    // View & Settings
    const [aspectRatio, setAspectRatio] = useState(1);
    const [gridWidth, setGridWidth] = useState(32);
    const [gridHeight, setGridHeight] = useState(32);
    const [fileName, setFileName] = useState('smooth-pixels');

    // Interaction
    const [lastActivePixel, setLastActivePixel] = useState(null);
    const [strokeOrigin, setStrokeOrigin] = useState(null);
    const [cursorX, setCursorX] = useState(0);
    const [cursorY, setCursorY] = useState(0);
    const [isCursorVisible, setIsCursorVisible] = useState(false);

    // Constants
    const MAX_DISPLAY_SIZE = 700;
    const CANVAS_RESOLUTION_SCALE = 2;

    // --- Helpers ---

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
        const totalGridWidth = gridWidth * aspectRatio;
        const totalGridHeight = gridHeight;
        const scaleFactor = MAX_DISPLAY_SIZE / Math.max(totalGridWidth, totalGridHeight);
        const visualPixelWidth = scaleFactor * aspectRatio;
        const visualPixelHeight = scaleFactor;
        const displayWidth = Math.round(gridWidth * visualPixelWidth);
        const displayHeight = Math.round(gridHeight * visualPixelHeight);
        return { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight };
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
                            if (actionType === 'brush') {
                                next.set(key, currentColor);
                            } else if (actionType === 'eraser') {
                                next.delete(key);
                            }
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
            const last = history[history.length - 1];
            if (last.size === currentMap.size && last.size === 0) return;
        }
        setHistory(prev => [...prev, currentMap].slice(-50));
        setRedoStack([]);
    };

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        setRedoStack(s => [new Map(pixelMap), ...s]);
        setPixelMap(prev);
        setHistory(h => h.slice(0, -1));
    }, [history, pixelMap]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const next = redoStack[0];
        setHistory(h => [...h, new Map(pixelMap)]);
        setPixelMap(next);
        setRedoStack(s => s.slice(1));
    }, [redoStack, pixelMap]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                e.shiftKey ? handleRedo() : handleUndo();
            }
            if (e.key === 'b') setTool('brush');
            if (e.key === 'e') setTool('eraser');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleUndo, handleRedo]);

    // --- Geometry Logic ---

    const findContour = useCallback(() => {
        const edges = [];
        const hasPixel = (x, y) => pixelMap.has(`${x},${y}`);
        
        for (const key of pixelMap.keys()) {
            const [x, y] = key.split(',').map(Number);
            if (!hasPixel(x, y - 1)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, side: 'top' });
            if (!hasPixel(x + 1, y)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, side: 'right' });
            if (!hasPixel(x, y + 1)) edges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1, side: 'bottom' });
            if (!hasPixel(x - 1, y)) edges.push({ x1: x, y1: y + 1, x2: x, y2: y, side: 'left' });
        }
        
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
                    if (current.x2 === next.x1 && current.y2 === next.y1) {
                        contour.push(next);
                        used.add(j);
                        current = next;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
                if (current.x2 === contour[0].x1 && current.y2 === contour[0].y1) break;
            }
            if (contour.length > 2) contours.push(contour);
        }
        return contours;
    }, [pixelMap]);

    const getCornerType = (edge1, edge2) => {
        const cross = (edge1.x2 - edge1.x1) * (edge2.y2 - edge2.y1) - (edge1.y2 - edge1.y1) * (edge2.x2 - edge2.x1);
        return cross > 0 ? 'convex' : 'concave';
    };

    const pseudoRandom = (x, y, seed) => {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
        return n - Math.floor(n);
    };

    const regenerateRounding = useCallback(() => {
        const contours = findContour();
        const newCorners = new Set();
        
        contours.forEach((contour, cId) => {
            contour.forEach((edge, i) => {
                const next = contour[(i + 1) % contour.length];
                const type = getCornerType(edge, next);
                if (cornerMode === 'outer' && type !== 'convex') return;
                if (cornerMode === 'inner' && type !== 'concave') return;
                
                if (pseudoRandom(edge.x2, edge.y2, seed) < roundedRatio) {
                    newCorners.add(`${cId}-${i}`);
                }
            });
        });
        setRoundedCorners(newCorners);

        const newBridges = [];
        const newBridgeMap = new Map();
        if (cornerMode !== 'outer' && pixelMap.size > 0) {
            const has = (x, y) => pixelMap.has(`${x},${y}`);
            for (let X = 1; X < gridWidth; X++) {
                for (let Y = 1; Y < gridHeight; Y++) {
                    const tl = has(X-1, Y-1), tr = has(X, Y-1);
                    const bl = has(X-1, Y),   br = has(X, Y);
                    if (tl && br && !tr && !bl && pseudoRandom(X,Y,seed+1) < roundedRatio) {
                        newBridges.push({ X, Y, quadrant: 'TR_GAP_FILLET' });
                        newBridges.push({ X, Y, quadrant: 'BL_GAP_FILLET' });
                        newBridgeMap.set(`${X},${Y}`, true);
                    }
                    if (tr && bl && !tl && !br && pseudoRandom(X,Y,seed+2) < roundedRatio) {
                        newBridges.push({ X, Y, quadrant: 'BR_GAP_FILLET' });
                        newBridges.push({ X, Y, quadrant: 'TL_GAP_FILLET' });
                        newBridgeMap.set(`${X},${Y}`, true);
                    }
                }
            }
        }
        setBridges(newBridges);
        setBridgeMap(newBridgeMap);
    }, [findContour, cornerMode, roundedRatio, seed, pixelMap, gridWidth, gridHeight]);

    useEffect(() => {
        const t = setTimeout(regenerateRounding, 10);
        return () => clearTimeout(t);
    }, [pixelMap, roundedRatio, cornerMode, seed, regenerateRounding]);


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

        const isAltAction = e.metaKey || e.ctrlKey;
        const effectiveTool = isAltAction ? (tool === 'brush' ? 'eraser' : 'brush') : tool;
        
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
            if (dx > dy) y = strokeOrigin.y;
            else x = strokeOrigin.x;
        }

        setCursorX(x * visualPixelWidth);
        setCursorY(y * visualPixelHeight);

        if (!isDrawing) return;
        
        const isAltAction = e.metaKey || e.ctrlKey;
        const effectiveTool = isAltAction ? (tool === 'brush' ? 'eraser' : 'brush') : tool;
        if (effectiveTool === 'eyedropper') return;

        updatePixels([{ x, y }], effectiveTool);
        setLastActivePixel({ x, y });
    };

    // --- Drawing ---

    const drawBridge = (ctx, b, r, isSvg=false) => {
        const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
        const cx = b.X * visualPixelWidth, cy = b.Y * visualPixelHeight;
        const maxR = Math.min(r, Math.min(visualPixelWidth, visualPixelHeight) * 0.5);
        
        let sx, sy, ex, ey;
        if (b.quadrant === 'TR_GAP_FILLET') { sx=cx; sy=cy-maxR; ex=cx+maxR; ey=cy; }
        else if (b.quadrant === 'BL_GAP_FILLET') { sx=cx-maxR; sy=cy; ex=cx; ey=cy+maxR; }
        else if (b.quadrant === 'BR_GAP_FILLET') { sx=cx+maxR; sy=cy; ex=cx; ey=cy+maxR; }
        else if (b.quadrant === 'TL_GAP_FILLET') { sx=cx; sy=cy-maxR; ex=cx-maxR; ey=cy; }

        if (isSvg) return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey} L ${cx} ${cy} Z `;
        
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.lineTo(cx, cy);
        ctx.lineTo(sx, sy);
    };

    const drawScene = useCallback((ctx, isExport = false) => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        
        if (!isExport) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, displayWidth, displayHeight);
            
            ctx.beginPath();
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 0.5;
            for (let i=0; i<=gridWidth; i++) { ctx.moveTo(i*visualPixelWidth,0); ctx.lineTo(i*visualPixelWidth,displayHeight); }
            for (let i=0; i<=gridHeight; i++) { ctx.moveTo(0,i*visualPixelHeight); ctx.lineTo(displayWidth,i*visualPixelHeight); }
            ctx.stroke();
        }

        if (pixelMap.size === 0) return;

        // Construct the Blob Path
        const contours = findContour();
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim;
        
        // Save the Blob path for both clipping and stroking
        ctx.beginPath();
        contours.forEach((contour, cId) => {
            if (contour.length === 0) return;
            ctx.moveTo(contour[0].x1 * visualPixelWidth, contour[0].y1 * visualPixelHeight);
            
            contour.forEach((edge, i) => {
                const next = contour[(i+1)%contour.length];
                const px = edge.x2 * visualPixelWidth;
                const py = edge.y2 * visualPixelHeight;
                
                let shouldRound = roundedCorners.has(`${cId}-${i}`);
                if (bridgeMap.has(`${edge.x2},${edge.y2}`)) shouldRound = false;
                
                if (shouldRound && r > 0) {
                    const maxR = Math.min(r, minDim * 0.5);
                    const dx1 = edge.x2 - edge.x1, dy1 = edge.y2 - edge.y1;
                    const dx2 = next.x2 - next.x1, dy2 = next.y2 - next.y1;
                    const bx = px - (Math.sign(dx1)||0)*maxR;
                    const by = py - (Math.sign(dy1)||0)*maxR;
                    const fx = px + (Math.sign(dx2)||0)*maxR;
                    const fy = py + (Math.sign(dy2)||0)*maxR;
                    ctx.lineTo(bx, by);
                    ctx.arcTo(px, py, fx, fy, maxR);
                } else {
                    ctx.lineTo(px, py);
                }
            });
            ctx.closePath();
        });
        if (bridges.length > 0 && r > 0) {
            bridges.forEach(b => drawBridge(ctx, b, r * minDim));
        }

        // Fill Logic
        ctx.save();
        ctx.clip(); 
        
        const tempC = document.createElement('canvas');
        tempC.width = gridWidth;
        tempC.height = gridHeight;
        const tCtx = tempC.getContext('2d');
        
        // DILATION PASS: To prevent white edges when gradient is ON but BlendBg is OFF
        // We draw the pixel colors into their empty neighbors so the interpolation finds color instead of transparent
        if (showGradient && !blendBg) {
             pixelMap.forEach((color, key) => {
                const [x, y] = key.split(',').map(Number);
                // Draw 1px dilation into empty neighbors
                const neighbors = [[x+1,y], [x-1,y], [x,y+1], [x,y-1]];
                neighbors.forEach(([nx, ny]) => {
                    if (!pixelMap.has(`${nx},${ny}`)) {
                        tCtx.fillStyle = color;
                        tCtx.fillRect(nx, ny, 1, 1);
                    }
                });
            });
        }

        // Draw actual pixels
        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            tCtx.fillStyle = color;
            tCtx.fillRect(x, y, 1, 1);
        });

        ctx.imageSmoothingEnabled = showGradient;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(tempC, 0, 0, gridWidth, gridHeight, 0, 0, displayWidth, displayHeight);
        
        ctx.restore();

        if (showStroke) {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = isExport ? 1 : 2; 
            ctx.stroke();
        }

    }, [gridWidth, gridHeight, pixelMap, findContour, roundness, roundedCorners, bridges, bridgeMap, getDisplayMetrics, showGradient, blendBg, showStroke]);

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        const { displayWidth, displayHeight } = getDisplayMetrics();
        cvs.width = displayWidth * CANVAS_RESOLUTION_SCALE;
        cvs.height = displayHeight * CANVAS_RESOLUTION_SCALE;
        ctx.scale(CANVAS_RESOLUTION_SCALE, CANVAS_RESOLUTION_SCALE);
        drawScene(ctx, false);
    }, [drawScene, getDisplayMetrics]);

    // --- SVG Export ---
    const getSVGString = () => {
        const { visualPixelWidth, visualPixelHeight, displayWidth, displayHeight } = getDisplayMetrics();
        const contours = findContour();
        const minDim = Math.min(visualPixelWidth, visualPixelHeight);
        const r = roundness * minDim;
        
        let pathData = '';
        contours.forEach((contour, cId) => {
            if (contour.length === 0) return;
            pathData += `M ${contour[0].x1 * visualPixelWidth} ${contour[0].y1 * visualPixelHeight} `;
            contour.forEach((edge, i) => {
                const next = contour[(i+1)%contour.length];
                const px = edge.x2 * visualPixelWidth, py = edge.y2 * visualPixelHeight;
                let shouldRound = roundedCorners.has(`${cId}-${i}`);
                if (bridgeMap.has(`${edge.x2},${edge.y2}`)) shouldRound = false;
                
                if (shouldRound && r > 0) {
                    const maxR = Math.min(r, minDim * 0.5);
                    const dx1=edge.x2-edge.x1, dy1=edge.y2-edge.y1;
                    const dx2=next.x2-next.x1, dy2=next.y2-next.y1;
                    const bx = px-(Math.sign(dx1)||0)*maxR, by = py-(Math.sign(dy1)||0)*maxR;
                    const fx = px+(Math.sign(dx2)||0)*maxR, fy = py+(Math.sign(dy2)||0)*maxR;
                    pathData += `L ${bx} ${by} Q ${px} ${py} ${fx} ${fy} `;
                } else {
                    pathData += `L ${px} ${py} `;
                }
            });
            pathData += 'Z ';
        });
        if (bridges.length > 0 && r > 0) bridges.forEach(b => pathData += drawBridge(null, b, r, true));

        let pixelsSvg = '';
        pixelMap.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            pixelsSvg += `<rect x="${x * visualPixelWidth}" y="${y * visualPixelHeight}" width="${visualPixelWidth + 0.5}" height="${visualPixelHeight + 0.5}" fill="${color}" />`;
        });

        const strokeAttr = showStroke ? 'stroke="black" stroke-width="2"' : 'stroke="none"';

        return `
<svg width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${displayWidth} ${displayHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <path id="blob" d="${pathData}" />
    <clipPath id="blobClip"><use href="#blob" /></clipPath>
  </defs>
  <g clip-path="url(#blobClip)">
    ${pixelsSvg}
  </g>
  <use href="#blob" fill="none" ${strokeAttr} />
</svg>`.trim();
    };

    const exportSVG = () => {
        const blob = new Blob([getSVGString()], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const clearCanvas = () => {
        saveToHistory();
        setPixelMap(new Map());
        setRoundedCorners(new Set());
        setBridges([]);
        setBridgeMap(new Map());
    };

    // UI Helpers
    const { visualPixelWidth, visualPixelHeight } = getDisplayMetrics();
    const cursorStyle = {
        width: `${brushSize * visualPixelWidth}px`, height: `${brushSize * visualPixelHeight}px`,
        left: `${cursorX - (Math.floor(brushSize/2)*visualPixelWidth)}px`,
        top: `${cursorY - (Math.floor(brushSize/2)*visualPixelHeight)}px`,
        border: '1px solid white', boxShadow: '0 0 0 1px black',
        borderRadius: '2px', position: 'absolute', pointerEvents: 'none', zIndex: 10,
        backgroundColor: tool === 'eraser' ? 'rgba(255,255,255,0.3)' : currentColor,
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

                <div className="flex items-center justify-center select-none" style={{ minWidth: `${MAX_DISPLAY_SIZE + 32}px`, minHeight: `${MAX_DISPLAY_SIZE + 32}px` }}>
                    <div className="relative shadow-xl border-3 border-gray-100 overflow-hidden bg-white" style={{ width: getDisplayMetrics().displayWidth, height: getDisplayMetrics().displayHeight }}>
                        {isCursorVisible && <div style={cursorStyle} />}
                        <canvas ref={canvasRef} className="block touch-none" style={{ width: '100%', height: '100%' }}
                            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => setIsDrawing(false)}
                            onPointerLeave={() => { setIsDrawing(false); setIsCursorVisible(false); }} onPointerEnter={() => setIsCursorVisible(true)}
                        />
                    </div>
                </div>
            </div>

            <div className="w-full max-w-sm flex flex-col gap-5 pt-2">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-lg">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Tools</h3>
                    
                    {/* Improved Color Picker */}
                    <div className="mb-4">
                        <div className="flex items-center gap-3 mb-3">
                            {/* Big Color Trigger */}
                            <div className="relative w-12 h-12 rounded-xl border-2 border-gray-100 shadow-inner flex items-center justify-center overflow-hidden flex-none group">
                                <div className="absolute inset-0" style={{backgroundColor: currentColor}} />
                                <Plus size={20} className="text-white mix-blend-difference z-10 opacity-50 group-hover:opacity-100 transition"/>
                                <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer opacity-0" title="Choose Custom Color" />
                            </div>
                            
                            <div className="flex-1 grid grid-cols-4 gap-2">
                                {palette.map(c => (
                                    <button key={c} onClick={()=>setCurrentColor(c)} style={{backgroundColor: c}} className={`w-full h-8 rounded-lg border border-gray-100 transition hover:scale-105 ${currentColor === c ? 'ring-2 ring-black ring-offset-1' : ''}`}/>
                                ))}
                                <button onClick={()=>setTool('eyedropper')} className={`h-8 rounded-lg border flex items-center justify-center transition ${tool === 'eyedropper' ? 'bg-black text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`} title="Eyedropper"><Droplet size={16}/></button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wide cursor-pointer p-2 rounded hover:bg-gray-50 transition">
                                <span>Gradient Fill</span>
                                <div className={`w-8 h-4 rounded-full relative transition-colors ${showGradient ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                    <input type="checkbox" className="hidden" checked={showGradient} onChange={e=>setShowGradient(e.target.checked)}/>
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showGradient ? 'left-4.5' : 'left-0.5'}`} style={{left: showGradient ? '18px' : '2px'}}/>
                                </div>
                            </label>
                            
                            {showGradient && (
                                <label className="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wide cursor-pointer p-2 rounded hover:bg-gray-50 transition animate-in fade-in slide-in-from-top-1">
                                    <span>Blend with Canvas</span>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${blendBg ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                        <input type="checkbox" className="hidden" checked={blendBg} onChange={e=>setBlendBg(e.target.checked)}/>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform`} style={{left: blendBg ? '18px' : '2px'}}/>
                                    </div>
                                </label>
                            )}

                            <label className="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wide cursor-pointer p-2 rounded hover:bg-gray-50 transition">
                                <span>Show Stroke</span>
                                <div className={`w-8 h-4 rounded-full relative transition-colors ${showStroke ? 'bg-black' : 'bg-gray-300'}`}>
                                    <input type="checkbox" className="hidden" checked={showStroke} onChange={e=>setShowStroke(e.target.checked)}/>
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform`} style={{left: showStroke ? '18px' : '2px'}}/>
                                </div>
                            </label>
                        </div>
                    </div>

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
                            <div className="flex justify-between items-center mb-1"><span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Maximize size={10}/> Pixel Ratio</span><span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{aspectRatio.toFixed(2)}</span></div>
                            <input type="range" min="0.25" max="3" step="0.25" value={aspectRatio} onChange={(e) => setAspectRatio(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black" />
                        </div>
                    </div>
                    <button onClick={clearCanvas} className="w-full py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-black transition flex items-center justify-center gap-2"><Trash2 size={16} /> Clear Canvas</button>
                </div>

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
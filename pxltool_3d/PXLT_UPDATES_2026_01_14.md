# Pixeltool Update Log - 2026-01-14

## New Features

### 1. Advanced Selection System
- **Magic Wand (`W`)**: Selects contiguous clusters of pixels.
    - **Diagonal Support**: Now respects "bridges" between pixels. If a visual bridge exists (diagonal connection), the Magic Wand treats them as part of the same shape.
- **Rectangle Marquee (`M`)**: Standard box selection for selecting multiple pixels at once.
- **Selection Highlight**: Selected pixels are now framed with a blue highlight.

### 2. Move Tool
- **Drag-and-Drop**: Clicking and dragging inside any active selection moves the entire shape.
- **Live Preview**: The smooth contour moves in real-time with the pixels during the drag.
- **History Integration**: Movement is fully undoable/redoable.

### 3. Workflow Improvements
- **Shortcuts**:
    - `W`: Magic Wand
    - `M`: Marquee Select
    - `B`: Brush
    - `E`: Eraser
    - `V`: Wand (legacy/standard selection)
- **Pixel Overlap**: Implementation of working overlap (and gaps) for pixel connectivity was verified and backed up.

## Backup
- `PixelArtEditor_overlap.jsx`: Version with working overlap before adding selection features.
- `PixelArtEditor.jsx.bak2`: Sequential backup.

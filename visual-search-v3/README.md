# Visual Discovery Tool - Architecture & Documentation

## Overview
A client-side "visual discovery" engine designed to surface raw, technical, and marketplace-aesthetic images. It simulates the experience of browsing obscure hardware forums, AliExpress part lots, and vintage tool catalogs.

## Core Logic

### 1. Chaotic ID Generation
Instead of a standard "Search" button, the interface generates a random "File ID" for every batch. This mimics filename patterns found in digital camera dumps and inventory systems.

**Patterns Used:**
- `jj-912` (Industrial/Part Number)
- `29 cf` (Fragmented Lot)
- `a-815-20` (Catalog Number)
- `Z2039Z` (Serial)

### 2. Data Sources (The "Scraper")
Since browser-side scraping is restricted (CORS), we use a **RSS-via-Proxy** architecture.

**Primary Sources:**
1.  **Technical Forums** (via RSS + `allorigins` proxy):
    - **EEVBlog**: Electronics engineering.
    - **GarageJournal**: Tools and workshop equipment.
    - **PracticalMachinist**: CNC and machining.
    - **DIYAudio**: Audio equipment internals.
    - **PapawsWrench (Tool Talk)**: Vintage hand tools.
    - **HighVoltageForum**: High energy experiments.
    
    *Logic*: The script parses the RSS XML, extracts the HTML description, and hunts for `<a>` tags linking to `.jpg/png` (High-Res) or falls back to `<img>` tags, filtering out forum emojis/avatars.

2.  **Internet Archive** (via Advanced Search API):
    - **Catalogs**: Searches `subject:"Tool Catalog"`, `subject:"Parts Manual"`.
    - **Hardware**: Searches `subject:"industrial machinery"`, `subject:"test equipment"`, `subject:"spare parts"`.
    - *Note*: We specifically target the `mediatype:image` collection to retrieve "flat" scanned assets.

### 3. Streaming Rendering ("The Firehose")
To ensure speed, the application does **not** wait for all sources to respond.
- It fires requests to all selected forums and the Archive simultaneously.
- As soon as **any** source returns a batch of images, they are immediately rendered to the grid.
- This creates a "live feed" feel where images pop in as they are found.
- **Error Handling**: Images with 404s (common in hotlinked forums) have an `onerror` handler that self-destructs the DOM element, keeping the grid clean.

## Technical Aesthetics
- **Layout**: `100vh` fixed height with `overflow: hidden`. No scrolling. The content fills the screen exactly, creating a "dashboard" or "single page application" feel.
- **Typography**: Monospace/Technical fonts.
- **Interaction**: The central button acts as the "ignitor" for the next batch, cycling the ID.

## File Structure
- `visual-search/index.html`: Main entry point.
- `visual-search/app.js`: Contains all fetchers, parsers, and ID logic.
- `visual-search/style.css`: Grid layout and HUD styling.

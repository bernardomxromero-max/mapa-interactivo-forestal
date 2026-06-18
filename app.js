// Map Dashboard Application Logic

let map;
let markerCluster;
let allMarkers = {}; // Map feature ID to marker object
let filteredData = [];

// Base Layers
let baseLayers = {};

// Color palette for tree species
const speciesColors = {
    'pino': '#10b981',      // Emerald
    'ciprés': '#60a5fa',     // Blue
    'conacaste': '#f59e0b',   // Amber
    'laurel': '#f87171',     // Rose
    'cedro': '#a78bfa',      // Purple
    'teca': '#e2e8f0'        // White/Gray
};

const defaultColor = '#3b82f6';

function getSpeciesColor(speciesName) {
    if (!speciesName) return defaultColor;
    const name = speciesName.toLowerCase();
    for (const key in speciesColors) {
        if (name.includes(key)) {
            return speciesColors[key];
        }
    }
    return defaultColor;
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadFilters();
    applyFilters();
    setupEventListeners();
});

// Initialize Leaflet Map
function initMap() {
    // 1. Define Base Maps
    const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        maxZoom: 17
    });

    // 2. Initialize Map with default Dark Layer
    map = L.map('map', {
        zoomControl: false,
        layers: [darkLayer]
    }).setView([13.75, -88.2], 10);

    // Zoom control top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // 3. Set Base Map Control (Base Maps Selector)
    baseLayers = {
        "Modo Oscuro": darkLayer,
        "Mapa de Calles (OSM)": osmLayer,
        "Satélite": satelliteLayer,
        "Topográfico": topoLayer
    };
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

    // 4. Scale Control (Escala Gráfica)
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    // 5. Marker Cluster Group
    markerCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 15
    }).addTo(map);

    // 6. Coordinates Control (Coordenadas del Cursor)
    const CoordsControl = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd: function() {
            const container = L.DomUtil.create('div', 'cursor-coordinates-control');
            container.innerHTML = 'Lat: <span id="cursor-lat">-</span> | Lon: <span id="cursor-lon">-</span>';
            return container;
        }
    });
    new CoordsControl().addTo(map);

    map.on('mousemove', (e) => {
        document.getElementById('cursor-lat').textContent = e.latlng.lat.toFixed(5);
        document.getElementById('cursor-lon').textContent = e.latlng.lng.toFixed(5);
    });

    // 7. Measurement Tools (Leaflet-Geoman)
    map.pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: true,
        drawPolygon: true,
        drawRectangle: false,
        drawCircle: false,
        drawText: false,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: true
    });

    // Enable measurements in metric units
    map.pm.setGlobalOptions({
        measurements: {
            showMeasurements: true,
            measurementUnit: 'metric' // m/km and m²/hectares
        }
    });

    // Translate Geoman texts to Spanish
    map.pm.setLang('es');
}

// Load filter options dynamically from forestData
function loadFilters() {
    const depts = new Set();
    const munis = new Set();
    const species = new Set();
    const tecnicos = new Set();

    forestData.features.forEach(f => {
        const p = f.properties;
        if (p.Departamento) depts.add(p.Departamento);
        if (p.Municipio) munis.add(p.Municipio);
        if (p.Especie) species.add(p.Especie);
        if (p.Tecnico) tecnicos.add(p.Tecnico);
    });

    populateSelect('filter-dept', depts);
    populateSelect('filter-muni', munis);
    populateSelect('filter-species', species);
    populateSelect('filter-tecnico', tecnicos);
}

function populateSelect(selectId, setValues) {
    const select = document.getElementById(selectId);
    const sortedVals = Array.from(setValues).sort((a, b) => String(a).localeCompare(String(b)));
    
    sortedVals.forEach(val => {
        if (val) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            select.appendChild(opt);
        }
    });
}

// Set up filter and action change events
function setupEventListeners() {
    // Base dropdowns and text search
    const standardFilters = ['filter-dept', 'filter-muni', 'filter-species', 'filter-tecnico'];
    standardFilters.forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
    });
    document.getElementById('search-owner').addEventListener('input', applyFilters);

    // Advanced filters
    const advancedFilters = [
        'filter-date-start', 'filter-date-end',
        'filter-trees-min', 'filter-trees-max',
        'filter-volume-min', 'filter-volume-max'
    ];
    advancedFilters.forEach(id => {
        document.getElementById(id).addEventListener('change', applyFilters);
        document.getElementById(id).addEventListener('input', applyFilters);
    });

    // Action buttons
    document.getElementById('btn-export').addEventListener('click', exportToCSV);
    document.getElementById('btn-print').addEventListener('click', () => {
        window.print();
    });
}

// Filter data and update map & sidebar
function applyFilters() {
    const searchVal = document.getElementById('search-owner').value.toLowerCase().trim();
    const deptVal = document.getElementById('filter-dept').value;
    const muniVal = document.getElementById('filter-muni').value;
    const speciesVal = document.getElementById('filter-species').value;
    const tecnicoVal = document.getElementById('filter-tecnico').value;

    // Advanced filter values
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    const treesMin = parseInt(document.getElementById('filter-trees-min').value);
    const treesMax = parseInt(document.getElementById('filter-trees-max').value);
    const volumeMin = parseFloat(document.getElementById('filter-volume-min').value);
    const volumeMax = parseFloat(document.getElementById('filter-volume-max').value);

    filteredData = forestData.features.filter(f => {
        const p = f.properties;
        
        // 1. Text Search filter
        const matchSearch = !searchVal || 
            (p.Propietario && p.Propietario.toLowerCase().includes(searchVal)) ||
            (p.Expediente && p.Expediente.toLowerCase().includes(searchVal)) ||
            (p.Canton && p.Canton.toLowerCase().includes(searchVal));
            
        // 2. Dropdown filters
        const matchDept = !deptVal || p.Departamento === deptVal;
        const matchMuni = !muniVal || p.Municipio === muniVal;
        const matchSpecies = !speciesVal || p.Especie === speciesVal;
        const matchTecnico = !tecnicoVal || p.Tecnico === tecnicoVal;

        // 3. Date Range filter (Fecha_Emision)
        let matchDate = true;
        if (dateStart || dateEnd) {
            if (p.Fecha_Emision) {
                const emisionDate = p.Fecha_Emision; // yyyy-mm-dd format
                if (dateStart && emisionDate < dateStart) matchDate = false;
                if (dateEnd && emisionDate > dateEnd) matchDate = false;
            } else {
                matchDate = false; // Exclude records without date if range is active
            }
        }

        // 4. Trees Authorized Range filter
        let matchTrees = true;
        const trees = parseInt(p.Arboles_Autorizados) || 0;
        if (!isNaN(treesMin) && trees < treesMin) matchTrees = false;
        if (!isNaN(treesMax) && trees > treesMax) matchTrees = false;

        // 5. Volume Range filter
        let matchVolume = true;
        const volume = parseFloat(p.Volumen_Total_m3) || 0;
        if (!isNaN(volumeMin) && volume < volumeMin) matchVolume = false;
        if (!isNaN(volumeMax) && volume > volumeMax) matchVolume = false;

        return matchSearch && matchDept && matchMuni && matchSpecies && matchTecnico && matchDate && matchTrees && matchVolume;
    });

    updateStats();
    renderMapMarkers();
    renderSidebarList();
}

// Update the 4 statistics cards
function updateStats() {
    const totalRecords = filteredData.length;
    let totalTrees = 0;
    let totalVol = 0;
    const speciesCounts = {};

    filteredData.forEach(f => {
        const p = f.properties;
        const trees = parseInt(p.Arboles_Autorizados) || 0;
        const vol = parseFloat(p.Volumen_Total_m3) || 0;
        
        totalTrees += trees;
        totalVol += vol;

        if (p.Especie) {
            speciesCounts[p.Especie] = (speciesCounts[p.Especie] || 0) + 1;
        }
    });

    // Find top species
    let topSpecies = 'N/A';
    let maxCount = 0;
    for (const sp in speciesCounts) {
        if (speciesCounts[sp] > maxCount) {
            maxCount = speciesCounts[sp];
            topSpecies = sp;
        }
    }

    document.getElementById('stat-records').textContent = totalRecords;
    document.getElementById('stat-trees').textContent = totalTrees.toLocaleString();
    document.getElementById('stat-volume').textContent = totalVol.toFixed(2) + ' m³';
    document.getElementById('stat-top-species').textContent = topSpecies;
    document.getElementById('stat-top-species-sub').textContent = topSpecies !== 'N/A' ? `${maxCount} expedientes` : '-';
    document.getElementById('record-counter').textContent = `${totalRecords} registros`;
}

// Render map markers inside Marker Cluster Group
function renderMapMarkers() {
    markerCluster.clearLayers();
    allMarkers = {};

    const bounds = [];

    filteredData.forEach(f => {
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const p = f.properties;
        const id = p.Expediente + '_' + p.N_registro;

        // Custom circle marker styling
        const trees = parseInt(p.Arboles_Autorizados) || 1;
        const radius = Math.max(6, Math.min(22, Math.sqrt(trees) * 2.5));
        const color = getSpeciesColor(p.Especie);

        const marker = L.circleMarker([lat, lon], {
            radius: radius,
            fillColor: color,
            color: '#ffffff',
            weight: 1.5,
            opacity: 0.9,
            fillOpacity: 0.75
        });

        // Popup HTML structure
        const popupHtml = `
            <div class="popup-container">
                <div class="popup-header">
                    <div class="popup-title">${p.Propietario || 'Sin Propietario'}</div>
                    <div class="popup-subtitle">Expediente: ${p.Expediente || 'N/A'}</div>
                </div>
                <div class="popup-grid">
                    <div class="popup-grid-item">
                        <span class="popup-label">Departamento</span>
                        <span class="popup-value">${p.Departamento || 'N/A'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Municipio</span>
                        <span class="popup-value">${p.Municipio || 'N/A'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Cantón</span>
                        <span class="popup-value">${p.Canton || 'N/A'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Especie</span>
                        <span class="popup-value" style="color: ${color}; font-weight:600;">${p.Especie || 'N/A'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Árboles Aut.</span>
                        <span class="popup-value">${p.Arboles_Autorizados || 0}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Volumen Total</span>
                        <span class="popup-value">${p.Volumen_Total_m3 ? p.Volumen_Total_m3 + ' m³' : '0 m³'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Técnico</span>
                        <span class="popup-value">${p.Tecnico || 'N/A'}</span>
                    </div>
                    <div class="popup-grid-item">
                        <span class="popup-label">Emisión</span>
                        <span class="popup-value">${p.Fecha_Emision || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;

        marker.bindPopup(popupHtml);
        marker.bindTooltip(`${p.Propietario || 'Propietario'}<br><b>${p.Especie}</b> (${p.Arboles_Autorizados} árboles)`);

        marker.on('click', () => {
            highlightSidebarCard(id);
        });

        markerCluster.addLayer(marker);
        allMarkers[id] = marker;
        bounds.push([lat, lon]);
    });

    // Zoom map to fit filtered markers
    if (bounds.length > 0 && map) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
}

// Render the sidebar records list
function renderSidebarList() {
    const listContainer = document.getElementById('record-list');
    listContainer.innerHTML = '';

    if (filteredData.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 10px; font-size: 13px;">
                Ningún registro coincide con los filtros aplicados.
            </div>
        `;
        return;
    }

    filteredData.forEach(f => {
        const p = f.properties;
        const id = p.Expediente + '_' + p.N_registro;
        const color = getSpeciesColor(p.Especie);

        const card = document.createElement('div');
        card.className = 'record-card';
        card.setAttribute('data-id', id);
        
        card.innerHTML = `
            <div class="card-header-row">
                <span class="expediente-id">${p.Expediente || 'S/E'}</span>
                <span class="location-tag">${p.Municipio || ''}, ${p.Departamento || ''}</span>
            </div>
            <div class="owner-name" title="${p.Propietario}">${p.Propietario || 'Sin Propietario'}</div>
            <div class="card-details">
                <div class="detail-item">
                    <span class="detail-icon" style="color: ${color};">●</span>
                    <span style="font-weight: 500;">${p.Especie || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-icon">🌳</span>
                    <span>${p.Arboles_Autorizados || 0} aut.</span>
                </div>
                <div class="detail-item">
                    <span class="detail-icon">📐</span>
                    <span>${p.m2 ? p.m2 + ' m²' : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-icon">🪵</span>
                    <span>${p.Volumen_Total_m3 ? p.Volumen_Total_m3 + ' m³' : '0 m³'}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.record-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const marker = allMarkers[id];
            if (marker) {
                const latLng = marker.getLatLng();
                map.flyTo(latLng, 15, {
                    animate: true,
                    duration: 1.2
                });
                
                setTimeout(() => {
                    markerCluster.zoomToShowLayer(marker, () => {
                        marker.openPopup();
                    });
                }, 1200);
            }
        });

        listContainer.appendChild(card);
    });
}

// Highlight the sidebar card when map marker is clicked
function highlightSidebarCard(id) {
    document.querySelectorAll('.record-card').forEach(c => c.classList.remove('active'));
    
    const card = document.querySelector(`.record-card[data-id="${id}"]`);
    if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Export currently filtered data to Excel-compatible UTF-8 BOM CSV
function exportToCSV() {
    if (filteredData.length === 0) {
        alert('No hay registros filtrados para exportar.');
        return;
    }

    // CSV headers matching properties
    const headers = [
        'Expediente',
        'Región',
        'Departamento',
        'Municipio',
        'Cantón',
        'Propietario',
        'Técnico',
        'Objetivo',
        'Especie',
        'Árboles Autorizados',
        'Volumen Total (m3)',
        'Área (m2)',
        'Fecha Emisión',
        'Longitud Decimal',
        'Latitud Decimal'
    ];

    const rows = filteredData.map(f => {
        const p = f.properties;
        const coords = f.geometry.coordinates;
        return [
            p.Expediente || '',
            p.Region || '',
            p.Departamento || '',
            p.Municipio || '',
            p.Canton || '',
            p.Propietario || '',
            p.Tecnico || '',
            p.Objetivo || '',
            p.Especie || '',
            p.Arboles_Autorizados || '0',
            p.Volumen_Total_m3 || '0',
            p.m2 || '',
            p.Fecha_Emision || '',
            coords[0], // Lon
            coords[1]  // Lat
        ];
    });

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(val => {
            const cleanVal = String(val).replace(/"/g, '""');
            return cleanVal.includes(',') || cleanVal.includes('\n') || cleanVal.includes('"') 
                ? `"${cleanVal}"` 
                : cleanVal;
        }).join(','))
    ].join('\r\n');

    // Create CSV Blob with UTF-8 BOM (\uFEFF) so Excel opens accents correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'expedientes_forestales_filtrados.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

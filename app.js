// Map Dashboard Application Logic - El Salvador 2025

let map;
let markerCluster;
let kmzLayer;
let allMarkers = {}; // Map feature ID to marker object
let filteredData = [];

// Base Layers
let baseLayers = {};
let overlayLayers = {};

// Color palette for tree species
const speciesColors = {
    'conacaste': '#f59e0b',   // Amber
    'cedro': '#8b5cf6',      // Purple
    'laurel': '#ef4444',     // Red / Rose
    'mango': '#f97316',      // Orange
    'maquilishuat': '#ec4899',// Pink
    'pino': '#059669',      // Emerald
    'ciprés': '#06b6d4',     // Cyan
    'volador': '#84cc16',    // Lime
    'ceiba': '#14b8a6',      // Teal
    'cortez': '#eab308',     // Yellow
    'teca': '#64748b',       // Slate
    'aceituno': '#0284c7'    // Sky
};

const defaultColor = '#2563eb'; // Bright Blue default

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
    // 1. Define Base Maps (OSM layer removed)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        maxZoom: 17
    });

    // 2. Define El Salvador KMZ Boundary Overlay Layer (from El Salvador.kmz)
    kmzLayer = L.geoJSON(typeof elSalvadorKmzData !== 'undefined' ? elSalvadorKmzData : null, {
        style: {
            color: '#10b981',        // Emerald green border stroke
            weight: 2.8,
            opacity: 0.95,
            fillColor: '#10b981',
            fillOpacity: 0.05
        },
        onEachFeature: function(feature, layer) {
            const props = feature.properties || {};
            const title = props.name || 'El Salvador';
            layer.bindTooltip(`<b>${title}</b> (Límite Oficial KMZ)`, { sticky: true });
        }
    });

    // 3. Initialize Map with default Satellite map and KMZ Boundary layer
    map = L.map('map', {
        zoomControl: false,
        layers: [satelliteLayer, kmzLayer]
    }).setView([13.78, -88.8], 9);

    // Zoom control top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // 4. Base Maps & Overlays Control
    baseLayers = {
        "Satélite (Esri)": satelliteLayer,
        "Topográfico": topoLayer
    };

    overlayLayers = {
        "🇸🇻 Límite El Salvador (KMZ)": kmzLayer
    };

    L.control.layers(baseLayers, overlayLayers, { position: 'topright', collapsed: false }).addTo(map);

    // 5. Scale Control (Escala Gráfica)
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    // 6. Marker Cluster Group
    markerCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 15
    }).addTo(map);

    // 7. Coordinates Control (Coordenadas del Cursor)
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

    // 8. Measurement Tools (Leaflet-Geoman)
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

    map.pm.setGlobalOptions({
        measurements: {
            showMeasurements: true,
            measurementUnit: 'metric'
        }
    });

    map.pm.setLang('es');
}

// Load filter options dynamically from forestData
function loadFilters() {
    const regions = new Set(['I', 'II', 'III', 'IV']);
    const depts = new Set();
    const munis = new Set();
    const species = new Set();
    const tecnicos = new Set();

    forestData.features.forEach(f => {
        const p = f.properties;
        if (p.Region) regions.add(p.Region);
        if (p.Departamento) depts.add(p.Departamento);
        if (p.Municipio) munis.add(p.Municipio);
        if (p.Especie) species.add(p.Especie);
        if (p.Tecnico) tecnicos.add(p.Tecnico);
    });

    populateSelect('filter-region', regions);
    populateSelect('filter-dept', depts);
    populateSelect('filter-muni', munis);
    populateSelect('filter-species', species);
    populateSelect('filter-tecnico', tecnicos);
}

function populateSelect(selectId, setValues) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    let sortedVals = Array.from(setValues);
    if (selectId === 'filter-region') {
        const order = {'I': 1, 'II': 2, 'III': 3, 'IV': 4};
        sortedVals.sort((a, b) => (order[a] || 99) - (order[b] || 99));
    } else {
        sortedVals.sort((a, b) => String(a).localeCompare(String(b)));
    }

    sortedVals.forEach(val => {
        if (val) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = selectId === 'filter-region' ? `Región ${val}` : val;
            select.appendChild(opt);
        }
    });
}

// Set up filter and action change events
function setupEventListeners() {
    const standardFilters = ['filter-region', 'filter-dept', 'filter-muni', 'filter-species', 'filter-tecnico'];
    standardFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });
    document.getElementById('search-owner').addEventListener('input', applyFilters);

    const advancedFilters = [
        'filter-date-start', 'filter-date-end',
        'filter-trees-min', 'filter-trees-max',
        'filter-volume-min', 'filter-volume-max'
    ];
    advancedFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', applyFilters);
            el.addEventListener('input', applyFilters);
        }
    });

    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) exportBtn.addEventListener('click', exportToCSV);

    const exportMapBtn = document.getElementById('btn-export-map');
    if (exportMapBtn) exportMapBtn.addEventListener('click', exportMapImage);

    const printBtn = document.getElementById('btn-print');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (map) map.invalidateSize();
            setTimeout(() => {
                window.print();
            }, 150);
        });
    }
}

// Filter data and update map & sidebar
function applyFilters() {
    const searchVal = document.getElementById('search-owner').value.toLowerCase().trim();
    const regionVal = document.getElementById('filter-region') ? document.getElementById('filter-region').value : '';
    const deptVal = document.getElementById('filter-dept').value;
    const muniVal = document.getElementById('filter-muni').value;
    const speciesVal = document.getElementById('filter-species').value;
    const tecnicoVal = document.getElementById('filter-tecnico').value;

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
            (p.Canton && p.Canton.toLowerCase().includes(searchVal)) ||
            (p.Municipio && p.Municipio.toLowerCase().includes(searchVal));
            
        // 2. Dropdown filters
        const matchRegion = !regionVal || p.Region === regionVal;
        const matchDept = !deptVal || p.Departamento === deptVal;
        const matchMuni = !muniVal || p.Municipio === muniVal;
        const matchSpecies = !speciesVal || p.Especie === speciesVal;
        const matchTecnico = !tecnicoVal || p.Tecnico === tecnicoVal;

        // 3. Date Range filter (Fecha_Emision)
        let matchDate = true;
        if (dateStart || dateEnd) {
            if (p.Fecha_Emision) {
                const emisionDate = p.Fecha_Emision;
                if (dateStart && emisionDate < dateStart) matchDate = false;
                if (dateEnd && emisionDate > dateEnd) matchDate = false;
            } else {
                matchDate = false;
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

        return matchSearch && matchRegion && matchDept && matchMuni && matchSpecies && matchTecnico && matchDate && matchTrees && matchVolume;
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

    let topSpecies = 'N/A';
    let maxCount = 0;
    for (const sp in speciesCounts) {
        if (speciesCounts[sp] > maxCount) {
            maxCount = speciesCounts[sp];
            topSpecies = sp;
        }
    }

    document.getElementById('stat-records').textContent = totalRecords.toLocaleString();
    document.getElementById('stat-trees').textContent = totalTrees.toLocaleString();
    document.getElementById('stat-volume').textContent = totalVol.toFixed(2) + ' m³';
    document.getElementById('stat-top-species').textContent = topSpecies;
    document.getElementById('stat-top-species-sub').textContent = topSpecies !== 'N/A' ? `${maxCount} registros` : '-';
    document.getElementById('record-counter').textContent = `${totalRecords.toLocaleString()} registros`;
}

// Render map markers inside Marker Cluster Group
function renderMapMarkers() {
    markerCluster.clearLayers();
    allMarkers = {};

    const bounds = [];

    filteredData.forEach((f, index) => {
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const p = f.properties;
        const id = (p.Expediente || 'EXP') + '_' + index;

        const trees = parseInt(p.Arboles_Autorizados) || 1;
        const radius = Math.max(5, Math.min(20, Math.sqrt(trees) * 2.2));
        const color = getSpeciesColor(p.Especie);

        const marker = L.circleMarker([lat, lon], {
            radius: radius,
            fillColor: color,
            color: '#ffffff',
            weight: 1.2,
            opacity: 0.9,
            fillOpacity: 0.8
        });

        const popupHtml = `
            <div class="popup-container">
                <div class="popup-header">
                    <div class="popup-title">${p.Propietario || 'Sin Propietario'}</div>
                    <div class="popup-subtitle">Expediente: ${p.Expediente || 'N/A'} | Región ${p.Region || ''}</div>
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

    if (bounds.length > 0 && map) {
        if (bounds.length > 2000) {
            map.setView([13.78, -88.8], 9);
        } else {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
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

    const MAX_SIDEBAR_ITEMS = 300;
    const displayData = filteredData.slice(0, MAX_SIDEBAR_ITEMS);

    displayData.forEach((f, index) => {
        const p = f.properties;
        const id = (p.Expediente || 'EXP') + '_' + index;
        const color = getSpeciesColor(p.Especie);

        const card = document.createElement('div');
        card.className = 'record-card';
        card.setAttribute('data-id', id);
        
        card.innerHTML = `
            <div class="card-header-row">
                <span class="expediente-id">${p.Expediente || 'S/E'} (Reg. ${p.Region || ''})</span>
                <span class="location-tag">${p.Municipio || ''}, ${p.Departamento || ''}</span>
            </div>
            <div class="owner-name" title="${p.Propietario}">${p.Propietario || 'Sin Propietario'}</div>
            <div class="card-details">
                <div class="detail-item">
                    <span class="detail-icon" style="color: ${color};">●</span>
                    <span style="font-weight: 600;">${p.Especie || 'N/A'}</span>
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

    if (filteredData.length > MAX_SIDEBAR_ITEMS) {
        const footerInfo = document.createElement('div');
        footerInfo.style.cssText = 'text-align: center; color: var(--text-muted); padding: 12px; font-size: 11px; border-top: 1px dashed var(--border-color);';
        footerInfo.textContent = `Mostrando los primeros ${MAX_SIDEBAR_ITEMS} de ${filteredData.length.toLocaleString()} expedientes. Refine la búsqueda o aplique filtros.`;
        listContainer.appendChild(footerInfo);
    }
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

    const headers = [
        'Expediente',
        'Región',
        'Departamento',
        'Municipio',
        'Distrito',
        'Cantón',
        'Propietario',
        'No_DUI',
        'Técnico',
        'Agencia',
        'Objetivo',
        'Uso del Suelo',
        'Clase Agrológica',
        'Especie',
        'Árboles Solicitados',
        'Árboles Denegados',
        'Árboles Autorizados',
        'Volumen Fuste (m3)',
        'Volumen Rama (m3)',
        'Volumen Leña (m3)',
        'Volumen Total (m3)',
        'Área (Has)',
        'Área (m2)',
        'Fecha Solicitud',
        'Fecha Inspección',
        'Fecha Informe',
        'Fecha Emisión',
        'Fecha Retiro',
        'Vigencia Días',
        'Tipo Documento',
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
            p.Distrito || '',
            p.Canton || '',
            p.Propietario || '',
            p.No_DUI || '',
            p.Tecnico || '',
            p.Agencia || '',
            p.Objetivo || '',
            p.Uso_Suelo || '',
            p.Clase_Agrologica || '',
            p.Especie || '',
            p.Arboles_Solicitados || '0',
            p.Arboles_Denegados || '0',
            p.Arboles_Autorizados || '0',
            p.Volumen_Fuste_m3 || '0',
            p.Volumen_Rama_m3 || '0',
            p.Volumen_Lena_m3 || '0',
            p.Volumen_Total_m3 || '0',
            p.Area_Has || '0',
            p.m2 || '0',
            p.Fecha_Solicitud || '',
            p.Fecha_Inspeccion || '',
            p.Fecha_Informe || '',
            p.Fecha_Emision || '',
            p.Fecha_Retiro || '',
            p.Vigencia_Dias || '30',
            p.Tipo_Documento || '',
            coords[0],
            coords[1]
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(val => {
            const cleanVal = String(val).replace(/"/g, '""');
            return cleanVal.includes(',') || cleanVal.includes('\n') || cleanVal.includes('"') 
                ? `"${cleanVal}"` 
                : cleanVal;
        }).join(','))
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'aprovechamientos_forestales_2025_filtrados.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export Map as PNG Image excluding the left sidebar
async function exportMapImage() {
    const btn = document.getElementById('btn-export-map');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<span>⏳ Exportando...</span>';
        btn.disabled = true;
    }

    try {
        const mapWrapper = document.querySelector('.map-wrapper');
        if (map) map.invalidateSize();

        if (typeof html2canvas !== 'undefined') {
            const canvas = await html2canvas(mapWrapper, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: 2
            });

            const imageURI = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = 'mapa_forestal_el_salvador_2025.png';
            link.href = imageURI;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            window.print();
        }
    } catch (err) {
        console.error('Error al exportar la imagen del mapa:', err);
        window.print();
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

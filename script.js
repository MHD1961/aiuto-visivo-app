// 🔧 Firebase Configuration - Auto-configured, no manual input needed
const firebaseConfig = {
    apiKey: "AIzaSyBNpH-sN_Vm_4OhcEoHwxd5nPEYaWXg3ps",
    authDomain: "aiuto-visivo-v2.firebaseapp.com",
    projectId: "aiuto-visivo-v2",
    storageBucket: "aiuto-visivo-v2.firebasestorage.app",
    messagingSenderId: "358903320115",
    appId: "1:358903320115:web:91bdce0a359f2657761d46"
};

// Global Variables
let db = null;
let savedPlaces = [];
let isChildMode = false;
let currentNavigationInterval = null;
let voiceSupported = false;
let currentVolume = 0.8;
let speechRate = 1.0;
let emergencyNumber = '+39 112';
let gpsAccuracy = 0;
let totalNavigations = 0;

// Speech Synthesis
const synth = window.speechSynthesis;

// Initialize on Load - 🔧 AUTO-FIREBASE CONFIG
window.addEventListener('load', async () => {
    try {
        // Auto-initialize Firebase - NO MANUAL CONFIG NEEDED
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // Update UI immediately
        updateConnectionStatus(true);
        hideConfigSection();
        
        // Load saved data
        await loadPlaces();
        loadSettings();
        initializeGPS();
        
        // Initialize voice
        initializeVoice();
        
        // Welcome message
        speak('Benvenuto in Aiuto Visivo. Sistema dell\'Ingegnere Maher Madany pronto per l\'uso. Precisione GPS migliorata.', false);
        
        // Check if places exist, if not add defaults
        if (savedPlaces.length === 0) {
            setTimeout(() => {
                speak('Aggiungo i luoghi base per iniziare', false);
                addDefaultPlaces();
            }, 3000);
        }
        
        // Update statistics
        updateStatistics();
        
    } catch (error) {
        console.error('Firebase initialization error:', error);
        updateConnectionStatus(false);
        speak('Errore di sistema. Alcune funzioni potrebbero non funzionare correttamente.', true);
    }
});

// =================== UI MANAGEMENT ===================

function hideConfigSection() {
    // No more manual config needed - hide config section
    const configSection = document.getElementById('configSection');
    if (configSection) {
        configSection.style.display = 'none';
    }
    
    // Show main sections
    document.getElementById('addPlaceSection').style.display = 'block';
    document.getElementById('placesSection').style.display = 'block';
    document.getElementById('settingsSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (connected) {
        statusElement.className = 'connection-status status-connected';
        statusElement.innerHTML = '🟢 Sistema Pronto - Firebase Auto-Configurato';
    } else {
        statusElement.className = 'connection-status status-disconnected';
        statusElement.innerHTML = '🔴 Errore di Connessione';
    }
}

function showLoadingOverlay(show, message = 'Caricamento...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    
    if (show) {
        loadingText.textContent = message;
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

function showStatus(message, type = 'info', duration = 5000) {
    const status = document.getElementById('statusMessage');
    status.textContent = message;
    status.className = `status show ${type}`;
    
    setTimeout(() => {
        status.classList.remove('show');
    }, duration);
}

// =================== LOCATION FUNCTIONS - 🔧 FIXED ===================

// 🔧 FIX 1: Improved GPS accuracy with detailed address
function whereAmI() {
    showLoadingOverlay(true, 'Rilevamento posizione precisa...');
    speak('Sto cercando dove ti trovi con precisione migliorata', true);
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000  // Reduced for better accuracy
    };
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = Math.round(position.coords.accuracy);
            
            // Update GPS accuracy
            updateGPSStatus(accuracy);
            
            // Save location to history
            saveLocationToHistory(lat, lng, accuracy);
            
            // Get detailed address
            getDetailedAddress(lat, lng, accuracy);
            
            showLoadingOverlay(false);
        },
        error => {
            showLoadingOverlay(false);
            handleLocationError(error);
        },
        options
    );
}

// 🔧 NEW: Enhanced address detection with multiple fallbacks
function getDetailedAddress(lat, lng, accuracy) {
    // Try Nominatim with maximum detail first
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=20&addressdetails=1&accept-language=it`)
        .then(response => response.json())
        .then(data => {
            let address = "Ti trovi ";
            let hasDetails = false;
            
            if (data.address) {
                // Build detailed address step by step
                if (data.address.house_number && data.address.road) {
                    address += `in ${data.address.road} numero ${data.address.house_number}`;
                    hasDetails = true;
                } else if (data.address.road) {
                    address += `in ${data.address.road}`;
                    hasDetails = true;
                } else if (data.address.neighbourhood) {
                    address += `nel quartiere ${data.address.neighbourhood}`;
                    hasDetails = true;
                } else if (data.address.suburb) {
                    address += `nella zona di ${data.address.suburb}`;
                    hasDetails = true;
                }
                
                // Add city/town
                if (data.address.city || data.address.town || data.address.village) {
                    const locality = data.address.city || data.address.town || data.address.village;
                    if (hasDetails) {
                        address += `, ${locality}`;
                    } else {
                        address += `a ${locality}`;
                        hasDetails = true;
                    }
                }
                
                // Add accuracy information
                if (accuracy <= 5) {
                    address += `. Posizione molto precisa, ${accuracy} metri di precisione.`;
                } else if (accuracy <= 15) {
                    address += `. Buona precisione, ${accuracy} metri.`;
                } else {
                    address += `. Precisione approssimativa, ${accuracy} metri.`;
                }
                
                if (hasDetails) {
                    speak(address, true);
                    showStatus(`📍 ${address}`, 'success');
                } else {
                    // Fallback to wider search
                    findNearestKnownLocation(lat, lng);
                }
            } else {
                findNearestKnownLocation(lat, lng);
            }
        })
        .catch(error => {
            console.error('Primary geocoding error:', error);
            findNearestKnownLocation(lat, lng);
        });
}

// 🔧 NEW: Fallback function for less precise areas
function findNearestKnownLocation(lat, lng) {
    // Try with wider zoom for general area
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=it`)
        .then(response => response.json())
        .then(data => {
            let address = "Ti trovi ";
            
            if (data.address) {
                if (data.address.road) {
                    address += `vicino a ${data.address.road}`;
                } else if (data.address.neighbourhood) {
                    address += `nel quartiere ${data.address.neighbourhood}`;
                } else if (data.address.suburb) {
                    address += `nella zona ${data.address.suburb}`;
                }
                
                if (data.address.city || data.address.town) {
                    address += `, ${data.address.city || data.address.town}`;
                }
                
                address += ". Posizione approssimativa.";
            } else {
                address = `Posizione rilevata: ${lat.toFixed(4)}, ${lng.toFixed(4)}. Area non mappata in dettaglio.`;
            }
            
            speak(address, true);
            showStatus(`📍 ${address}`, 'info');
        })
        .catch(error => {
            console.error('Fallback geocoding error:', error);
            const fallbackMessage = `Posizione GPS rilevata. Coordinate: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            speak(fallbackMessage, true);
            showStatus(`📍 ${fallbackMessage}`, 'info');
        });
}

// =================== NAVIGATION FUNCTIONS - 🔧 FIXED ===================

// 🔧 FIX 2: Voice-guided navigation instead of Google Maps
function navigateToPlace(placeTypeOrId) {
    let place;
    
    // Find place by type or ID
    if (placeTypeOrId.length > 10) {
        place = savedPlaces.find(p => p.id === placeTypeOrId);
    } else {
        place = savedPlaces.find(p => p.type === placeTypeOrId);
    }
    
    if (!place) {
        const placeNames = {
            'casa': 'Casa',
            'scuola': 'Scuola',
            'fermata': 'Fermata del Bus'
        };
        const placeName = placeNames[placeTypeOrId] || 'Questo luogo';
        speak(`${placeName} non è stato salvato. Vai alla modalità genitore per aggiungerlo.`, true);
        showStatus(`❌ ${placeName} non trovato`, 'error');
        return;
    }
    
    showLoadingOverlay(true, 'Inizializzazione navigazione...');
    speak(`Navigazione verso ${place.name}. Preparo le indicazioni vocali.`, false);
    
    // Get current position for navigation
    navigator.geolocation.getCurrentPosition(
        position => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            if (!place.latitude || !place.longitude) {
                showLoadingOverlay(false);
                speak(`${place.name} non ha coordinate GPS salvate. Devi salvare la posizione prima.`, true);
                showStatus('❌ Coordinate mancanti', 'error');
                return;
            }
            
            // Calculate distance and direction
            const distance = calculateDistance(userLat, userLng, place.latitude, place.longitude);
            const direction = getDirection(userLat, userLng, place.latitude, place.longitude);
            
            showLoadingOverlay(false);
            
            // 🔧 NO MORE GOOGLE MAPS! Voice guidance only
            startVoiceNavigation(place, distance, direction);
            
            // Update statistics
            totalNavigations++;
            updateStatistics();
            
        },
        error => {
            showLoadingOverlay(false);
            handleLocationError(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// 🔧 NEW: Complete voice navigation system
function startVoiceNavigation(destination, initialDistance, initialDirection) {
    // Clear any existing navigation
    if (currentNavigationInterval) {
        clearInterval(currentNavigationInterval);
    }
    
    // Initial announcement with detailed instructions
    let initialMessage = `Navigazione verso ${destination.name}. `;
    
    if (initialDistance < 20) {
        initialMessage += `Sei molto vicino, solo ${Math.round(initialDistance)} metri ${initialDirection}.`;
    } else if (initialDistance < 100) {
        initialMessage += `Devi camminare ${Math.round(initialDistance)} metri ${initialDirection}.`;
    } else if (initialDistance < 500) {
        initialMessage += `Devi camminare circa ${Math.round(initialDistance / 10) * 10} metri ${initialDirection}.`;
    } else {
        initialMessage += `Destinazione a ${Math.round(initialDistance / 100) * 100} metri ${initialDirection}. Ti guiderò passo dopo passo.`;
    }
    
    speak(initialMessage, true);
    showStatus(`🧭 Navigazione verso ${destination.name}`, 'info', 8000);
    
    // Continuous navigation updates every 8 seconds
    currentNavigationInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            position => {
                const currentDistance = calculateDistance(
                    position.coords.latitude,
                    position.coords.longitude,
                    destination.latitude,
                    destination.longitude
                );
                
                const newDirection = getDirection(
                    position.coords.latitude,
                    position.coords.longitude,
                    destination.latitude,
                    destination.longitude
                );
                
                let message = "";
                
                if (currentDistance < 5) {
                    // Arrived!
                    message = `Perfetto! Sei arrivato a ${destination.name}! Navigazione completata.`;
                    speak(message, true);
                    showStatus(`✅ Arrivato a ${destination.name}!`, 'success');
                    clearInterval(currentNavigationInterval);
                    currentNavigationInterval = null;
                    return;
                    
                } else if (currentDistance < 15) {
                    // Very close
                    message = `Ci sei quasi! Ancora ${Math.round(currentDistance)} metri. Rallenta.`;
                    
                } else if (currentDistance < 50) {
                    // Close
                    message = `Continua ${newDirection}, ancora ${Math.round(currentDistance)} metri.`;
                    
                } else if (currentDistance < 200) {
                    // Medium distance
                    message = `Continua dritto ${newDirection}. ${Math.round(currentDistance / 10) * 10} metri.`;
                    
                } else {
                    // Still far
                    message = `Direzione ${newDirection}, distanza ${Math.round(currentDistance / 50) * 50} metri.`;
                }
                
                speak(message, false);
                updateGPSStatus(position.coords.accuracy);
                
            },
            error => {
                console.error('Navigation GPS error:', error);
                speak('Segnale GPS temporaneamente perso, continua nella stessa direzione', false);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }, 8000); // Update every 8 seconds
    
    // Add stop navigation option
    setTimeout(() => {
        speak('Per fermare la navigazione, attiva la modalità genitore', false);
    }, 30000);
}

// Stop navigation when switching modes
function stopNavigation() {
    if (currentNavigationInterval) {
        clearInterval(currentNavigationInterval);
        currentNavigationInterval = null;
        speak('Navigazione interrotta', false);
    }
}

// =================== PLACES MANAGEMENT ===================

async function loadPlaces() {
    if (!db) return;
    
    try {
        const querySnapshot = await db.collection('places').get();
        savedPlaces = [];
        
        querySnapshot.forEach((doc) => {
            savedPlaces.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        displayPlaces();
        updateStatistics();
        
        // Setup real-time listener
        db.collection('places').onSnapshot((snapshot) => {
            savedPlaces = [];
            snapshot.forEach((doc) => {
                savedPlaces.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            displayPlaces();
            updateStatistics();
        });
        
    } catch (error) {
        console.error("Error loading places:", error);
        showStatus('Errore caricamento luoghi', 'error');
        
        // Try to load from localStorage as fallback
        const localPlaces = localStorage.getItem('aiuto_visivo_places');
        if (localPlaces) {
            savedPlaces = JSON.parse(localPlaces);
            displayPlaces();
        }
    }
}

function addDefaultPlaces() {
    if (!db) {
        showStatus('Database non disponibile', 'error');
        return;
    }
    
    const defaultPlaces = [
        {
            name: "Casa",
            type: "casa",
            address: "Da aggiornare con posizione reale",
            latitude: null,
            longitude: null,
            timestamp: new Date().toISOString(),
            needsUpdate: true
        },
        {
            name: "Scuola",
            type: "scuola", 
            address: "Da aggiornare con posizione reale",
            latitude: null,
            longitude: null,
            timestamp: new Date().toISOString(),
            needsUpdate: true
        },
        {
            name: "Fermata Bus",
            type: "fermata",
            address: "Da aggiornare con posizione reale", 
            latitude: null,
            longitude: null,
            timestamp: new Date().toISOString(),
            needsUpdate: true
        }
    ];

    const promises = defaultPlaces.map(place => db.collection('places').add(place));
    
    Promise.all(promises).then(() => {
        showStatus('✅ Luoghi base aggiunti! Aggiorna le posizioni.', 'success');
        speak('Ho aggiunto i luoghi base. Ora devi aggiornare le loro posizioni reali.', true);
    }).catch(error => {
        console.error('Error adding default places:', error);
        showStatus('Errore aggiunta luoghi base', 'error');
    });
}

function saveCurrentLocation() {
    const name = document.getElementById('placeName').value.trim();
    const type = document.getElementById('placeType').value;
    const address = document.getElementById('placeAddress').value.trim();
    
    if (!name) {
        showStatus('Inserisci un nome per il luogo', 'error');
        speak('Inserisci un nome per il luogo', true);
        return;
    }

    if (!db) {
        showStatus('Database non disponibile', 'error');
        return;
    }
    
    showLoadingOverlay(true, 'Salvando posizione GPS precisa...');
    speak('Sto salvando la posizione attuale con precisione migliorata', true);
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
    };
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = Math.round(position.coords.accuracy);
            
            // Get address if not provided
            let finalAddress = address;
            if (!finalAddress) {
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=it`);
                    const data = await response.json();
                    
                    if (data.address) {
                        finalAddress = '';
                        if (data.address.house_number && data.address.road) {
                            finalAddress = `${data.address.road} ${data.address.house_number}`;
                        } else if (data.address.road) {
                            finalAddress = data.address.road;
                        }
                        
                        if (data.address.city || data.address.town) {
                            finalAddress += `, ${data.address.city || data.address.town}`;
                        }
                    }
                } catch (e) {
                    finalAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                }
            }
            
            const place = {
                name: name,
                type: type,
                address: finalAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                latitude: lat,
                longitude: lng,
                accuracy: accuracy,
                timestamp: new Date().toISOString(),
                needsUpdate: false
            };
            
            try {
                await db.collection('places').add(place);
                
                // Also save to localStorage as backup
                const localPlaces = JSON.parse(localStorage.getItem('aiuto_visivo_places') || '[]');
                localPlaces.push(place);
                localStorage.setItem('aiuto_visivo_places', JSON.stringify(localPlaces));
                
                // Clear form
                document.getElementById('placeName').value = '';
                document.getElementById('placeAddress').value = '';
                
                showLoadingOverlay(false);
                showStatus(`✅ "${name}" salvato con precisione ${accuracy}m!`, 'success');
                speak(`Ho salvato ${name} con precisione di ${accuracy} metri`, true);
                
            } catch (error) {
                console.error("Save error:", error);
                showLoadingOverlay(false);
                showStatus('Errore nel salvare', 'error');
                speak('Errore nel salvare il luogo', true);
            }
        },
        (error) => {
            showLoadingOverlay(false);
            handleLocationError(error);
        },
        options
    );
}

function saveManualLocation() {
    const name = document.getElementById('placeName').value.trim();
    const type = document.getElementById('placeType').value;
    const address = document.getElementById('placeAddress').value.trim();
    
    if (!name || !address) {
        showStatus('Inserisci nome e indirizzo', 'error');
        speak('Inserisci sia il nome che l\'indirizzo', true);
        return;
    }

    if (!db) {
        showStatus('Database non disponibile', 'error');
        return;
    }
    
    const place = {
        name: name,
        type: type,
        address: address,
        latitude: null,
        longitude: null,
        timestamp: new Date().toISOString(),
        needsUpdate: true,
        manualEntry: true
    };
    
    db.collection('places').add(place).then(() => {
        document.getElementById('placeName').value = '';
        document.getElementById('placeAddress').value = '';
        
        showStatus(`✅ "${name}" salvato! Coordinate da aggiornare.`, 'success');
        speak(`Ho salvato ${name}. Ricorda di aggiornare la posizione GPS quando sei lì.`, true);
    }).catch(error => {
        console.error("Save error:", error);
        showStatus('Errore nel salvare', 'error');
    });
}

function displayPlaces() {
    const list = document.getElementById('placesList');
    
    if (savedPlaces.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 30px; opacity: 0.7;">
                <p style="font-size: 1.2em; margin-bottom: 15px;">📍 Nessun luogo salvato</p>
                <p>Inizia aggiungendo i luoghi importanti come casa e scuola</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = '';
    savedPlaces.forEach((place) => {
        const placeDiv = document.createElement('div');
        placeDiv.className = 'place-item';
        
        const icon = getPlaceIcon(place.type);
        const hasCoordinates = place.latitude && place.longitude;
        const accuracyText = place.accuracy ? ` (±${place.accuracy}m)` : '';
        const needsUpdateText = place.needsUpdate ? ' ⚠️ Da aggiornare' : '';
        
        placeDiv.innerHTML = `
            <div class="place-info">
                <div class="place-name">${icon} ${place.name}${needsUpdateText}</div>
                <div class="place-type">${place.address || 'Coordinate salvate'}${accuracyText}</div>
            </div>
            <div class="place-actions">
                ${hasCoordinates ? `
                    <button class="small-btn btn-info" onclick="navigateToPlace('${place.id}')" title="Naviga verso questo luogo">
                        🧭 Vai
                    </button>
                ` : `
                    <button class="small-btn btn-primary" onclick="updatePlaceLocation('${place.id}')" title="Aggiorna posizione GPS">
                        📍 GPS
                    </button>
                `}
                <button class="small-btn btn-danger" onclick="deletePlace('${place.id}')" title="Elimina luogo">
                    🗑️
                </button>
            </div>
        `;
        
        list.appendChild(placeDiv);
    });
}

async function updatePlaceLocation(placeId) {
    const place = savedPlaces.find(p => p.id === placeId);
    if (!place) return;
    
    showLoadingOverlay(true, `Aggiornando posizione di ${place.name}...`);
    speak(`Aggiorno la posizione GPS di ${place.name}`, true);
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = Math.round(position.coords.accuracy);
            
            try {
                await db.collection('places').doc(placeId).update({
                    latitude: lat,
                    longitude: lng,
                    accuracy: accuracy,
                    needsUpdate: false,
                    lastUpdated: new Date().toISOString()
                });
                
                showLoadingOverlay(false);
                showStatus(`✅ Posizione di "${place.name}" aggiornata!`, 'success');
                speak(`Posizione di ${place.name} aggiornata con precisione di ${accuracy} metri`, true);
                
            } catch (error) {
                console.error('Update error:', error);
                showLoadingOverlay(false);
                showStatus('Errore aggiornamento', 'error');
            }
        },
        (error) => {
            showLoadingOverlay(false);
            handleLocationError(error);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

function deletePlace(placeId) {
    const place = savedPlaces.find(p => p.id === placeId);
    if (!place) return;
    
    if (confirm(`Sei sicuro di voler eliminare "${place.name}"?`)) {
        db.collection('places').doc(placeId).delete().then(() => {
            showStatus(`"${place.name}" eliminato`, 'info');
            speak(`Ho eliminato ${place.name}`, true);
        }).catch(error => {
            console.error('Delete error:', error);
            showStatus('Errore eliminazione', 'error');
        });
    }
}

// =================== UTILITY FUNCTIONS ===================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

function getDirection(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    
    // Convert to Italian directions with more precision
    if (bearing >= 337.5 || bearing < 22.5) return "verso nord";
    else if (bearing >= 22.5 && bearing < 67.5) return "verso nord-est";
    else if (bearing >= 67.5 && bearing < 112.5) return "verso est";
    else if (bearing >= 112.5 && bearing < 157.5) return "verso sud-est";
    else if (bearing >= 157.5 && bearing < 202.5) return "verso sud";
    else if (bearing >= 202.5 && bearing < 247.5) return "verso sud-ovest";
    else if (bearing >= 247.5 && bearing < 292.5) return "verso ovest";
    else return "verso nord-ovest";
}

function getPlaceIcon(type) {
    const icons = {
        casa: '🏠',
        scuola: '🏫',
        fermata: '🚌',
        negozio: '🛒',
        parco: '🌳',
        ospedale: '🏥',
        amico: '👥',
        altro: '📍'
    };
    return icons[type] || '📍';
}

function handleLocationError(error) {
    let message = '';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Permesso GPS negato. Abilita la localizzazione nelle impostazioni del browser.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Segnale GPS non disponibile. Prova all\'aperto o vicino a una finestra.';
            break;
        case error.TIMEOUT:
            message = 'Timeout GPS. Il segnale è troppo lento. Riprova.';
            break;
        default:
            message = 'Errore GPS sconosciuto. Verifica le impostazioni.';
            break;
    }
    
    speak(message, true);
    showStatus(`❌ ${message}`, 'error');
}

// =================== VOICE FUNCTIONS ===================

function initializeVoice() {
    voiceSupported = 'speechSynthesis' in window;
    
    if (voiceSupported) {
        // Load voices
        if (synth.getVoices().length === 0) {
            synth.addEventListener('voiceschanged', () => {
                console.log('Voices loaded:', synth.getVoices().length);
            });
        }
    } else {
        showStatus('Sintesi vocale non supportata', 'error');
    }
}

function speak(text, priority = false) {
    if (!voiceSupported) return;
    
    if (priority && synth.speaking) {
        synth.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.volume = currentVolume;
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    
    // Try to find Italian voice
    const voices = synth.getVoices();
    const italianVoice = voices.find(voice => 
        voice.lang.startsWith('it') || 
        voice.name.toLowerCase().includes('italian') ||
        voice.name.toLowerCase().includes('giulia') ||
        voice.name.toLowerCase().includes('cosimo')
    );
    
    if (italianVoice) {
        utterance.voice = italianVoice;
    }
    
    // Error handling
    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
    };
    
    synth.speak(utterance);
}

function testVoice() {
    speak('Questa è una prova della sintesi vocale italiana di Aiuto Visivo. Sistema dell\'Ingegnere Maher Madany.', true);
}

// =================== SETTINGS FUNCTIONS ===================

function loadSettings() {
    // Load volume
    const savedVolume = localStorage.getItem('aiuto_visivo_volume');
    if (savedVolume) {
        currentVolume = parseFloat(savedVolume);
        document.getElementById('volumeSlider').value = currentVolume * 100;
        document.getElementById('volumeValue').textContent = Math.round(currentVolume * 100) + '%';
    }
    
    // Load speech rate
    const savedRate = localStorage.getItem('aiuto_visivo_speech_rate');
    if (savedRate) {
        speechRate = parseFloat(savedRate);
        document.getElementById('speechRateSlider').value = speechRate;
        updateSpeechRateLabel();
    }
    
    // Load emergency number
    const savedEmergency = localStorage.getItem('aiuto_visivo_emergency');
    if (savedEmergency) {
        emergencyNumber = savedEmergency;
        document.getElementById('emergencyNumber').value = emergencyNumber;
    }
    
    // Load statistics
    totalNavigations = parseInt(localStorage.getItem('aiuto_visivo_navigations') || '0');
}

function adjustVolume() {
    currentVolume = document.getElementById('volumeSlider').value / 100;
    document.getElementById('volumeValue').textContent = Math.round(currentVolume * 100) + '%';
    localStorage.setItem('aiuto_visivo_volume', currentVolume);
    
    // Test volume
    speak('Volume aggiornato', false);
}

function adjustSpeechRate() {
    speechRate = parseFloat(document.getElementById('speechRateSlider').value);
    updateSpeechRateLabel();
    localStorage.setItem('aiuto_visivo_speech_rate', speechRate);
    
    // Test speed
    speak('Velocità voce aggiornata', false);
}

function updateSpeechRateLabel() {
    const rateLabel = document.getElementById('speechRateValue');
    if (speechRate <= 0.7) {
        rateLabel.textContent = 'Molto Lenta';
    } else if (speechRate <= 0.9) {
        rateLabel.textContent = 'Lenta';
    } else if (speechRate <= 1.1) {
        rateLabel.textContent = 'Normale';
    } else if (speechRate <= 1.5) {
        rateLabel.textContent = 'Veloce';
    } else {
        rateLabel.textContent = 'Molto Veloce';
    }
}

function saveEmergencyNumber() {
    const number = document.getElementById('emergencyNumber').value.trim();
    if (number) {
        emergencyNumber = number;
        localStorage.setItem('aiuto_visivo_emergency', emergencyNumber);
        showStatus('Numero di emergenza salvato', 'success');
        speak('Numero di emergenza aggiornato', true);
    } else {
        showStatus('Inserisci un numero valido', 'error');
    }
}

// =================== EMERGENCY FUNCTIONS ===================

function callEmergency() {
    speak('Attivazione chiamata di emergenza', true);
    showStatus('🚨 CHIAMATA DI EMERGENZA', 'error', 10000);
    
    // Get current location for emergency services
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Save emergency location to database
            if (db) {
                db.collection('emergencies').add({
                    latitude: lat,
                    longitude: lng,
                    timestamp: new Date().toISOString(),
                    type: 'emergency_call',
                    accuracy: position.coords.accuracy
                }).catch(console.error);
            }
            
            // Make the call
            window.location.href = `tel:${emergencyNumber}`;
            
            // Announce location
            setTimeout(() => {
                speak(`Posizione di emergenza: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, true);
            }, 2000);
        },
        error => {
            // Call emergency even without location
            window.location.href = `tel:${emergencyNumber}`;
            console.error('Emergency location error:', error);
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
}

// =================== MODE SWITCHING ===================

function toggleMode() {
    isChildMode = !isChildMode;
    
    const parentMode = document.getElementById('parentMode');
    const childMode = document.getElementById('childMode');
    const modeText = document.getElementById('modeText');
    
    if (isChildMode) {
        // Switch to child mode
        parentMode.style.display = 'none';
        childMode.classList.add('active');
        modeText.innerHTML = '👨‍👩‍👧‍👦 Modalità Genitore';
        speak('Modalità bambino attivata. Usa i pulsanti grandi per navigare.', true);
        
        // Stop any ongoing navigation when switching to child mode
        stopNavigation();
        
    } else {
        // Switch to parent mode
        parentMode.style.display = 'block';
        childMode.classList.remove('active');
        modeText.innerHTML = '👦 Modalità Bambino';
        speak('Modalità genitore attivata. Puoi gestire i luoghi e le impostazioni.', true);
        
        // Stop navigation when switching to parent mode
        stopNavigation();
    }
}

// =================== GPS AND LOCATION TRACKING ===================

function initializeGPS() {
    updateGPSStatus(0, 'Inizializzazione...');
    
    if ('geolocation' in navigator) {
        // Test GPS availability
        navigator.geolocation.getCurrentPosition(
            position => {
                updateGPSStatus(Math.round(position.coords.accuracy), 'Attivo');
                gpsAccuracy = Math.round(position.coords.accuracy);
            },
            error => {
                updateGPSStatus(0, 'Errore');
                console.error('GPS initialization error:', error);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        updateGPSStatus(0, 'Non Disponibile');
    }
    
    // Update battery status if available
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            updateBatteryStatus(Math.round(battery.level * 100));
            
            // Listen for battery changes
            battery.addEventListener('levelchange', () => {
                updateBatteryStatus(Math.round(battery.level * 100));
            });
        }).catch(() => {
            updateBatteryStatus(100); // Default if not available
        });
    }
}

function updateGPSStatus(accuracy, status = 'Attivo') {
    const gpsElement = document.getElementById('gpsAccuracy');
    if (accuracy > 0) {
        gpsElement.textContent = `📡 GPS: ${status} (±${accuracy}m)`;
        gpsElement.style.color = accuracy <= 10 ? '#4CAF50' : accuracy <= 20 ? '#FF9800' : '#f44336';
    } else {
        gpsElement.textContent = `📡 GPS: ${status}`;
        gpsElement.style.color = '#f44336';
    }
}

function updateBatteryStatus(level) {
    const batteryElement = document.getElementById('batteryLevel');
    const icon = level > 50 ? '🔋' : level > 20 ? '🪫' : '🔴';
    batteryElement.textContent = `${icon} ${level}%`;
    batteryElement.style.color = level > 20 ? '#4CAF50' : '#f44336';
}

// =================== STATISTICS AND MONITORING ===================

function updateStatistics() {
    // Update total locations
    document.getElementById('totalLocations').textContent = savedPlaces.length;
    
    // Update total navigations
    document.getElementById('totalNavigations').textContent = totalNavigations;
    localStorage.setItem('aiuto_visivo_navigations', totalNavigations);
    
    // Update average accuracy
    const placesWithAccuracy = savedPlaces.filter(p => p.accuracy && p.accuracy > 0);
    if (placesWithAccuracy.length > 0) {
        const avgAccuracy = Math.round(
            placesWithAccuracy.reduce((sum, p) => sum + p.accuracy, 0) / placesWithAccuracy.length
        );
        document.getElementById('averageAccuracy').textContent = `${avgAccuracy}m`;
    } else {
        document.getElementById('averageAccuracy').textContent = 'N/A';
    }
}

async function saveLocationToHistory(lat, lng, accuracy) {
    if (!db) return;
    
    const locationData = {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
    };
    
    try {
        await db.collection('locationHistory').add(locationData);
    } catch (error) {
        console.error('Error saving location history:', error);
        
        // Save locally as fallback
        const localHistory = JSON.parse(localStorage.getItem('aiuto_visivo_history') || '[]');
        localHistory.push(locationData);
        
        // Keep only last 50 locations
        if (localHistory.length > 50) {
            localHistory.splice(0, localHistory.length - 50);
        }
        
        localStorage.setItem('aiuto_visivo_history', JSON.stringify(localHistory));
    }
}

// =================== KEYBOARD ACCESSIBILITY ===================

// Handle keyboard navigation
document.addEventListener('keydown', (event) => {
    // ESC key to toggle modes
    if (event.key === 'Escape') {
        toggleMode();
    }
    
    // Space or Enter to activate focused button
    if ((event.key === ' ' || event.key === 'Enter') && event.target.tagName === 'BUTTON') {
        event.preventDefault();
        event.target.click();
    }
    
    // Number keys for quick navigation in child mode
    if (isChildMode) {
        switch(event.key) {
            case '1':
                navigateToPlace('casa');
                break;
            case '2':
                navigateToPlace('scuola');
                break;
            case '3':
                navigateToPlace('fermata');
                break;
            case '4':
                whereAmI();
                break;
            case '9':
                callEmergency();
                break;
        }
    }
});

// =================== VOICE RECOGNITION (FUTURE FEATURE) ===================

// Initialize voice recognition if available
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();
        
        // Process voice commands
        if (command.includes('casa')) {
            navigateToPlace('casa');
        } else if (command.includes('scuola')) {
            navigateToPlace('scuola');
        } else if (command.includes('bus') || command.includes('fermata')) {
            navigateToPlace('fermata');
        } else if (command.includes('dove sono')) {
            whereAmI();
        } else if (command.includes('aiuto') || command.includes('emergenza')) {
            callEmergency();
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
    };
    
    // Future: Add voice activation button
}

// =================== SERVICE WORKER FOR PWA ===================

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// =================== ERROR HANDLING ===================

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Don't speak errors during navigation
    if (!currentNavigationInterval) {
        speak('Si è verificato un errore tecnico', false);
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// =================== PERFORMANCE MONITORING ===================

// Monitor performance
if ('performance' in window) {
    window.addEventListener('load', () => {
        const perfData = performance.getEntriesByType('navigation')[0];
        console.log('Page load time:', perfData.loadEventEnd - perfData.fetchStart, 'ms');
    });
}

// =================== ACCESSIBILITY ENHANCEMENTS ===================

// Add ARIA live region for announcements
const liveRegion = document.createElement('div');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.setAttribute('aria-atomic', 'true');
liveRegion.style.position = 'absolute';
liveRegion.style.left = '-10000px';
liveRegion.style.width = '1px';
liveRegion.style.height = '1px';
liveRegion.style.overflow = 'hidden';
document.body.appendChild(liveRegion);

// Enhanced speak function for screen readers
function announceToScreenReader(message) {
    liveRegion.textContent = message;
    setTimeout(() => {
        liveRegion.textContent = '';
    }, 1000);
}

// =================== INITIALIZATION COMPLETE ===================

// Log successful initialization
console.log('🎯 Aiuto Visivo v2.0 - Sistema inizializzato con successo');
console.log('👨‍💻 Sviluppato da: Ing. Maher Madany');
console.log('🚀 Tutte le funzionalità caricate e pronte all\'uso');

// Final initialization message
setTimeout(() => {
    if (savedPlaces.length > 0) {
        speak('Sistema completamente caricato. Tutti i luoghi sono pronti per la navigazione.', false);
    } else {
        speak('Sistema caricato. Aggiungi i primi luoghi per iniziare a navigare.', false);
    }
}, 5000);

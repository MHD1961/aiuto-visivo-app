// Firebase Configuration - مباشرة في الكود، لا حاجة للإدخال
const firebaseConfig = {
    apiKey: "AIzaSyBNpH-sN_Vm_4OhcEoHwxd5nPEYaWXg3ps",
    authDomain: "aiuto-visivo-v2.firebaseapp.com",
    projectId: "aiuto-visivo-v2",
    storageBucket: "aiuto-visivo-v2.firebasestorage.app",
    messagingSenderId: "358903320115",
    appId: "1:358903320115:web:91bdce0a359f2657761d46"
};

// Global Variables
let db;
let savedPlaces = [];
let currentNavigationInterval = null;
let speechSynthesis = window.speechSynthesis;
let currentVolume = 0.8;
let speechRate = 1.0;
let emergencyNumber = '+39 112'; // Default emergency number for Italy

// Initialize Firebase on page load
window.addEventListener('load', async () => {
    try {
        // Auto-initialize Firebase
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // Update connection status
        updateConnectionStatus(true);
        
        // Load saved places
        await loadPlaces();
        
        // Load settings
        loadSettings();
        
        // Initialize GPS tracking
        initializeGPS();
        
        // Welcome message
        speak('Benvenuto in Aiuto Visivo. App pronta per l\'uso.', false);
        
    } catch (error) {
        console.error('Firebase initialization error:', error);
        updateConnectionStatus(false);
        speak('Errore di connessione. Alcune funzioni potrebbero non funzionare.', false);
    }
});

// ================== NAVIGATION FUNCTIONS ==================

// Show different sections
function showChildMode() {
    hideAllSections();
    document.getElementById('childMode').classList.remove('hidden');
    speak('Modalità bambino attivata', false);
}

function showParentMode() {
    hideAllSections();
    document.getElementById('parentMode').classList.remove('hidden');
    speak('Modalità genitore attivata', false);
}

function showSettings() {
    hideAllSections();
    document.getElementById('settingsSection').classList.remove('hidden');
    speak('Impostazioni aperte', false);
}

function showMonitoring() {
    hideAllSections();
    document.getElementById('monitoringSection').classList.remove('hidden');
    loadLocationHistory();
    speak('Sezione monitoraggio aperta', false);
}

function managePlaces() {
    hideAllSections();
    document.getElementById('placesSection').classList.remove('hidden');
    displaySavedPlaces();
    speak('Gestione luoghi aperta', false);
}

function showAddPlace() {
    hideAllSections();
    document.getElementById('addPlaceSection').classList.remove('hidden');
    speak('Aggiungi nuovo luogo', false);
}

function hideAllSections() {
    const sections = ['parentMode', 'childMode', 'settingsSection', 'monitoringSection', 'addPlaceSection', 'placesSection'];
    sections.forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

// ================== LOCATION FUNCTIONS - FIXED ==================

// 🔧 FIX 1: Improved location accuracy with detailed address
function getCurrentLocation() {
    showLoading(true);
    speak('Rilevamento posizione in corso...', false);
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
    };
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            // Save location to history
            saveLocationToHistory(lat, lng, accuracy);
            
            // Get detailed address
            getDetailedAddress(lat, lng, accuracy);
            
            showLoading(false);
        },
        error => {
            showLoading(false);
            handleLocationError(error);
        },
        options
    );
}

// 🔧 NEW: Detailed address function with better accuracy
function getDetailedAddress(lat, lng, accuracy) {
    // Try multiple geocoding services for better results
    
    // First try Nominatim with high zoom for detailed results
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=20&addressdetails=1&accept-language=it`)
        .then(response => response.json())
        .then(data => {
            let address = "Ti trovi ";
            
            if (data.address) {
                // Build detailed address
                if (data.address.house_number && data.address.road) {
                    address += `in ${data.address.road} numero ${data.address.house_number}`;
                } else if (data.address.road) {
                    address += `in ${data.address.road}`;
                } else if (data.address.neighbourhood) {
                    address += `nel quartiere ${data.address.neighbourhood}`;
                } else {
                    // If no street found, search in wider area
                    findNearestStreet(lat, lng);
                    return;
                }
                
                // Add city information
                if (data.address.city || data.address.town || data.address.village) {
                    address += `, ${data.address.city || data.address.town || data.address.village}`;
                }
                
                // Add accuracy information
                if (accuracy) {
                    address += `. Precisione: circa ${Math.round(accuracy)} metri`;
                }
                
                speak(address, true);
            } else {
                // Fallback to basic coordinates
                speak(`Ti trovi alle coordinate ${lat.toFixed(4)}, ${lng.toFixed(4)}`, true);
            }
        })
        .catch(error => {
            console.error('Geocoding error:', error);
            // Fallback to coordinates
            speak(`Posizione rilevata. Coordinate: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, true);
        });
}

// 🔧 NEW: Find nearest street when exact address not available
function findNearestStreet(lat, lng) {
    // Search in a wider radius for nearest known street
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=it`)
        .then(response => response.json())
        .then(data => {
            let address = "Ti trovi ";
            
            if (data.address && data.address.road) {
                address += `vicino a ${data.address.road}`;
                
                if (data.address.city || data.address.town) {
                    address += `, ${data.address.city || data.address.town}`;
                }
            } else {
                address = "Posizione rilevata, ma indirizzo specifico non disponibile";
            }
            
            speak(address, true);
        })
        .catch(error => {
            console.error('Street search error:', error);
            speak('Posizione rilevata, ma dettagli indirizzo non disponibili', true);
        });
}

// ================== NAVIGATION FUNCTIONS - FIXED ==================

// 🔧 FIX 2: Voice-guided navigation instead of opening Google Maps
function navigateToPlace(placeType) {
    const place = savedPlaces.find(p => p.type === placeType);
    
    if (!place) {
        speak(`${getPlaceNameInItalian(placeType)} non è stato salvato. Vai alla modalità genitore per aggiungerlo.`, true);
        return;
    }
    
    speak(`Navigazione verso ${place.name} in corso...`, false);
    
    // Get current position for navigation
    navigator.geolocation.getCurrentPosition(
        position => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            // Calculate distance and direction
            const distance = calculateDistance(userLat, userLng, place.latitude, place.longitude);
            const direction = getDirection(userLat, userLng, place.latitude, place.longitude);
            
            // 🔧 NO MORE GOOGLE MAPS! Voice guidance only
            startVoiceNavigation(place, distance, direction);
            
        },
        error => {
            handleLocationError(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// 🔧 NEW: Voice navigation system
function startVoiceNavigation(destination, initialDistance, initialDirection) {
    // Clear any existing navigation
    if (currentNavigationInterval) {
        clearInterval(currentNavigationInterval);
    }
    
    // Initial announcement
    speak(`${destination.name} è a ${Math.round(initialDistance)} metri ${initialDirection}. Inizia a camminare ${initialDirection}. Ti guiderò passo dopo passo.`, true);
    
    // Continuous navigation updates every 10 seconds
    currentNavigationInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            position => {
                const currentDistance = calculateDistance(
                    position.coords.latitude,
                    position.coords.longitude,
                    destination.latitude,
                    destination.longitude
                );
                
                if (currentDistance < 10) {
                    // Arrived
                    speak(`Perfetto! Sei arrivato a ${destination.name}!`, true);
                    clearInterval(currentNavigationInterval);
                    currentNavigationInterval = null;
                } else if (currentDistance < 30) {
                    // Very close
                    speak(`Ci sei quasi! Ancora ${Math.round(currentDistance)} metri`, true);
                } else if (currentDistance < 100) {
                    // Close
                    const newDirection = getDirection(
                        position.coords.latitude,
                        position.coords.longitude,
                        destination.latitude,
                        destination.longitude
                    );
                    speak(`${Math.round(currentDistance)} metri, continua ${newDirection}`, false);
                } else {
                    // Still far
                    const newDirection = getDirection(
                        position.coords.latitude,
                        position.coords.longitude,
                        destination.latitude,
                        destination.longitude
                    );
                    speak(`${Math.round(currentDistance)} metri, direzione ${newDirection}`, false);
                }
            },
            error => {
                console.error('Navigation error:', error);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }, 10000); // Update every 10 seconds
}

// Helper function to get place name in Italian
function getPlaceNameInItalian(placeType) {
    const placeNames = {
        'casa': 'Casa',
        'scuola': 'Scuola',
        'fermata': 'Fermata del Bus',
        'altro': 'Questo luogo'
    };
    return placeNames[placeType] || placeType;
}

// ================== UTILITY FUNCTIONS ==================

// Calculate distance between two points
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

// Get direction between two points
function getDirection(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    
    // Convert to Italian directions
    if (bearing >= 337.5 || bearing < 22.5) return "a nord";
    else if (bearing >= 22.5 && bearing < 67.5) return "a nord-est";
    else if (bearing >= 67.5 && bearing < 112.5) return "a est";
    else if (bearing >= 112.5 && bearing < 157.5) return "a sud-est";
    else if (bearing >= 157.5 && bearing < 202.5) return "a sud";
    else if (bearing >= 202.5 && bearing < 247.5) return "a sud-ovest";
    else if (bearing >= 247.5 && bearing < 292.5) return "a ovest";
    else return "a nord-ovest";
}

// ================== SPEECH FUNCTIONS ==================

function speak(text, priority = false) {
    if (speechSynthesis.speaking && priority) {
        speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.volume = currentVolume;
    utterance.rate = speechRate;
    
    // Try to find an Italian voice
    const voices = speechSynthesis.getVoices();
    const italianVoice = voices.find(voice => voice.lang.startsWith('it'));
    if (italianVoice) {
        utterance.voice = italianVoice;
    }
    
    speechSynthesis.speak(utterance);
}

// ================== PLACE MANAGEMENT FUNCTIONS ==================

async function loadPlaces() {
    try {
        const placesSnapshot = await db.collection('places').get();
        savedPlaces = [];
        
        placesSnapshot.forEach(doc => {
            savedPlaces.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log('Places loaded:', savedPlaces.length);
    } catch (error) {
        console.error('Error loading places:', error);
        // Try to load from localStorage as fallback
        const localPlaces = localStorage.getItem('savedPlaces');
        if (localPlaces) {
            savedPlaces = JSON.parse(localPlaces);
        }
    }
}

function getCurrentLocationForPlace() {
    showLoading(true);
    speak('Rilevamento posizione per salvare il luogo...', false);
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Get address for the place
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=it`)
                .then(response => response.json())
                .then(data => {
                    let address = '';
                    if (data.address) {
                        if (data.address.house_number && data.address.road) {
                            address = `${data.address.road} ${data.address.house_number}, ${data.address.city || data.address.town || ''}`;
                        } else if (data.address.road) {
                            address = `${data.address.road}, ${data.address.city || data.address.town || ''}`;
                        } else {
                            address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        }
                    }
                    
                    // Store location data for saving
                    window.tempLocation = { lat, lng, address };
                    
                    speak(`Posizione rilevata: ${address}. Inserisci il nome e salva.`, true);
                    showLoading(false);
                })
                .catch(error => {
                    console.error('Address lookup error:', error);
                    window.tempLocation = { lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
                    speak('Posizione rilevata. Inserisci il nome e salva.', true);
                    showLoading(false);
                });
        },
        error => {
            showLoading(false);
            handleLocationError(error);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function savePlace() {
    const placeName = document.getElementById('placeName').value.trim();
    const placeType = document.getElementById('placeType').value;
    
    if (!placeName) {
        speak('Inserisci il nome del luogo', true);
        return;
    }
    
    if (!window.tempLocation) {
        speak('Prima rileva la posizione', true);
        return;
    }
    
    const place = {
        name: placeName,
        type: placeType,
        latitude: window.tempLocation.lat,
        longitude: window.tempLocation.lng,
        address: window.tempLocation.address,
        createdAt: new Date().toISOString()
    };
    
    try {
        // Save to Firebase
        await db.collection('places').add(place);
        
        // Save to local storage as backup
        savedPlaces.push(place);
        localStorage.setItem('savedPlaces', JSON.stringify(savedPlaces));
        
        speak(`${placeName} salvato con successo`, true);
        
        // Clear form
        document.getElementById('placeName').value = '';
        window.tempLocation = null;
        
        // Reload places
        await loadPlaces();
        
    } catch (error) {
        console.error('Error saving place:', error);
        
        // Save locally if Firebase fails
        place.id = Date.now().toString();
        savedPlaces.push(place);
        localStorage.setItem('savedPlaces', JSON.stringify(savedPlaces));
        
        speak(`${placeName} salvato localmente`, true);
    }
}

function displaySavedPlaces() {
    const container = document.getElementById('savedPlacesList');
    container.innerHTML = '';
    
    if (savedPlaces.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nessun luogo salvato</p>';
        return;
    }
    
    savedPlaces.forEach(place => {
        const placeElement = document.createElement('div');
        placeElement.className = 'place-item';
        placeElement.innerHTML = `
            <div class="place-info">
                <div class="place-name">${getPlaceIcon(place.type)} ${place.name}</div>
                <div class="place-address">${place.address}</div>
            </div>
            <div class="place-actions">
                <button class="small-button edit-button" onclick="editPlace('${place.id}')">✏️</button>
                <button class="small-button delete-button" onclick="deletePlace('${place.id}')">🗑️</button>
            </div>
        `;
        container.appendChild(placeElement);
    });
}

function getPlaceIcon(type) {
    const icons = {
        'casa': '🏠',
        'scuola': '🏫',
        'fermata': '🚌',
        'altro': '📍'
    };
    return icons[type] || '📍';
}

async function deletePlace(placeId) {
    if (!confirm('Sei sicuro di voler eliminare questo luogo?')) {
        return;
    }
    
    try {
        // Delete from Firebase
        await db.collection('places').doc(placeId).delete();
        
        // Remove from local array
        savedPlaces = savedPlaces.filter(place => place.id !== placeId);
        localStorage.setItem('savedPlaces', JSON.stringify(savedPlaces));
        
        speak('Luogo eliminato', false);
        displaySavedPlaces();
        
    } catch (error) {
        console.error('Error deleting place:', error);
        
        // Delete locally if Firebase fails
        savedPlaces = savedPlaces.filter(place => place.id !== placeId);
        localStorage.setItem('savedPlaces', JSON.stringify(savedPlaces));
        
        speak('Luogo eliminato localmente', false);
        displaySavedPlaces();
    }
}

// ================== SETTINGS FUNCTIONS ==================

function adjustVolume() {
    currentVolume = document.getElementById('volumeSlider').value / 100;
    localStorage.setItem('volume', currentVolume);
    speak('Volume aggiornato', false);
}

function adjustSpeechRate() {
    speechRate = document.getElementById('speechRateSlider').value;
    localStorage.setItem('speechRate', speechRate);
    speak('Velocità voce aggiornata', false);
}

function saveEmergencyNumber() {
    const number = document.getElementById('emergencyNumber').value.trim();
    if (number) {
        emergencyNumber = number;
        localStorage.setItem('emergencyNumber', emergencyNumber);
        speak('Numero di emergenza salvato', true);
    }
}

function loadSettings() {
    // Load volume
    const savedVolume = localStorage.getItem('volume');
    if (savedVolume) {
        currentVolume = parseFloat(savedVolume);
        document.getElementById('volumeSlider').value = currentVolume * 100;
    }
    
    // Load speech rate
    const savedRate = localStorage.getItem('speechRate');
    if (savedRate) {
        speechRate = parseFloat(savedRate);
        document.getElementById('speechRateSlider').value = speechRate;
    }
    
    // Load emergency number
    const savedEmergency = localStorage.getItem('emergencyNumber');
    if (savedEmergency) {
        emergencyNumber = savedEmergency;
        document.getElementById('emergencyNumber').value = emergencyNumber;
    }
}

// ================== EMERGENCY FUNCTIONS ==================

function callEmergency() {
    speak('Chiamata di emergenza in corso', true);
    
    // Get current location and call emergency
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Try to call emergency number
            window.location.href = `tel:${emergencyNumber}`;
            
            // Also save emergency location
            saveEmergencyLocation(lat, lng);
        },
        error => {
            // Call emergency even without location
            window.location.href = `tel:${emergencyNumber}`;
        }
    );
}

async function saveEmergencyLocation(lat, lng) {
    try {
        await db.collection('emergencies').add({
            latitude: lat,
            longitude: lng,
            timestamp: new Date().toISOString(),
            type: 'emergency_call'
        });
    } catch (error) {
        console.error('Error saving emergency location:', error);
    }
}

// ================== MONITORING FUNCTIONS ==================

async function saveLocationToHistory(lat, lng, accuracy) {
    const locationData = {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        timestamp: new Date().toISOString()
    };
    
    try {
        await db.collection('locationHistory').add(locationData);
    } catch (error) {
        console.error('Error saving location history:', error);
        
        // Save locally as fallback
        const localHistory = JSON.parse(localStorage.getItem('locationHistory') || '[]');
        localHistory.push(locationData);
        
        // Keep only last 100 locations
        if (localHistory.length > 100) {
            localHistory.splice(0, localHistory.length - 100);
        }
        
        localStorage.setItem('locationHistory', JSON.stringify(localHistory));
    }
}

async function loadLocationHistory() {
    const container = document.getElementById('locationHistory');
    container.innerHTML = '<p>Caricamento cronologia...</p>';
    
    try {
        const historySnapshot = await db.collection('locationHistory')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        
        let historyHtml = '<h3>📍 Cronologia Posizioni</h3>';
        
        if (historySnapshot.empty) {
            historyHtml += '<p>Nessuna posizione salvata</p>';
        } else {
            historySnapshot.forEach(doc => {
                const data = doc.data();
                const date = new Date(data.timestamp);
                historyHtml += `
                    <div class="location-entry">
                        <div class="location-time">${date.toLocaleString('it-IT')}</div>
                        <div class="location-address">Lat: ${data.latitude.toFixed(4)}, Lng: ${data.longitude.toFixed(4)}</div>
                        <div class="location-accuracy">Precisione: ${Math.round(data.accuracy || 0)}m</div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = historyHtml;
        
    } catch (error) {
        console.error('Error loading location history:', error);
        
        // Load from local storage as fallback
        const localHistory = JSON.parse(localStorage.getItem('locationHistory') || '[]');
        let historyHtml = '<h3>📍 Cronologia Posizioni (Locale)</h3>';
        
        if (localHistory.length === 0) {
            historyHtml += '<p>Nessuna posizione salvata</p>';
        } else {
            localHistory.slice(-20).reverse().forEach(data => {
                const date = new Date(data.timestamp);
                historyHtml += `
                    <div class="location-entry">
                        <div class="location-time">${date.toLocaleString('it-IT')}</div>
                        <div class="location-address">Lat: ${data.latitude.toFixed(4)}, Lng: ${data.longitude.toFixed(4)}</div>
                        <div class="location-accuracy">Precisione: ${Math.round(data.accuracy || 0)}m</div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = historyHtml;
    }
}

// ================== UTILITY FUNCTIONS ==================

function handleLocationError(error) {
    let message = '';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Permesso GPS negato. Abilita la localizzazione nelle impostazioni.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Posizione non disponibile. Verifica la connessione GPS.';
            break;
        case error.TIMEOUT:
            message = 'Timeout GPS. Riprova.';
            break;
        default:
            message = 'Errore GPS sconosciuto.';
            break;
    }
    
    speak(message, true);
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (connected) {
        statusElement.textContent = '🟢 Connesso';
        statusElement.style.color = '#4CAF50';
    } else {
        statusElement.textContent = '🔴 Non Connesso';
        statusElement.style.color = '#f44336';
    }
}

function initializeGPS() {
    if ('geolocation' in navigator) {
        document.getElementById('gpsStatus').textContent = '📡 GPS: Attivo';
        document.getElementById('gpsStatus').style.color = '#4CAF50';
    } else {
        document.getElementById('gpsStatus').textContent = '📡 GPS: Non Disponibile';
        document.getElementById('gpsStatus').style.color = '#f44336';
    }
    
    // Update battery status if available
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            const level = Math.round(battery.level * 100);
            document.getElementById('batteryStatus').textContent = `🔋 ${level}%`;
        });
    }
}

// ================== EVENT LISTENERS ==================

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, stop speech
        speechSynthesis.cancel();
    }
});

// Handle back button
window.addEventListener('popstate', () => {
    showChildMode();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

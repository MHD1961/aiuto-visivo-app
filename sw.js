const CACHE_NAME = 'aiuto-visivo-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('Service Worker installing');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Ensure the new service worker takes control immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle navigation requests (for offline pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Clone the request because it's a stream
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response because it's a stream
          const responseToCache = response.clone();

          // Don't cache Firebase requests or external APIs
          const url = new URL(event.request.url);
          if (url.hostname.includes('firebase') || 
              url.hostname.includes('googleapis') ||
              url.hostname.includes('nominatim') ||
              url.hostname.includes('openstreetmap')) {
            return response;
          }

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // If fetch fails and no cache, return offline page for HTML requests
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Handle background sync for location updates when offline
self.addEventListener('sync', event => {
  if (event.tag === 'background-location-sync') {
    event.waitUntil(syncLocationData());
  }
});

// Sync offline location data when back online
async function syncLocationData() {
  try {
    // Get pending location data from IndexedDB or localStorage
    const pendingData = await getStoredPendingData();
    
    if (pendingData && pendingData.length > 0) {
      // Send to Firebase when back online
      await sendLocationDataToFirebase(pendingData);
      
      // Clear pending data after successful sync
      await clearPendingData();
      
      console.log('Location data synced successfully');
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Handle push notifications for emergency alerts
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Aiuto Visivo - Notifica',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'aiuto-visivo-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Apri App',
        icon: '/icon-192.png'
      },
      {
        action: 'close',
        title: 'Chiudi',
        icon: '/icon-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Aiuto Visivo', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Helper functions for data storage
async function getStoredPendingData() {
  // This would typically use IndexedDB for more robust offline storage
  return new Promise((resolve) => {
    // Placeholder for IndexedDB implementation
    resolve([]);
  });
}

async function sendLocationDataToFirebase(data) {
  // Placeholder for Firebase sync implementation
  return Promise.resolve();
}

async function clearPendingData() {
  // Placeholder for clearing pending data
  return Promise.resolve();
}

// Error handling
self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
});

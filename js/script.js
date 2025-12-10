// 🔹 Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyAhdDjXA062s-2giS1nj2sii3DEMlI-w0E",
  authDomain: "publicalertmap.firebaseapp.com",
  projectId: "publicalertmap",
  storageBucket: "publicalertmap.appspot.com",
  messagingSenderId: "120688438688",
  appId: "1:120688438688:web:613b8d5d94c5b8251f48c5"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// 🔹 Utility: Get Nearest Town using Reverse Geocoding
async function getNearestTown(lat, lng) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
  const data = await response.json();
  return data.address?.town || data.address?.city || data.address?.village || "Unknown Location";
}
// 🔹 Initialize Map
const map = L.map('map').setView([7.6500, 79.9000], 9);
document.getElementById('zoom-in-btn').addEventListener('click', () => {
  map.zoomIn();
});

document.getElementById('zoom-out-btn').addEventListener('click', () => {
  map.zoomOut();
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

let incidentChart;
let routeControl = null;
const incidentTypes = ["Flood", "Fire", "Roadblock", "RoadAccident", "PowerCut", "PublicViolence", "Other"];
const chartColors = ['#264653', '#287271', '#2a9d8f', '#8ab17d', '#e9c46a', '#f4a261', '#e76f51'];

function getCurrentMonthYear() {
  const now = new Date();
  return now.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function initIncidentChart() {
  const ctx = document.getElementById('incidentChart').getContext('2d');
  incidentChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: incidentTypes,
      datasets: [{
        label: 'Incidents',
        data: new Array(incidentTypes.length).fill(0),
        backgroundColor: chartColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

  // Set dynamic title
  document.getElementById('chart-title').innerText = getCurrentMonthYear();

  // Create custom legend manually
  const legendContainer = document.getElementById('chart-legend');
  legendContainer.innerHTML = ""; // Clear previous

  incidentTypes.forEach((type, index) => {
    const item = document.createElement('div');
    item.className = 'chart-legend-item';
    item.innerHTML = `
      <div class="chart-legend-color" style="background-color:${chartColors[index]}"></div>
      ${type}
    `;
    legendContainer.appendChild(item);
  });
}



// 🔹 User click to select location
let selectedLatLng = null;
map.on('click', function (e) {
  const point = [e.latlng.lng, e.latlng.lat]; // Note: leaflet-pip uses [lng, lat]
  const isInside = leafletPip.pointInLayer(point, window.focusBoundary);

  if (isInside.length > 0) {
    selectedLatLng = e.latlng;
    showToast(`✅ Location selected: ${selectedLatLng.lat.toFixed(4)}, ${selectedLatLng.lng.toFixed(4)}`);
  } else {
    showToast("❌ Please select a location within the designated area.");
  }
});


// 🔹 Filter + Load existing incidents
const incidentLayerGroup = L.layerGroup().addTo(map);

function getSelectedTypes() {
  return Array.from(document.querySelectorAll('.filter-check'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}

document.querySelectorAll('.filter-check').forEach(cb => {
  cb.addEventListener('change', loadIncidentsFromFirestore);
});

document.getElementById('filter-date-btn').addEventListener('click', loadIncidentsFromFirestore);




function getIcon(type) {
  const iconUrl = `img/${type.toLowerCase()}.png`;
  return L.icon({
    iconUrl: iconUrl,
    iconSize: [25, 25],
    iconAnchor: [12, 25],
    popupAnchor: [0, -20]
  });
}

// 🔹 Load incidents from Firestore
async function loadIncidentsFromFirestore() {
  incidentLayerGroup.clearLayers();

  const selectedTypes = getSelectedTypes();
  const { startDate, endDate } = getDateFilters();

  let query = db.collection("incidents");

  // Filter by type
  if (selectedTypes.length > 0) {
    query = query.where("type", "in", selectedTypes);
  }

  // Filter by date range (use raw Date objects)
  if (startDate && endDate) {
    query = query
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate);
  } else if (startDate) {
    query = query.where("timestamp", ">=", startDate);
  } else if (endDate) {
    query = query.where("timestamp", "<=", endDate);
  }

  try {
    const snapshot = await query.get();

    snapshot.forEach(doc => {
      const data = doc.data();

      const marker = L.marker([data.lat, data.lng], {
        icon: getIcon(data.type)
      }).addTo(incidentLayerGroup);

updateIncidentChart();

      
const incidentDate = data.timestamp ? data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp) : null;
const formattedDate = incidentDate ? incidentDate.toLocaleString() : "N/A";

 let popupHtml = `
  <div class="popup-content" data-id="${doc.id}">
    <div class="confirmation-info" style="font-weight:bold; color:green; margin-bottom:6px;">
      ✅ Confirmed by ${data.confirmations || 0} people
    </div>
    <b>Type:</b> ${data.type}<br>
    <b>Description:</b> ${data.description}<br>
    <b>Location:</b> ${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}<br>
    <b>Date:</b> ${formattedDate}<br>
    ${data.imageUrl ? `<br><img src="${data.imageUrl}" class="incident-image">` : ""}
    <br>
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 6px;">
      <button class="confirm-btn" data-id="${doc.id}">Confirm Incident</button>
         </div>
  </div>
`;


marker.bindPopup(popupHtml);

showMonthMessage();

    });
  } catch (err) {
    console.error("❌ Firestore query failed:", err);
    ashowToast("Failed to load incidents. See console for details.");
  }
}



loadIncidentsFromFirestore();

// 🔹 Submit New Incident
async function submitIncident() {
  const type = document.getElementById('incidentType').value;
  const description = document.getElementById('description').value;
  const imageFile = document.getElementById('image').files[0];

  if (!selectedLatLng) {
    showToast("⚠️ Please click on the map to select the location.");
    return;
  }

  if (!description) {
    showToast("⚠️ Please enter a description.");
    return;
  }

  let imageUrl = "";
  if (imageFile) {
    const imageRef = storage.ref(`incidents/${Date.now()}_${imageFile.name}`);
    await imageRef.put(imageFile);
    imageUrl = await imageRef.getDownloadURL();
  }

  const newIncident = {
    type,
    description,
    lat: selectedLatLng.lat,
    lng: selectedLatLng.lng,
    imageUrl,
    timestamp: new Date(),
    confirmations: 0,
    confirmedBy: []
  };

  await db.collection("incidents").add(newIncident);

// 🔹 Send Telegram Notification
const nearestTown = await getNearestTown(newIncident.lat, newIncident.lng);

const googleMapsViewLink = `https://www.google.com/maps?q=${newIncident.lat},${newIncident.lng}`;
const googleMapsDirectionsLink = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${newIncident.lat},${newIncident.lng}`;

// Conditional heading
const heading = (type === "Other")
  ? `🚨 *Incident reported near ${nearestTown}*`
  : `🚨 *${type} near ${nearestTown}*`;

// Build Telegram message
const telegramMessage = `${heading}\n\n` +
  `*Details:* ${description}\n` +
  `[View Location](${googleMapsViewLink})\n` +
  `[Get Directions](${googleMapsDirectionsLink})\n` +
  `Reported At: ${new Date().toLocaleString()}\n\n` +
  `Stay alert and follow safety guidelines.\n#WayambaWatch #PublicAlert`;

const telegramUrl = `https://api.telegram.org/bot8308815089:AAGY5YqG-OGrfTw8HpBoPS29uhzls_R0UGk/sendMessage?chat_id=@wayambawatch&text=${encodeURIComponent(telegramMessage)}&parse_mode=Markdown`;

fetch(telegramUrl)
  .then(res => {
    if (!res.ok) throw new Error("Failed to send Telegram message");
    console.log("📤 Telegram message sent!");
  })
  .catch(err => {
    console.error("❌ Telegram error:", err);
  });

  showToast("✅ Incident submitted successfully!");
  updateIncidentChart();


  // Clear form
  document.getElementById('description').value = "";
  document.getElementById('image').value = "";
  selectedLatLng = null;

  // Immediately add marker
  const marker = L.marker([newIncident.lat, newIncident.lng], {
    icon: getIcon(type)
  }).addTo(map);

 const now = new Date();
const formattedDate = now.toLocaleString();

showMonthMessage();


let popupHtml = `
  <div class="popup-content" data-id="${doc.id}">
    <div class="confirmation-info" style="font-weight:bold; color:green; margin-bottom:6px;">
      ✅ Confirmed by ${data.confirmations || 0} people
    </div>
    <b>Type:</b> ${data.type}<br>
    <b>Description:</b> ${data.description}<br>
    <b>Location:</b> ${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}<br>
    <b>Date:</b> ${formattedDate}<br>
    ${data.imageUrl ? `<br><img src="${data.imageUrl}" class="incident-image">` : ""}
    <br>
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 6px;">
      <button class="confirm-btn" data-id="${doc.id}">Confirm Incident</button>
          </div>
  </div>
`;


marker.bindPopup(popupHtml);

}
// Add event listener for form submission
document.getElementById('locate-btn').addEventListener('click', function () {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Remove previous locate marker if you want (optional)
      if (window.userLocationMarker) {
        map.removeLayer(window.userLocationMarker);
      }

      // Create custom icon
      const userIcon = L.icon({
        iconUrl: 'img/user.png',  // Use your custom icon here
        iconSize: [30, 30],   // Adjust size as needed
        iconAnchor: [15, 30], // Point of the icon which will correspond to marker's location
        popupAnchor: [0, -25] // Position of popup relative to icon
      });

      // Add marker with custom icon
      window.userLocationMarker = L.marker([lat, lng], { icon: userIcon })
        .addTo(map)
        .bindPopup("You are here!")
        .openPopup();

      // Zoom to user location
     map.setZoom(15); // More zoom
      setTimeout(() => {
        map.panTo([lat, lng], {
          animate: true
        });
      }, 200);

    },
    () => {
      showToast('Unable to retrieve your location.');
    }
  );
});

// Add the GeoJSON focus area
fetch('data/focus-districts.geojson')
  .then(res => res.json())
  .then(geojson => {
    window.focusBoundary = L.geoJSON(geojson, {
        style: {
        color: '#4d615f',       // Border color
        fillColor: '#b6baccff',   // Fill color
        fillOpacity: 0.2,       // Transparency
        weight: 2
      }
    }).addTo(map);

    // Zoom to focus area
    map.fitBounds(focusBoundary.getBounds());
  })
  .catch(err => {
    console.error('Error loading GeoJSON:', err);
    showToast('Failed to load focus area layer. Check console for details.');
  });

function getDateFilters() {
  const startDateInput = document.getElementById('start-date').value;
  const endDateInput = document.getElementById('end-date').value;

  let startDate = null;
  let endDate = null;

  if (startDateInput) {
    startDate = new Date(startDateInput);
  }

  if (endDateInput) {
    endDate = new Date(endDateInput);
    endDate.setHours(23, 59, 59, 999);
  }

  // ✅ Set default to current month if no input
  if (!startDate && !endDate) {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// Add search functionality
// Declare a variable to hold the current search marker
let currentSearchMarker = null;

document.getElementById('search-btn').addEventListener('click', async () => {
  const query = document.getElementById('location-search').value.trim();

  if (!query) {
    showToast("Please enter a location to search.");
    return;
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    const results = await response.json();

    if (results.length === 0) {
      showToast("No results found.");
      return;
    }

    const place = results[0];
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    map.setView([lat, lon], 13);

    // ❌ Remove the previous marker if it exists
    if (currentSearchMarker) {
      map.removeLayer(currentSearchMarker);
    }

    // ✅ Add new marker and store it in the variable
    currentSearchMarker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(place.display_name)
      .openPopup();

  } catch (err) {
    console.error("Geocoding failed", err);
    showToast("Something went wrong while searching.");
  }
});
const animation = lottie.loadAnimation({
  container: document.getElementById('lottie-animation'), // HTML element
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: 'animations/location.json' // Path to your Lottie JSON file
});

document.getElementById('today-btn').addEventListener('click', loadTodayIncidents);

async function loadTodayIncidents() {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Convert to Firestore Timestamps
  const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfDay);
  const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfDay);

  let query = db.collection("incidents")
    .where("timestamp", ">=", startTimestamp)
    .where("timestamp", "<=", endTimestamp);

  const selectedTypes = getSelectedTypes();
  if (selectedTypes.length > 0) {
    query = query.where("type", "in", selectedTypes);
  }

  incidentLayerGroup.clearLayers();

  try {
    const snapshot = await query.get();

    if (snapshot.empty) {
      showToast("No incidents found for today.");
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();

      const marker = L.marker([data.lat, data.lng], {
        icon: getIcon(data.type)
      }).addTo(incidentLayerGroup);

      const incidentDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
      const formattedDate = incidentDate.toLocaleString();

     let popupHtml = `
      <div class="popup-content" data-id="${doc.id}">
        <div class="confirmation-info" style="font-weight:bold; color:green; margin-bottom:6px;">
          ✅ Confirmed by ${data.confirmations || 0} people
        </div>
        <b>Type:</b> ${data.type}<br>
        <b>Description:</b> ${data.description}<br>
        <b>Location:</b> ${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}<br>
        <b>Date:</b> ${formattedDate}<br>
        ${data.imageUrl ? `<br><img src="${data.imageUrl}" class="incident-image">` : ""}
        <br>
        <div style="display: flex; justify-content: center; gap: 10px; margin-top: 6px;">
          <button class="confirm-btn" data-id="${doc.id}">Confirm Incident</button>
        </div>
      </div>
    `;

      marker.bindPopup(popupHtml);
    });

  } catch (error) {
    console.error("Error fetching today's incidents:", error);
    showToast("Failed to load today's incidents.");
  }
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.classList.add("toast");

  if (type === "success") toast.style.backgroundColor = "#28a745";
  else if (type === "error") toast.style.backgroundColor = "#dc3545";
  else if (type === "warning") toast.style.backgroundColor = "#ffc107";
  else toast.style.backgroundColor = "#333"; // default

  toast.innerText = message;
  document.getElementById("toast-container").appendChild(toast);

  // Remove after animation
  setTimeout(() => {
    toast.remove();
  }, 4000);
}
map.on('popupopen', function (e) {
  const confirmBtn = e.popup._contentNode.querySelector('.confirm-btn');
  const directionBtn = e.popup._contentNode.querySelector('.direction-btn');

  // 🔹 Handle Confirm Button
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const incidentId = confirmBtn.getAttribute('data-id');

      const key = `confirmed_${incidentId}`;
      if (localStorage.getItem(key)) {
        showToast("You've already confirmed this incident.", "warning");
        return;
      }

      try {
        await db.collection("incidents").doc(incidentId).update({
          confirmations: firebase.firestore.FieldValue.increment(1)
        });
        localStorage.setItem(key, "true");
        showToast("✅ Thanks for confirming!", "success");
        loadIncidentsFromFirestore(); // reload updated confirmation count
      } catch (err) {
        console.error("Error confirming:", err);
        showToast("❌ Failed to confirm incident.", "error");
      }
    });
  }

  // 🔹 Handle Directions Button
  if (directionBtn) {
    directionBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast("Geolocation not supported.");
        return;
      }

      navigator.geolocation.getCurrentPosition((position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const destLat = parseFloat(directionBtn.getAttribute('data-lat'));
        const destLng = parseFloat(directionBtn.getAttribute('data-lng'));

        // Remove previous route if exists
        if (routeControl) {
          map.removeControl(routeControl);
        }

        // Add route to map
        routeControl = L.Routing.control({
          waypoints: [
            L.latLng(userLat, userLng),
            L.latLng(destLat, destLng)
          ],
          routeWhileDragging: false,
          addWaypoints: false,
          draggableWaypoints: false,
          showAlternatives: false,
          createMarker: () => null,
          lineOptions: {
            styles: [{ color: '#0d6efd', weight: 5 }]
          }
        }).addTo(map);

      }, () => {
        showToast("Unable to get your current location.", "error");
      });
    });
  }
});



const tipsByIncident = [
  {
    type: "Flood",
    tips: [
      "Move to higher ground immediately.",
      "Avoid walking or driving through flood water.",
      "Disconnect electrical appliances if safe.",
    ],
  },
  {
    type: "Public Violence",
    tips: [
      "Stay indoors and away from windows.",
      "Avoid the area and do not engage.",
      "Follow verified news sources only.",
    ],
  },
  {
    type: "Fire",
    tips: [
      "Evacuate the area immediately.",
      "Do not use elevators.",
      "Call emergency services right away.",
    ],
  },
  {
    type: "Road Accident",
    tips: [
      "Do not crowd the scene.",
      "Call for medical help immediately.",
      "Help only if you're trained.",
    ],
  },
  {
    type: "Power Cut",
    tips: [
      "Use flashlights, not candles.",
      "Unplug sensitive devices.",
      "Stay informed via mobile data or radio.",
    ],
  },
];

let tipIndex = 0;
function updateTip() {
  const current = tipsByIncident[tipIndex];
  const randomTip = current.tips[Math.floor(Math.random() * current.tips.length)];
  document.getElementById("tip-text").innerHTML = `<strong>${current.type}:</strong> ${randomTip}`;
  tipIndex = (tipIndex + 1) % tipsByIncident.length;
}

// Start cycling tips every 8 seconds
updateTip();
setInterval(updateTip, 4000);

lottie.loadAnimation({
  container: document.getElementById('tip-animation'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: 'animations/alert.json' // replace with your correct JSON file
});
initIncidentChart();
updateIncidentChart();
function updateIncidentChart() {
  document.getElementById('chart-title').innerText = getCurrentMonthYear();

  const selectedTypes = getSelectedTypes();
  const { startDate, endDate } = getDateFilters();

  let query = db.collection("incidents");

  if (selectedTypes.length > 0) {
    query = query.where("type", "in", selectedTypes);
  }

  if (startDate && endDate) {
    query = query.where("timestamp", ">=", startDate).where("timestamp", "<=", endDate);
  } else if (startDate) {
    query = query.where("timestamp", ">=", startDate);
  } else if (endDate) {
    query = query.where("timestamp", "<=", endDate);
  }

  query.get().then(snapshot => {
    const counts = {};
    incidentTypes.forEach(t => counts[t] = 0);

    snapshot.forEach(doc => {
      const data = doc.data();
      if (counts[data.type] !== undefined) {
        counts[data.type]++;
      }
    });

    incidentChart.data.datasets[0].data = incidentTypes.map(type => counts[type] || 0);
    incidentChart.update();
  }).catch(err => {
    console.error("Error updating chart:", err);
    showToast("❌ Failed to update chart.");
  });
}

function showMonthMessage() {
  const now = new Date();
  const monthYear = now.toLocaleString('default', { month: 'long', year: 'numeric' }); // 👈 includes year
  const label = document.getElementById('map-month-label');
  label.textContent = `Showing incidents of ${monthYear}`;
  label.style.opacity = 1;

  setTimeout(() => {
    label.style.opacity = 0;
  }, 3000);
}



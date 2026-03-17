const API_BASE = "http://lmpss3.dev.spsejecna.net/procedure2.php";

function make_base_auth(user, password) {
    return "Basic " + btoa(user + ":" + password);
}

const username = "coffe";
const password = "kafe";
const AUTH_HEADER = make_base_auth(username, password);

let selectedCounts = {};

window.changeCount = function(id, delta) {
    if (selectedCounts[id] === undefined) selectedCounts[id] = 0;
    
    let current = selectedCounts[id] + delta;
    if (current < 0) current = 0;
    
    selectedCounts[id] = current;
    const countElement = document.getElementById(`cnt-${id}`);
    if (countElement) {
        countElement.innerText = current;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadDrinks();
    syncOfflineData();
});

window.addEventListener('online', () => {
    showMessage("Připojení obnoveno! Synchronizuji data...");
    syncOfflineData();
});

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}?cmd=getPeopleList`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Authorization': AUTH_HEADER
            }
        });

        const data = await response.json();
        const select = document.getElementById('user-select');
        const lastUserId = localStorage.getItem('lastPijak');
        
        Object.values(data).forEach(user => {
            const option = document.createElement('option');
            option.value = user.ID;
            option.textContent = user.name;
            if (user.ID === lastUserId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Chyba při načítání uživatelů", err);
    }
}

async function loadDrinks() {
    try {
        const response = await fetch(`${API_BASE}?cmd=getTypesList`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Authorization': AUTH_HEADER
            }
        });

        const data = await response.json();
        const container = document.getElementById('drink-list');
        container.innerHTML = '';

        Object.values(data).forEach(drink => {
            selectedCounts[drink.ID] = 0;
            
            const item = document.createElement('div');
            item.className = 'drink-item';
            item.innerHTML = `
                <span class="drink-name" id="name-${drink.ID}">${drink.typ}</span>
                <div class="controls">
                    <button class="btn-circle" onclick="window.changeCount('${drink.ID}', -1)">−</button>
                    <span class="count" id="cnt-${drink.ID}">0</span>
                    <button class="btn-circle" onclick="window.changeCount('${drink.ID}', 1)">+</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        console.error("Chyba při načítání drinků", err);
        const container = document.getElementById('drink-list');
        container.innerHTML = "Jste offline. Nabídka se nenačetla.";
    }
}

function showMessage(text, isError = false) {
    const msgBox = document.getElementById('status-message');
    msgBox.textContent = text;
    msgBox.className = 'status-message ' + (isError ? 'status-error' : 'status-success');
}

function resetForm() {
    Object.keys(selectedCounts).forEach(id => {
        selectedCounts[id] = 0;
        const countElement = document.getElementById(`cnt-${id}`);
        if (countElement) {
            countElement.innerText = 0;
        }
    });
}

function saveOfflineOrder(payload) {
    let offlineOrders = JSON.parse(localStorage.getItem('offlineOrders')) || [];
    offlineOrders.push(payload);
    localStorage.setItem('offlineOrders', JSON.stringify(offlineOrders));
}

async function syncOfflineData() {
    let offlineOrders = JSON.parse(localStorage.getItem('offlineOrders')) || [];
    
    if (offlineOrders.length === 0 || !navigator.onLine) return;

    let remainingOrders = [];

    for (const payload of offlineOrders) {
        try {
            const response = await fetch(`${API_BASE}?cmd=saveDrinks`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': AUTH_HEADER
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                remainingOrders.push(payload);
            }
        } catch (err) {
            remainingOrders.push(payload);
        }
    }

    localStorage.setItem('offlineOrders', JSON.stringify(remainingOrders));
    
    if (remainingOrders.length === 0 && offlineOrders.length > 0) {
        showMessage("Offline data byla úspěšně odeslána na server!");
    }
}

document.getElementById('send-data').addEventListener('click', async () => {
    const userId = document.getElementById('user-select').value;
    
    if (!userId) {
        showMessage("Nejdříve vyberte uživatele.", true);
        return;
    }

    localStorage.setItem('lastPijak', userId);

    const drinksPayload = Object.keys(selectedCounts).map(id => {
        const typeName = document.getElementById(`name-${id}`).innerText;
        return {
            type: typeName,
            value: selectedCounts[id]
        };
    });

    const totalDrinks = drinksPayload.reduce((sum, drink) => sum + drink.value, 0);
    if (totalDrinks === 0) {
        showMessage("Nevybrali jste žádné položky.", true);
        return;
    }

    const payload = {
        user: userId,
        drinks: drinksPayload
    };

    if (!navigator.onLine) {
        saveOfflineOrder(payload);
        showMessage("Jste offline. Uloženo do paměti (odešle se po připojení).", true);
        resetForm();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}?cmd=saveDrinks`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_HEADER
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showMessage("Posláno.");
            resetForm();
            syncOfflineData();
        } else {
            saveOfflineOrder(payload);
            showMessage("Chyba serveru. Uloženo pro pozdější odeslání.", true);
            resetForm();
        }
    } catch (err) {
        saveOfflineOrder(payload);
        showMessage("Server nedostupný. Uloženo offline.", true);
        resetForm();
    }
});
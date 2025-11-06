// --- 1. Firebase Auth and Initialization ---

// Import functions from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
// Import Firestore functions
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Your Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyCuo69DgYtxCdVRmRvziVfnS69koYMGJ0E",
  authDomain: "dashboard-1fb59.firebaseapp.com",
  projectId: "dashboard-1fb59",
  storageBucket: "dashboard-1fb59.firebasestorage.app",
  messagingSenderId: "576174466807",
  appId: "1:576174466807:web:eef62f64e35b69560815f2",
  measurementId: "G-213LH7WH40"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore

// --- Global variables for Firestore ---
let currentUserId = null;
let tasksCollectionRef = null;
let tasksUnsubscribe = null; // To stop listening when user logs out
let addressesCollectionRef = null;
let addressesUnsubscribe = null; // To stop listening when user logs out
let unitStatusCollectionRef = null;
let unitStatusUnsubscribe = null;
let maintenanceCollectionRef = null; // ADDED
let maintenanceUnsubscribe = null; // ADDED

// Get DOM elements for auth
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const signOutButton = document.getElementById('sign-out-button');

// --- SHARED HELPER FUNCTIONS (MOVED HERE) ---
function formatFirestoreTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate(); // Convert Firestore Timestamp to JS Date
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

function setLoading(isLoading, btn, txt, spinner) {
    if (!btn || !txt || !spinner) return;
    btn.disabled = isLoading;
    if (isLoading) {
        txt.style.display = 'none';
        spinner.style.display = 'inline-block';
    } else {
        txt.style.display = 'inline-block';
        spinner.style.display = 'none';
    }
}

function showMessage(box, message, type) {
    if (!box) return;
    box.textContent = message;
    box.className = 'mt-6 text-center text-sm p-4 rounded-md'; // Reset classes
    
    if (type === 'success') {
        box.classList.add('bg-green-100', 'text-green-800');
    } else {
        box.classList.add('bg-red-100', 'text-red-800');
    }
    box.classList.remove('hidden');
    setTimeout(() => {
        box.classList.add('hidden');
    }, 5000);
}

function showListMessage(area, message, type) {
    if (!area) return;
    area.textContent = message;
    area.classList.remove('hidden', 'text-gray-500', 'text-red-600', 'text-green-600');
    if (type === 'error') {
        area.classList.add('text-red-600');
    } else if (type === 'success') {
        area.classList.add('text-green-600');
    } else {
        area.classList.add('text-gray-500');
    }
    area.classList.remove('hidden');
}

// --- Script for Unit Status (FIRESTORE) ---
function setupUnitStatusTabListener() {
    const container = document.getElementById('unit-status-tab');
    if (!container) {
        console.error("Unit Status container not found.");
        return;
    }

    // --- Form Elements ---
    const form = container.querySelector('#update-form');
    const submitButton = container.querySelector('#submit-button-unit');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonSpinner = submitButton.querySelector('.button-spinner');
    const messageBox = container.querySelector('#message-box-unit');
    const locationInput = container.querySelector('#location');
    const commentsInput = container.querySelector('#comments');

    // --- List Elements ---
    const statusContainer = container.querySelector('#unit-status-container');
    const messageArea = container.querySelector('#status-message-area');
    
    // --- Setup Firestore Collection Reference ---
    unitStatusCollectionRef = collection(db, 'unitStatus');

    // --- Event Listeners ---

    // Update form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true, submitButton, buttonText, buttonSpinner);

            try {
                const formData = new FormData(form);
                const unitId = formData.get('unit');
                
                if (!unitId) {
                    showMessage(messageBox, 'You must select a unit.', 'error');
                    setLoading(false, submitButton, buttonText, buttonSpinner); // ADDED: Stop loading on validation error
                    return;
                }

                const data = {
                    unit: unitId,
                    status: formData.get('status'),
                    location: formData.get('location'),
                    comments: formData.get('comments'),
                    reported: serverTimestamp() // Add Firestore timestamp
                };

                // Use setDoc to create or overwrite the document with unitId as the ID
                const unitDocRef = doc(db, 'unitStatus', unitId);
                await setDoc(unitDocRef, data);

                showMessage(messageBox, 'Unit status updated.', 'success');
                form.reset();
                // Reset defaults
                if (locationInput) locationInput.value = 'STATION 75';
                if (commentsInput) commentsInput.value = '-';
            } catch (error) {
                console.error("Error updating unit status: ", error);
                showMessage(messageBox, error.message, 'error');
            } finally {
                setLoading(false, submitButton, buttonText, buttonSpinner);
            }
        });
    }

    // --- Real-time Firestore Listener ---
    function activateUnitStatusRealtimeListener() {
        showListMessage(messageArea, 'Loading statuses...', 'info');
        
        if (unitStatusUnsubscribe) {
            unitStatusUnsubscribe();
        }

        const q = query(unitStatusCollectionRef);

        unitStatusUnsubscribe = onSnapshot(q, (querySnapshot) => {
            if (!statusContainer) return;
            statusContainer.innerHTML = ''; 
            
            if (querySnapshot.empty) {
                showListMessage(messageArea, 'No unit statuses found.', 'info');
            } else {
                showListMessage(messageArea, `Showing ${querySnapshot.size} units.`, 'info');
                const units = [];
                querySnapshot.forEach((doc) => {
                    units.push(doc.data());
                });

                // Sort units alphabetically by unit name
                units.sort((a, b) => a.unit.localeCompare(b.unit));
                
                units.forEach((unit) => {
                    statusContainer.appendChild(createStatusCard(unit));
                });
            }
        }, (error) => {
            console.error("Error listening to unit status: ", error);
            showListMessage(messageArea, 'Error loading statuses. Check console.', 'error');
        });
    }

    // Call the listener when the tab is clicked
    const unitStatusTabButton = document.querySelector('.tab-button[data-tab="unit-status-tab"]');
    if (unitStatusTabButton) {
        unitStatusTabButton.addEventListener('click', (e) => {
            if (!unitStatusUnsubscribe) {
                activateUnitStatusRealtimeListener();
            }
            // Set defaults when tab is clicked
            if (locationInput) locationInput.value = 'STATION 75';
            if (commentsInput) commentsInput.value = '-';
        });
    }

    // --- Card Creation ---
    function createStatusCard(unit) {
        const card = document.createElement('div');
        card.className = 'p-3 border border-gray-200 rounded-lg shadow-sm bg-white';
        
        let statusColor = 'text-gray-700';
        let statusBG = 'bg-gray-100';

        if (unit.status === 'In Service') {
            statusColor = 'text-green-800';
            statusBG = 'bg-green-100';
        } else if (unit.status === 'Limited Service') {
            statusColor = 'text-yellow-800';
            statusBG = 'bg-yellow-100';
        } else if (unit.status === 'OOS') {
            statusColor = 'text-red-800';
            statusBG = 'bg-red-100';
        }

        card.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="text-lg font-bold text-gray-900">${unit.unit}</h3>
                <span class="text-sm font-medium px-3 py-1 rounded-full ${statusBG} ${statusColor}">${unit.status}</span>
            </div>
            <div class="text-sm text-gray-600 space-y-1 mt-2 pt-2 border-t border-gray-100">
                <p><strong>Location:</strong> ${unit.location}</p>
                <p><strong>Comments:</strong> ${unit.comments}</p>
                <p class="text-xs text-gray-400">Reported: ${formatFirestoreTimestamp(unit.reported)}</p>
            </div>
        `;
        return card;
    }

    // --- Helper Functions ---
    // MOVED TO GLOBAL SCOPE
    
} // End of setupUnitStatusTabListener

// --- Script for Daily Tasks (FIRESTORE) ---
// This function is called once the user logs in (from the onAuthStateChanged listener)
function setupTaskTabListener() {
    const container = document.getElementById('daily-tasks-tab');
    if (!container) {
        console.error("Daily Tasks container not found. DOM might not be ready.");
        return;
    }

    // --- Create Form Elements ---
    const form = container.querySelector('#task-form');
    const submitButton = container.querySelector('#submit-button-task');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonSpinner = submitButton.querySelector('.button-spinner');
    const messageBox = container.querySelector('#message-box-task');

    // --- List Elements ---
    const tasksContainer = container.querySelector('#existing-tasks-container');
    const tasksMessageArea = container.querySelector('#tasks-message-area');

    // --- Edit Modal Elements ---
    const modal = document.getElementById('edit-task-modal');
    const closeModalButton = document.getElementById('task-modal-close-button');
    const cancelModalButton = document.getElementById('edit-task-cancel-button');
    const editForm = document.getElementById('edit-task-form');
    const saveButton = document.getElementById('edit-task-save-button');
    
    // Store the ID of the task being edited
    let currentEditTaskId = null; 

    // --- Setup Firestore Collection Reference ---
    // This is the path where tasks are stored, specific to the logged-in user
    // UPDATED: Now points to the shared 'dailyTasks' collection
    tasksCollectionRef = collection(db, 'dailyTasks');


    // --- Event Listeners ---

    // Create form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true, submitButton, buttonText, buttonSpinner);

            try {
                // Get data from form
                const formData = new FormData(form);
                const data = {
                    task: formData.get('Task'),
                    assignee: formData.get('Assignee'),
                    day: formData.get('Day to appear'),
                    createdAt: serverTimestamp() // Add a timestamp
                };

                // Add a new document to the 'dailyTasks' collection
                await addDoc(tasksCollectionRef, data);

                showMessage(messageBox, 'Task added successfully.', 'success'); // MODIFIED
                form.reset();
            } catch (error) {
                console.error("Error adding task: ", error);
                showMessage(messageBox, error.message, 'error'); // MODIFIED
            } finally {
                setLoading(false, submitButton, buttonText, buttonSpinner);
            }
        });
    }

    // --- Real-time Firestore Listener ---
    function activateRealtimeListener() {
        showListMessage(tasksMessageArea, 'Loading tasks...', 'info'); // MODIFIED
        
        // Detach any old listener
        if (tasksUnsubscribe) {
            tasksUnsubscribe();
        }

        // Create a query to get all tasks
        const q = query(tasksCollectionRef);

        // onSnapshot is the real-time listener
        tasksUnsubscribe = onSnapshot(q, (querySnapshot) => {
            if (!tasksContainer) return; // Safety check
            tasksContainer.innerHTML = ''; // Clear the list
            if (querySnapshot.empty) {
                showListMessage(tasksMessageArea, 'No tasks found. Add one to get started!', 'info'); // MODIFIED
            } else {
                showListMessage(tasksMessageArea, `Showing ${querySnapshot.size} tasks.`, 'info'); // MODIFIED
                
                querySnapshot.forEach((doc) => {
                    const task = doc.data();
                    // Add the document ID (task.id) to the data object
                    task.id = doc.id; 
                    tasksContainer.appendChild(createTaskCard(task));
                });
            }
        }, (error) => {
            console.error("Error listening to tasks: ", error);
            showListMessage(tasksMessageArea, 'Error loading tasks. Check console.', 'error'); // MODIFIED
        });
    }

    // Call the listener when the tab is clicked
    const tasksTabButton = document.querySelector('.tab-button[data-tab="daily-tasks-tab"]');
    if (tasksTabButton) {
        tasksTabButton.addEventListener('click', (e) => {
            // Only start the listener if it's not already running
            if (!tasksUnsubscribe) {
                activateRealtimeListener();
            }
        });
    }
    
    // --- Task Card & Actions ---
    function createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'p-3 border border-gray-200 rounded-lg shadow-sm bg-white';
        
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="text-base font-bold text-gray-900">${task.task}</h3>
                <div class="flex-shrink-0 flex space-x-2">
                    <button class="edit-task-button text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-1 px-3 rounded-md transition">Edit</button>
                    <button class="delete-task-button text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition">Delete</button>
                </div>
            </div>
            <div class="text-sm text-gray-600 space-y-1 pt-2 mt-1 border-t border-gray-100">
                <p><strong>Assignee:</strong> ${task.assignee}</p>
                <p><strong>Day:</strong> ${task.day}</p>
            </div>
        `;

        // Edit Button
        card.querySelector('.edit-task-button').addEventListener('click', () => {
            showEditTaskModal(task);
        });

        // Delete Button
        const deleteButton = card.querySelector('.delete-task-button');
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteButton.classList.contains('pending-delete')) {
                handleDeleteTask(task.id, deleteButton); // Use task.id
            } else {
                // Reset other delete buttons
                document.querySelectorAll('.delete-task-button.pending-delete, .delete-address-button.pending-delete, .delete-maintenance-button.pending-delete').forEach(btn => { // MODIFIED
                    btn.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                    btn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                    btn.textContent = 'Delete';
                });
                // Set this button to confirm state
                deleteButton.classList.add('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                deleteButton.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                deleteButton.textContent = 'Are you sure?';
            }
        });
        
        return card;
    }

    async function handleDeleteTask(taskId, button) {
        button.disabled = true;
        button.textContent = 'Deleting...';

        try {
            // Create a reference to the specific document
            const taskDocRef = doc(db, 'dailyTasks', taskId);
            // Delete the document
            await deleteDoc(taskDocRef);
            
            // No need to show success message, listener will auto-update list
        } catch (error) {
            console.error("Error deleting task: ", error);
            showListMessage(tasksMessageArea, error.message, 'error'); // MODIFIED
            // Reset button on error
            button.disabled = false;
            button.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
            button.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
            button.textContent = 'Delete';
        }
    }

    // --- Edit Modal Functions ---
    if (closeModalButton) {
        closeModalButton.addEventListener('click', hideEditTaskModal);
    }
    if (cancelModalButton) {
        cancelModalButton.addEventListener('click', hideEditTaskModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideEditTaskModal();
        });
    }
    if (editForm) {
        editForm.addEventListener('submit', handleUpdateTask);
    }

    function showEditTaskModal(task) {
        currentEditTaskId = task.id; // Store the ID
        editForm.querySelector('#edit-task-task').value = task.task;
        editForm.querySelector('#edit-task-assignee').value = task.assignee;
        editForm.querySelector('#edit-task-day').value = task.day;
        modal.style.display = 'block';
    }

    function hideEditTaskModal() {
        currentEditTaskId = null;
        modal.style.display = 'none';
        editForm.reset();
    }

    async function handleUpdateTask(e) {
        e.preventDefault();
        if (!currentEditTaskId) return; // Safety check

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            // Get data from edit form
            const formData = new FormData(editForm);
            const data = {
                task: formData.get('Task'),
                assignee: formData.get('Assignee'),
                day: formData.get('Day to appear'),
            };

            // Create reference to the document and update it
            const taskDocRef = doc(db, 'dailyTasks', currentEditTaskId);
            await setDoc(taskDocRef, data, { merge: true }); // merge: true preserves other fields like createdAt

            hideEditTaskModal();
            // No need to show message, list updates automatically
        } catch (error) {
            console.error("Error updating task: ", error);
            showListMessage(tasksMessageArea, error.message, 'error'); // MODIFIED
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }

    // --- Helper Functions (using shared ones) ---
    // Re-using setLoading, showMessage, showListMessage from Unit Status
    // Just pass the correct element to them

}; // End of setupTaskTabListener

// --- Script for Notable Addresses (FIRESTORE) ---
// This function is called once the user logs in (from the onAuthStateChanged listener)
function setupAddressesTabListener() {
    const container = document.getElementById('notable-addresses-tab');
    if (!container) {
        console.error("Notable Addresses container not found. DOM might not be ready.");
        return;
    }

    // --- Create Form Elements ---
    const form = container.querySelector('#contact-form');
    const submitButton = container.querySelector('#submit-button-address');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonSpinner = submitButton.querySelector('.button-spinner');
    const messageBox = container.querySelector('#status-message-address');

    // --- List Elements ---
    const addressesContainer = container.querySelector('#existing-addresses-container');
    const addressesMessageArea = container.querySelector('#addresses-message-area');

    // --- Edit Modal Elements ---
    const modal = document.getElementById('edit-address-modal');
    const closeModalButton = document.getElementById('address-modal-close-button');
    const cancelModalButton = document.getElementById('edit-address-cancel-button');
    const editForm = document.getElementById('edit-address-form');
    const saveButton = document.getElementById('edit-address-save-button');
    
    // Store the ID of the address being edited
    let currentEditAddressId = null; 

    // --- Setup Firestore Collection Reference ---
    // **** THIS IS THE FIX ****
    // Was: collection(db, 'notableAddresses');
    addressesCollectionRef = collection(db, 'addressNotes');


    // --- Event Listeners ---

    // Create form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true, submitButton, buttonText, buttonSpinner);

            try {
                // Get data from form
                const formData = new FormData(form);
                const data = {
                    address: formData.get('Address'),
                    note: formData.get('Note'),
                    priority: formData.get('Priority'),
                    createdAt: serverTimestamp() // Add a timestamp
                };

                // Add a new document to the 'addressNotes' collection
                await addDoc(addressesCollectionRef, data);

                showMessage(messageBox, 'Address added successfully.', 'success'); // MODIFIED
                form.reset();
            } catch (error) {
                console.error("Error adding address: ", error);
                showMessage(messageBox, error.message, 'error'); // MODIFIED
            } finally {
                setLoading(false, submitButton, buttonText, buttonSpinner);
            }
        });
    }

    // --- Real-time Firestore Listener ---
    function activateAddressRealtimeListener() {
        showListMessage(addressesMessageArea, 'Loading addresses...', 'info'); // MODIFIED
        
        // Detach any old listener
        if (addressesUnsubscribe) {
            addressesUnsubscribe();
        }

        // Create a query to get all addresses
        const q = query(addressesCollectionRef);

        // onSnapshot is the real-time listener
        addressesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            if (!addressesContainer) return; // Safety check
            addressesContainer.innerHTML = ''; // Clear the list
            if (querySnapshot.empty) {
                showListMessage(addressesMessageArea, 'No addresses found. Add one to get started!', 'info'); // MODIFIED
            } else {
                showListMessage(addressesMessageArea, `Showing ${querySnapshot.size} addresses.`, 'info'); // MODIFIED
                
                querySnapshot.forEach((doc) => {
                    const address = doc.data();
                    // Add the document ID (address.id) to the data object
                    address.id = doc.id; 
                    addressesContainer.appendChild(createAddressCard(address));
                });
            }
        }, (error) => {
            console.error("Error listening to addresses: ", error);
            showListMessage(addressesMessageArea, 'Error loading addresses. Check console.', 'error'); // MODIFIED
        });
    }

    // Call the listener when the tab is clicked
    const addressesTabButton = document.querySelector('.tab-button[data-tab="notable-addresses-tab"]');
    if (addressesTabButton) {
        addressesTabButton.addEventListener('click', (e) => {
            // Only start the listener if it's not already running
            if (!addressesUnsubscribe) {
                activateAddressRealtimeListener();
            }
        });
    }
    
    // --- Address Card & Actions ---
    function createAddressCard(address) {
        const card = document.createElement('div');
        card.className = 'p-4 border border-gray-200 rounded-lg shadow-sm bg-white space-y-2';
        
        let priorityColorClass = 'text-gray-700';
        let priorityBGClass = 'bg-gray-100';

        if (address.priority === 'Red') {
            priorityColorClass = 'text-red-800';
            priorityBGClass = 'bg-red-100';
        } else if (address.priority === 'Yellow') {
            priorityColorClass = 'text-yellow-800';
            priorityBGClass = 'bg-yellow-100';
        } else if (address.priority === 'Green') {
            priorityColorClass = 'text-green-800';
            priorityBGClass = 'bg-green-100';
        }

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-lg font-bold text-gray-900">${address.address}</h3>
                </div>
                <div class="flex-shrink-0 flex space-x-2">
                    <button class="edit-address-button text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-1 px-3 rounded-md transition">Edit</button>
                    <button class="delete-address-button text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition">Delete</button>
                </div>
            </div>
            <p class="text-gray-700">${address.note}</p>
            <div class="text-sm text-gray-600 space-y-1 pt-2 border-t border-gray-100">
                <p><strong>Priority:</strong> <span class="font-medium px-2 py-0.5 rounded ${priorityBGClass} ${priorityColorClass}">${address.priority}</span></p>
            </div>
        `;

        // Edit Button
        card.querySelector('.edit-address-button').addEventListener('click', () => {
            showEditAddressModal(address);
        });

        // Delete Button
        const deleteButton = card.querySelector('.delete-address-button');
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteButton.classList.contains('pending-delete')) {
                handleDeleteAddress(address.id, deleteButton); // Use address.id
            } else {
                // Reset other delete buttons
                document.querySelectorAll('.delete-task-button.pending-delete, .delete-address-button.pending-delete, .delete-maintenance-button.pending-delete').forEach(btn => { // MODIFIED
                    btn.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                    btn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                    btn.textContent = 'Delete';
                });
                // Set this button to confirm state
                deleteButton.classList.add('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                deleteButton.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                deleteButton.textContent = 'Are you sure?';
            }
        });
        
        return card;
    }

    async function handleDeleteAddress(addressId, button) {
        button.disabled = true;
        button.textContent = 'Deleting...';

        try {
            // Create a reference to the specific document
            const addressDocRef = doc(db, 'addressNotes', addressId);
            // Delete the document
            await deleteDoc(addressDocRef);
            
            // No need to show success message, listener will auto-update list
        } catch (error) {
            console.error("Error deleting address: ", error);
            showListMessage(addressesMessageArea, error.message, 'error'); // MODIFIED
            // Reset button on error
            button.disabled = false;
            button.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
            button.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
            button.textContent = 'Delete';
        }
    }

    // --- Edit Modal Functions ---
    if (closeModalButton) {
        closeModalButton.addEventListener('click', hideEditAddressModal);
    }
    if (cancelModalButton) {
        cancelModalButton.addEventListener('click', hideEditAddressModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideEditAddressModal();
        });
    }
    if (editForm) {
        editForm.addEventListener('submit', handleUpdateAddress);
    }

    function showEditAddressModal(address) {
        currentEditAddressId = address.id; // Store the ID
        editForm.querySelector('#edit-address-address').value = address.address;
        editForm.querySelector('#edit-address-note').value = address.note;
        editForm.querySelector('#edit-address-priority').value = address.priority;
        modal.style.display = 'block';
    }

    function hideEditAddressModal() {
        currentEditAddressId = null;
        modal.style.display = 'none';
        editForm.reset();
    }

    async function handleUpdateAddress(e) {
        e.preventDefault();
        if (!currentEditAddressId) return; // Safety check

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            // Get data from edit form
            const formData = new FormData(editForm);
            const data = {
                address: formData.get('Address'),
                note: formData.get('Note'),
                priority: formData.get('Priority'),
            };

            // Create reference to the document and update it
            const addressDocRef = doc(db, 'addressNotes', currentEditAddressId);
            await setDoc(addressDocRef, data, { merge: true }); // merge: true preserves other fields

            hideEditAddressModal();
            // No need to show message, list updates automatically
        } catch (error) {
            console.error("Error updating address: ", error);
            showListMessage(addressesMessageArea, error.message, 'error'); // MODIFIED
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }

    // --- Helper Functions (using shared ones) ---
    // Re-using setLoading, showMessage, showListMessage from Unit Status
    // Just pass the correct element to them

}; // End of setupAddressesTabListener

// --- NEW Script for Maintenance (FIRESTORE) ---
function setupMaintenanceTabListener() {
    const container = document.getElementById('maintenance-tab');
    if (!container) {
        console.error("Maintenance container not found. DOM might not be ready.");
        return;
    }

    // --- Create Form Elements ---
    const form = container.querySelector('#maintenance-form');
    const submitButton = container.querySelector('#submit-button-maintenance');
    const buttonText = submitButton.querySelector('.button-text');
    const buttonSpinner = submitButton.querySelector('.button-spinner');
    const messageBox = container.querySelector('#message-box-maintenance');

    // --- List Elements ---
    const maintenanceContainer = container.querySelector('#existing-maintenance-container');
    const maintenanceMessageArea = container.querySelector('#maintenance-message-area');

    // --- Edit Modal Elements ---
    const modal = document.getElementById('edit-maintenance-modal');
    const closeModalButton = document.getElementById('maintenance-modal-close-button');
    const cancelModalButton = document.getElementById('edit-maintenance-cancel-button');
    const editForm = document.getElementById('edit-maintenance-form');
    const saveButton = document.getElementById('edit-maintenance-save-button');
    
    // Store the ID of the entry being edited
    let currentEditMaintenanceId = null; 

    // --- Setup Firestore Collection Reference ---
    maintenanceCollectionRef = collection(db, 'maintenance');

    // --- Event Listeners ---

    // Create form submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(true, submitButton, buttonText, buttonSpinner);

            try {
                // Get data from form
                const formData = new FormData(form);
                const data = {
                    vendor: formData.get('Vendor'),
                    service: formData.get('Service'),
                    location: formData.get('Location'),
                    date: formData.get('Date'), // Stores date as YYYY-MM-DD string
                    createdAt: serverTimestamp() // Add a timestamp
                };

                // Add a new document to the 'maintenance' collection
                await addDoc(maintenanceCollectionRef, data);

                showMessage(messageBox, 'Entry added successfully.', 'success');
                form.reset();
            } catch (error) {
                console.error("Error adding entry: ", error);
                showMessage(messageBox, error.message, 'error');
            } finally {
                setLoading(false, submitButton, buttonText, buttonSpinner);
            }
        });
    }

    // --- Real-time Firestore Listener ---
    function activateMaintenanceRealtimeListener() {
        showListMessage(maintenanceMessageArea, 'Loading entries...', 'info');
        
        // Detach any old listener
        if (maintenanceUnsubscribe) {
            maintenanceUnsubscribe();
        }

        // Create a query to get all entries
        const q = query(maintenanceCollectionRef);

        // onSnapshot is the real-time listener
        maintenanceUnsubscribe = onSnapshot(q, (querySnapshot) => {
            if (!maintenanceContainer) return; // Safety check
            maintenanceContainer.innerHTML = ''; // Clear the list
            if (querySnapshot.empty) {
                showListMessage(maintenanceMessageArea, 'No maintenance entries found.', 'info');
            } else {
                showListMessage(maintenanceMessageArea, `Showing ${querySnapshot.size} entries.`, 'info');
                
                const entries = [];
                querySnapshot.forEach((doc) => {
                    const entry = doc.data();
                    entry.id = doc.id; 
                    entries.push(entry);
                });

                // Sort by date (newest first)
                entries.sort((a, b) => new Date(b.date) - new Date(a.date));

                entries.forEach((entry) => {
                    maintenanceContainer.appendChild(createMaintenanceCard(entry));
                });
            }
        }, (error) => {
            console.error("Error listening to entries: ", error);
            showListMessage(maintenanceMessageArea, 'Error loading entries. Check console.', 'error');
        });
    }

    // Call the listener when the tab is clicked
    const maintenanceTabButton = document.querySelector('.tab-button[data-tab="maintenance-tab"]');
    if (maintenanceTabButton) {
        maintenanceTabButton.addEventListener('click', (e) => {
            // Only start the listener if it's not already running
            if (!maintenanceUnsubscribe) {
                activateMaintenanceRealtimeListener();
            }
        });
    }
    
    // --- Maintenance Card & Actions ---
    function createMaintenanceCard(entry) {
        const card = document.createElement('div');
        card.className = 'p-3 border border-gray-200 rounded-lg shadow-sm bg-white';
        
        // Format date for display
        let displayDate = 'N/A';
        if (entry.date) {
             try {
                // JS Date constructor handles YYYY-MM-DD strings correctly (as UTC)
                const date = new Date(entry.date + 'T00:00:00'); // Treat as local time
                displayDate = date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC' // Specify timezone to avoid off-by-one day issues
                });
            } catch (e) {
                displayDate = entry.date; // fallback
            }
        }

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="text-base font-bold text-gray-900">${entry.service}</h3>
                <div class="flex-shrink-0 flex space-x-2">
                    <button class="edit-maintenance-button text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-1 px-3 rounded-md transition">Edit</button>
                    <button class="delete-maintenance-button text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition">Delete</button>
                </div>
            </div>
            <div class="text-sm text-gray-600 space-y-1 pt-2 mt-1 border-t border-gray-100">
                <p><strong>Vendor:</strong> ${entry.vendor}</p>
                <p><strong>Location:</strong> ${entry.location}</p>
                <p><strong>Date:</strong> ${displayDate}</p>
            </div>
        `;

        // Edit Button
        card.querySelector('.edit-maintenance-button').addEventListener('click', () => {
            showEditMaintenanceModal(entry);
        });

        // Delete Button
        const deleteButton = card.querySelector('.delete-maintenance-button');
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteButton.classList.contains('pending-delete')) {
                handleDeleteMaintenanceEntry(entry.id, deleteButton); // Use entry.id
            } else {
                // Reset other delete buttons
                document.querySelectorAll('.delete-task-button.pending-delete, .delete-address-button.pending-delete, .delete-maintenance-button.pending-delete').forEach(btn => {
                    btn.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                    btn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                    btn.textContent = 'Delete';
                });
                // Set this button to confirm state
                deleteButton.classList.add('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                deleteButton.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                deleteButton.textContent = 'Are you sure?';
            }
        });
        
        return card;
    }

    async function handleDeleteMaintenanceEntry(entryId, button) {
        button.disabled = true;
        button.textContent = 'Deleting...';

        try {
            // Create a reference to the specific document
            const entryDocRef = doc(db, 'maintenance', entryId);
            // Delete the document
            await deleteDoc(entryDocRef);
            
            // No need to show success message, listener will auto-update list
        } catch (error) {
            console.error("Error deleting entry: ", error);
            showListMessage(maintenanceMessageArea, error.message, 'error');
            // Reset button on error
            button.disabled = false;
            button.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
            button.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
            button.textContent = 'Delete';
        }
    }

    // --- Edit Modal Functions ---
    if (closeModalButton) {
        closeModalButton.addEventListener('click', hideEditMaintenanceModal);
    }
    if (cancelModalButton) {
        cancelModalButton.addEventListener('click', hideEditMaintenanceModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideEditMaintenanceModal();
        });
    }
    if (editForm) {
        editForm.addEventListener('submit', handleUpdateMaintenanceEntry);
    }

    function showEditMaintenanceModal(entry) {
        currentEditMaintenanceId = entry.id; // Store the ID
        editForm.querySelector('#edit-maintenance-vendor').value = entry.vendor;
        editForm.querySelector('#edit-maintenance-service').value = entry.service;
        editForm.querySelector('#edit-maintenance-location').value = entry.location;
        editForm.querySelector('#edit-maintenance-date').value = entry.date;
        modal.style.display = 'block';
    }

    function hideEditMaintenanceModal() {
        currentEditMaintenanceId = null;
        modal.style.display = 'none';
        editForm.reset();
    }

    async function handleUpdateMaintenanceEntry(e) {
        e.preventDefault();
        if (!currentEditMaintenanceId) return; // Safety check

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            // Get data from edit form
            const formData = new FormData(editForm);
            const data = {
                vendor: formData.get('Vendor'),
                service: formData.get('Service'),
                location: formData.get('Location'),
                date: formData.get('Date'),
            };

            // Create reference to the document and update it
            const entryDocRef = doc(db, 'maintenance', currentEditMaintenanceId);
            await setDoc(entryDocRef, data, { merge: true }); // merge: true preserves other fields like createdAt

            hideEditMaintenanceModal();
            // No need to show message, list updates automatically
        } catch (error) {
            console.error("Error updating entry: ", error);
            showListMessage(maintenanceMessageArea, error.message, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }

    // --- HELPER FUNCTIONS (REMOVED, NOW GLOBAL) ---

}; // End of setupMaintenanceTabListener


// Auth state listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        currentUserId = user.uid;
        dashboardContainer.classList.remove('hidden');
        loginContainer.classList.add('hidden');
        
        // --- FIX FOR JUMPING ---
        // Remove the centering classes from the body
        // so the dashboard sits at the top.
        document.body.classList.remove('flex', 'items-center', 'justify-center');
        // --- END OF FIX ---
        
        // --- MODIFIED CALL to Initialize Firestore listener ---
        // Wait for DOM to be ready before setting up listeners
        if (document.readyState === 'loading') {
            // Loading hasn't finished yet
            document.addEventListener('DOMContentLoaded', () => {
                setupUnitStatusTabListener(); 
                setupTaskTabListener();
                setupAddressesTabListener(); 
                setupMaintenanceTabListener(); // ADDED
            });
        } else {
            // DOM is already loaded
            setupUnitStatusTabListener(); 
            setupTaskTabListener();
            setupAddressesTabListener(); 
            setupMaintenanceTabListener(); // ADDED
        }

    } else {
        // User is signed out
        currentUserId = null;
        dashboardContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');

        // --- FIX FOR JUMPING ---
        // Add the centering classes back for the login form
        document.body.classList.add('flex', 'items-center', 'justify-center');
        // --- END OF FIX ---

        // --- Stop Firestore listener ---
        if (tasksUnsubscribe) {
            tasksUnsubscribe();
            tasksUnsubscribe = null;
        }
        
        if (addressesUnsubscribe) {
            addressesUnsubscribe();
            addressesUnsubscribe = null;
        }
        
        if (unitStatusUnsubscribe) {
            unitStatusUnsubscribe();
            unitStatusUnsubscribe = null;
        }

        if (maintenanceUnsubscribe) { // ADDED
            maintenanceUnsubscribe();
            maintenanceUnsubscribe = null;
        }
    }
});

// Login form submit event
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        
        loginError.classList.add('hidden'); // Hide old errors

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in
                // The onAuthStateChanged listener will handle showing the dashboard
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error("Login Error:", errorCode, errorMessage);
                loginError.textContent = "Error: Invalid email or password.";
                loginError.classList.remove('hidden');
            });
    });
}

// Sign out button click event
if (signOutButton) {
    signOutButton.addEventListener('click', () => {
        signOut(auth).catch((error) => {
            console.error("Sign Out Error:", error);
        });
    });
}


// --- 2. Google Apps Script & Form Logic ---

// 
// !!! IMPORTANT !!!
// DEPLOY THE `code.gs` SCRIPT TO YOUR NEW GOOGLE SHEET.
// PASTE THE *ONE* WEB APP URL HERE.
//
const MASTER_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyeXvTXB6A7XiTyK4GI0C_G7M42RCacfDvBCtf-AQ-whJFFERrlTo5OIahHXoA30P4O/exec';
//
// !!!!!!!!!!!!!!!!!
//


document.addEventListener('DOMContentLoaded', function() {
    
    // --- Tab Switching Logic ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Update button active state
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');

            // Update panel active state
            tabPanels.forEach(panel => {
                if (panel.id === targetTab) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });

            // --- REMOVED THE SCROLL FIX ---
            // We are now fixing the jump by removing
            // the flex properties on the body tag
            // --- END OF REMOVAL ---
        });
    });

    // Set the first tab as active on load
    if (tabButtons.length > 0) {
        tabButtons[0].click(); 
    }

    // --- Reset "Are you sure?" delete buttons if user clicks elsewhere ---
    document.addEventListener('click', (e) => {
        // Check if the click is outside any delete button
        if (!e.target.closest('.delete-post-button, .delete-address-button, .delete-task-button, .delete-maintenance-button')) { // MODIFIED
            document.querySelectorAll('.pending-delete').forEach(btn => {
                btn.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                btn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                btn.textContent = 'Delete';
            });
        }
    }, true); // Use capture phase to catch clicks early


    // --- Form Logic ---

    // --- Script for News Feed (from newsfeedform.html) ---
    (function() {
        const container = document.getElementById('news-feed-tab');
        if (!container) return;
        
        const form = container.querySelector('#data-form');
        const submitButton = container.querySelector('#submit-button');
        const buttonText = container.querySelector('#button-text');
        const buttonLoader = container.querySelector('#button-loader');
        const messageBox = container.querySelector('#message-box-news');
        const messageText = container.querySelector('#message-text-news');

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                
                if (MASTER_WEB_APP_URL.includes('PASTE_YOUR_ONE_DEPLOYED_CODE_GS_URL_HERE')) {
                    showMessage('Error: Please set the MASTER_WEB_APP_URL in the HTML script block.', 'error');
                    return;
                }

                // Show loader and disable button
                buttonText.classList.add('hidden');
                buttonLoader.classList.remove('hidden');
                submitButton.disabled = true;
                
                const formData = new FormData(form);
                const dataObject = Object.fromEntries(formData.entries());
                dataObject.action = 'addPost';

                fetch(MASTER_WEB_APP_URL, { 
                    method: 'POST',
                    body: JSON.stringify(dataObject),
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    },
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.status === 'success') {
                        showMessage('Success! Your data has been submitted.', 'success');
                        form.reset();
                        // fetchPosts(); // Note: fetchPosts is defined in another IIFE, might need refactor if immediate refresh is needed
                    } else {
                        throw new Error(data.message || 'An unknown error occurred.');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showMessage(`Error: ${error.message}`, 'error');
                })
                .finally(() => {
                    // Hide loader and re-enable button
                    buttonText.classList.remove('hidden');
                    buttonLoader.classList.add('hidden');
                    submitButton.disabled = false;
                });
            });
        }
        
        function showMessage(message, type) {
            if (!messageText || !messageBox) return;
            messageText.textContent = message;
            messageBox.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');

            if (type === 'success') {
                messageBox.classList.add('bg-green-100', 'text-green-800');
            } else if (type === 'error') {
                 messageBox.classList.add('bg-red-100', 'text-red-800');
            }
            messageBox.classList.remove('hidden');
            setTimeout(() => {
                 messageBox.classList.add('hidden');
            }, 5000); // Hide after 5 seconds
        }
    })();


    // --- News Feed Post Management (Fetch, Edit, Delete) ---
    (function() {
        const container = document.getElementById('news-feed-tab');
        if (!container) return;

        const refreshButton = container.querySelector('#refresh-posts-button');
        const refreshIcon = container.querySelector('#refresh-icon');
        const refreshSpinner = container.querySelector('#refresh-spinner');
        const postsContainer = container.querySelector('#existing-posts-container');
        const messageArea = container.querySelector('#posts-message-area');

        // --- Edit Modal Elements ---
        const modal = document.getElementById('edit-post-modal');
        const closeModalButton = document.getElementById('modal-close-button');
        const cancelModalButton = document.getElementById('edit-cancel-button');
        const editForm = document.getElementById('edit-form');
        const saveButton = document.getElementById('edit-save-button');

        // --- Event Listeners ---
        if (refreshButton) {
            refreshButton.addEventListener('click', fetchPosts);
        }
        
        const newsFeedTabButton = document.querySelector('.tab-button[data-tab="news-feed-tab"]');
        if (newsFeedTabButton) {
            newsFeedTabButton.addEventListener('click', (e) => {
                // We check if the container is visible before fetching
                // This is a small optimization
                if (container.style.display !== 'none' || container.classList.contains('active')) {
                   fetchPosts();
                }
            });
        }
        
        // Trigger fetch on initial load if this tab is active
        if (container.classList.contains('active')) {
            fetchPosts();
        }

        // Close modal listeners (with null checks)
        if (closeModalButton) {
            closeModalButton.addEventListener('click', hideEditModal);
        }
        if (cancelModalButton) {
            cancelModalButton.addEventListener('click', hideEditModal);
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideEditModal();
                }
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', handleUpdatePost);
        }

        /**
         * Fetches posts from the Google Sheet
         */
        async function fetchPosts() {
            if (MASTER_WEB_APP_URL.includes('PASTE_YOUR_ONE_DEPLOYED_CODE_GS_URL_HERE')) {
                showMessage('Error: Please set the MASTER_WEB_APP_URL in the HTML script block.', 'error');
                return;
            }

            setLoading(true);
            if (postsContainer) postsContainer.innerHTML = ''; 
            
            try {
                const response = await fetch(MASTER_WEB_APP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'getPosts' })
                });
                if (!response.ok) throw new Error('Network error');
                const result = await response.json();
                
                if (result.status === 'success') {
                    if (result.data.length > 0) {
                        showMessage('Showing ' + result.data.length + ' posts.', 'info');
                        result.data.forEach(post => {
                            postsContainer.appendChild(createPostCard(post));
                        });
                    } else {
                        showMessage('No posts found.', 'info');
                    }
                } else {
                    throw new Error(result.message || 'Failed to fetch posts.');
                }
            } catch (error) {
                console.error('Error fetching posts:', error);
                showMessage(error.message, 'error');
            } finally {
                setLoading(false);
            }
        }

        /**
         * Creates an HTML card element for a single post
         */
        function createPostCard(post) {
            const card = document.createElement('div');
            card.className = 'p-4 border border-gray-200 rounded-lg shadow-sm bg-white space-y-2';
            card.dataset.post = JSON.stringify(post);

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${post.title}</h3>
                        <p class="text-sm text-gray-500">Posted by: <strong>${post.postedBy}</strong> | Applies to: <strong>${post.appliesTo}</strong></p>
                    </div>
                    <div class="flex-shrink-0 flex space-x-2">
                        <button class="edit-post-button text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-1 px-3 rounded-md transition">Edit</button>
                        <button class="delete-post-button text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded-md transition">Delete</button>
                    </div>
                </div>
                <p class="text-gray-700">${post.description}</p>
                <div class="text-sm text-gray-600 space-y-1 pt-2 border-t border-gray-100">
                    <p><strong>Location:</strong> ${post.location}</p>
                    <p><strong>Post Date:</strong> ${formatSheetDate(post.postDate)}</p>
                    <p><strong>Remove Date:</strong> ${post.removeDate ? formatSheetDate(post.removeDate, false) : 'N/A'}</p>
                </div>
            `;

            // Add event listeners for edit and delete
            const editButton = card.querySelector('.edit-post-button');
            editButton.addEventListener('click', () => {
                showEditModal(post);
            });

            const deleteButton = card.querySelector('.delete-post-button');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop click from bubbling to the document
                
                if (deleteButton.classList.contains('pending-delete')) {
                    handleDeletePost(post.rowId, deleteButton);
                } else {
                    document.querySelectorAll('.pending-delete').forEach(btn => {
                        btn.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                        btn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                        btn.textContent = 'Delete';
                    });
                    
                    deleteButton.classList.add('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                    deleteButton.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                    deleteButton.textContent = 'Are you sure?';
                }
            });
            
            return card;
        }

        /**
         * Deletes a post
         */
        async function handleDeletePost(rowId, button) {
            button.disabled = true;
            button.textContent = 'Deleting...';

            try {
                const response = await fetch(MASTER_WEB_APP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'deletePost', rowId: rowId })
                });
                if (!response.ok) throw new Error('Network error');
                const result = await response.json();

                if (result.status === 'success') {
                    showMessage('Post deleted successfully.', 'success');
                    fetchPosts(); // Refresh the list
                } else {
                    throw new Error(result.message || 'Failed to delete post.');
                }
            } catch (error) {
                console.error('Error deleting post:', error);
                showMessage(error.message, 'error');
                button.disabled = false;
                button.classList.remove('pending-delete', 'bg-red-600', 'hover:bg-red-700', 'text-white');
                button.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-700');
                button.textContent = 'Delete';
            }
        }

        /**
         * Shows the edit modal and populates it with post data
         */
        function showEditModal(post) {
            if (!editForm || !modal) return;
            editForm.querySelector('#edit-row-id').value = post.rowId;
            editForm.querySelector('#edit-title').value = post.title;
            editForm.querySelector('#edit-description').value = post.description;
            editForm.querySelector('#edit-location-news').value = post.location;
            editForm.querySelector('#edit-applies-to').value = post.appliesTo;
            editForm.querySelector('#edit-posted-by').value = post.postedBy;
            
            editForm.querySelector('#edit-post-date').value = convertISOToDateTimeLocal(post.postDate);
            editForm.querySelector('#edit-remove-date').value = post.removeDate ? convertISOToDate(post.removeDate) : '';

            modal.style.display = 'block';
        }

        function hideEditModal() {
            if (modal) modal.style.display = 'none';
            if (editForm) editForm.reset();
        }

        /**
         * Handles the "Save Changes" submission from the edit modal
         */
        async function handleUpdatePost(e) {
            e.preventDefault();
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = 'Saving...';
            }

            const formData = new FormData(editForm);
            const data = Object.fromEntries(formData.entries());
            
            try {
                const response = await fetch(MASTER_WEB_APP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ 
                        action: 'updatePost', 
                        rowId: data.rowId,
                        data: data 
                    })
                });
                if (!response.ok) throw new Error('Network error');
                const result = await response.json();

                if (result.status === 'success') {
                    hideEditModal();
                    showMessage('Post updated successfully.', 'success');
                    fetchPosts(); 
                } else {
                    throw new Error(result.message || 'Failed to update post.');
                }
            } catch (error) {
                console.error('Error updating post:', error);
                showMessage(error.message, 'error');
            } finally {
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.textContent = 'Save Changes';
                }
            }
        }

        function setLoading(isLoading) {
            if (!refreshIcon || !refreshSpinner || !refreshButton) return;
            if (isLoading) {
                refreshIcon.classList.add('hidden');
                refreshSpinner.classList.remove('hidden');
                refreshButton.disabled = true;
                showMessage('Loading posts...', 'info');
            } else {
                refreshIcon.classList.remove('hidden');
                refreshSpinner.classList.add('hidden');
                refreshButton.disabled = false;
            }
        }

        function showMessage(message, type) {
            if (!messageArea) return;
            messageArea.textContent = message;
            messageArea.classList.remove('hidden', 'text-gray-500', 'text-red-600', 'text-green-600');
            if (type === 'error') {
                messageArea.classList.add('text-red-600');
            } else if (type === 'success') {
                messageArea.classList.add('text-green-600');
            } else {
                messageArea.classList.add('text-gray-500');
            }
            messageArea.classList.remove('hidden');
        }

        // --- Date Helper Functions ---
        function formatSheetDate(isoString, includeTime = true) {
            if (!isoString) return 'N/A';
            try {
                const date = new Date(isoString);
                const options = {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                };
                if (includeTime) {
                    options.hour = 'numeric';
                    options.minute = 'numeric';
                }
                return date.toLocaleString('en-US', options);
            } catch (e) {
                return isoString; 
            }
        }
        
        function convertISOToDate(isoString) {
            if (!isoString) return '';
            try {
                const date = new Date(isoString);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                return date.toISOString().slice(0, 10);
            } catch(e) {
                return '';
            }
        }

        function convertISOToDateTimeLocal(isoString) {
            if (!isoString) return '';
            try {
                const date = new Date(isoString);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                return date.toISOString().slice(0, 16);
            } catch(e) {
                return '';
            }
        }

    })();

    /* REMOVED OLD UNIT STATUS SCRIPT */

    // --- Script for Ticker Feed (from tickerfeedform.html) ---
    (function() {
        const container = document.getElementById('ticker-feed-tab');
        if (!container) return;

        const form = container.querySelector('#dataForm-ticker'); 
        const submitButton = container.querySelector('#submitButton-ticker'); 
        const responseMessage = container.querySelector('#responseMessage-ticker'); 

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                if (MASTER_WEB_APP_URL.includes('PASTE_YOUR_ONE_DEPLOYED_CODE_GS_URL_HERE')) {
                    responseMessage.textContent = 'Error: Please set the MASTER_WEB_APP_URL in the HTML script block.';
                    responseMessage.classList.add('text-red-600');
                    return;
                }

                submitButton.disabled = true;
                submitButton.textContent = 'Submitting...';
                responseMessage.textContent = '';
                responseMessage.classList.remove('text-green-600', 'text-red-600');
                
                const formData = new FormData(form);
                const dataObj = Object.fromEntries(formData.entries());
                dataObj.action = 'addSimpleEntry';

                fetch(MASTER_WEB_APP_URL, { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    },
                    body: JSON.stringify(dataObj),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.result === 'success') {
                        responseMessage.textContent = 'Success! Your data has been sent.';
                        responseMessage.classList.add('text-green-600');
                        form.reset(); 
                    } else {
                        throw new Error(data.message || 'An unknown error occurred.');
                    }
                })
                .catch(error => {
                    console.error('Error!', error);
                    responseMessage.textContent = `Error: ${error.message}`;
                    responseMessage.classList.add('text-red-600');
                })
                .finally(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Submit';
                });
            });
        }
    })();

    /* REMOVED OLD NOTABLE ADDRESSES SCRIPT */
    
});
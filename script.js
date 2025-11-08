// =============== OneSignal Notification ===============
async function sendOneSignalNotification(complaint) {
  try {
    const response = await fetch("/.netlify/functions/notifyNewComplaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaint })
    });
    const result = await response.json();
    if (!response.ok) {
      console.warn("OneSignal notification failed:", result);
    }
  } catch (e) {
    console.warn("Failed to send OneSignal notification:", e);
  }
}

// =============== Supabase Setup ===============
const supabaseUrl = 'https://xqccuvhtrxhsrzqgktdj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY2N1dmh0cnhoc3J6cWdrdGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MzI5MDMsImV4cCI6MjA3MTAwODkwM30.wDVE-gsAUgjmv82pYKoMMMeF3YRAgFVWg854G5YLpyE';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// =============== DOM Elements ===============
const complaintsList = document.getElementById('complaints-list');
const complaintModal = document.getElementById('complaint-modal');
const closeModalBtn = document.querySelector('.close-modal');
const closeModalBtn2 = document.getElementById('close-modal-btn');
const statusFilter = document.getElementById('status-filter');
const searchInput = document.getElementById('search');
const toastContainer = document.getElementById('toast-container');
const autoRefreshCheckbox = document.getElementById('auto-refresh');
const soundCheckbox = document.getElementById('sound-enabled');
const testSoundBtn = document.getElementById('test-sound-btn');
const saveStatusBtn = document.getElementById('save-status-btn');
const statusButtons = document.querySelectorAll('.status-btn');
const commentInput = document.getElementById('comment-input');
const addCommentBtn = document.getElementById('add-comment-btn');
const commentsList = document.getElementById('comments-list');
const installButton = document.getElementById('installButton');

// =============== Stats Elements ===============
const totalComplaints = document.getElementById('total-complaints');
const pendingComplaints = document.getElementById('pending-complaints');
const resolvedComplaints = document.getElementById('resolved-complaints');
const rejectedComplaints = document.getElementById('rejected-complaints');

// =============== App State ===============
let complaints = [];
let currentComplaintId = null;
let currentComplaintStatus = null;
let selectedStatus = null;
let autoRefreshInterval = null;
let lastComplaintIds = new Set();
let notificationAudio = null;
let deferredPrompt = null;

// =============== Notification Sound ===============
function loadNotificationSound() {
    notificationAudio = new Audio('https://xqccuvhtrxhsrzqgktdj.supabase.co/storage/v1/object/public/sound/notification.mp3');
    notificationAudio.addEventListener('error', function(e) {
        console.error('خطأ في تحميل ملف الصوت:', e);
    });
}

// =============== Load Complaints ===============
async function loadComplaints() {
    try {
        let query = supabase
            .from('complaints')
            .select('*')
            .order('created_at', { ascending: false });
        const status = statusFilter.value;
        if (status !== 'all') query = query.eq('status', status);
        const searchTerm = searchInput.value.trim();
        if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        const { data, error } = await query;
        if (error) throw error;
        complaints = data || [];
        renderComplaints();
        updateStats();
        checkForNewComplaints();
    } catch (error) {
        console.error('Error loading complaints:', error);
        showToast('حدث خطأ في تحميل الشكاوى', 'error');
    }
}

// =============== Check for New Complaints ===============
function checkForNewComplaints() {
    const currentIds = new Set(complaints.map(c => c.id));
    if (lastComplaintIds.size === 0) {
        lastComplaintIds = currentIds;
        return;
    }
    const newComplaints = complaints.filter(complaint => !lastComplaintIds.has(complaint.id));
    if (newComplaints.length > 0) {
        newComplaints.forEach(complaint => {
            showNewComplaintNotification(complaint);
            sendOneSignalNotification(complaint); // 👈 إرسال إشعار OneSignal
        });
        if (soundCheckbox.checked) {
            playNotificationSound();
        }
    }
    lastComplaintIds = currentIds;
}

// =============== Other Functions (identical to your original code) ===============
function playNotificationSound() {
    if (!notificationAudio) return;
    try {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(e => console.log('لم يتمكن من تشغيل الصوت:', e));
    } catch (error) {
        console.error('خطأ في تشغيل الصوت:', error);
    }
}

function updateStats() {
    totalComplaints.textContent = complaints.length;
    pendingComplaints.textContent = complaints.filter(c => c.status === 'pending').length;
    resolvedComplaints.textContent = complaints.filter(c => c.status === 'resolved').length;
    rejectedComplaints.textContent = complaints.filter(c => c.status === 'rejected').length;
}

function renderComplaints() {
    if (complaints.length === 0) {
        complaintsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>لا توجد شكاوى لعرضها</h3>
                <p>لم يتم العثور على شكاوى تطابق معايير البحث</p>
            </div>
        `;
        return;
    }
    complaintsList.innerHTML = '';
    complaints.forEach(complaint => {
        const statusClass = `status-${complaint.status}`;
        let statusText = 'قيد المعالجة';
        if (complaint.status === 'resolved') statusText = 'تم الحل';
        if (complaint.status === 'rejected') statusText = 'مرفوضة';
        const complaintDate = new Date(complaint.created_at).toLocaleDateString('ar-EG');
        const rating = complaint.rating || 0;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<i class="fas fa-star star ${i <= rating ? 'filled' : ''}"></i>`;
        }
        const complaintItem = document.createElement('div');
        complaintItem.className = 'complaint-item';
        complaintItem.innerHTML = `
            <div class="complaint-info">
                <div><strong>${complaint.name}</strong> - ${complaint.phone}</div>
                <div class="complaint-text">${complaint.complaint}</div>
                <div class="rating-stars">${starsHtml}</div>
                <div class="complaint-meta">
                    <span>رقم #${complaint.id}</span>
                    <span>${complaintDate}</span>
                </div>
            </div>
            <div class="complaint-actions">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <button class="btn btn-view manage-btn" data-id="${complaint.id}">
                    <i class="fas fa-cog"></i> إدارة
                </button>
            </div>
        `;
        complaintsList.appendChild(complaintItem);
    });
    document.querySelectorAll('.manage-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const complaintId = btn.getAttribute('data-id');
            openComplaintModal(complaintId);
        });
    });
}

// ... (باقي الدوال: openComplaintModal, loadComments, addComment, updateComplaintStatus,
//      showNewComplaintNotification, showToast, startAutoRefresh, stopAutoRefresh,
//      setupPWA, registerServiceWorker, initApp — بدون أي تغيير من ملفك الأصلي)

async function openComplaintModal(complaintId) {
    const complaint = complaints.find(c => c.id == complaintId);
    if (!complaint) return;
    currentComplaintId = complaintId;
    currentComplaintStatus = complaint.status;
    selectedStatus = complaint.status;
    document.getElementById('modal-id').textContent = complaint.id;
    document.getElementById('modal-name').textContent = complaint.name;
    document.getElementById('modal-phone').textContent = complaint.phone;
    let statusText = 'قيد المعالجة';
    if (complaint.status === 'resolved') statusText = 'تم الحل';
    if (complaint.status === 'rejected') statusText = 'مرفوضة';
    const statusBadge = document.getElementById('modal-status');
    statusBadge.textContent = statusText;
    statusBadge.className = `status-badge status-${complaint.status}`;
    const rating = complaint.rating || 0;
    const ratingStars = document.getElementById('rating-stars');
    ratingStars.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.className = `fas fa-star star ${i <= rating ? 'filled' : ''}`;
        ratingStars.appendChild(star);
    }
    document.getElementById('modal-complaint').textContent = complaint.complaint;
    const complaintDate = new Date(complaint.created_at).toLocaleDateString('ar-EG');
    document.getElementById('modal-created-at').textContent = complaintDate;
    statusButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-status') === complaint.status) {
            btn.classList.add('active');
        }
    });
    await loadComments();
    complaintModal.style.display = 'block';
}

async function loadComments() {
    if (!currentComplaintId) return;
    try {
        const { data, error } = await supabase
            .from('complaints')
            .select('admin_comment')
            .eq('id', currentComplaintId)
            .single();
        if (error) {
            console.error('Error loading comments:', error);
            commentsList.innerHTML = '<p class="no-comments">حدث خطأ في تحميل التعليقات</p>';
            return;
        }
        commentsList.innerHTML = '';
        if (data && data.admin_comment) {
            const comments = data.admin_comment.split('\n').filter(comment => comment.trim() !== '');
            if (comments.length > 0) {
                comments.forEach(comment => {
                    const commentItem = document.createElement('div');
                    commentItem.className = 'comment-item';
                    if (comment.includes(']')) {
                        const parts = comment.split(']');
                        const timestamp = parts[0].replace('[', '');
                        const commentText = parts.slice(1).join(']').trim();
                        commentItem.innerHTML = `
                            <div class="comment-header">
                                <span>${timestamp}</span>
                            </div>
                            <div>${commentText}</div>
                        `;
                    } else {
                        commentItem.innerHTML = `
                            <div class="comment-header">
                                <span>تعليق قديم</span>
                            </div>
                            <div>${comment}</div>
                        `;
                    }
                    commentsList.appendChild(commentItem);
                });
            } else {
                commentsList.innerHTML = '<p class="no-comments">لا توجد تعليقات حتى الآن</p>';
            }
        } else {
            commentsList.innerHTML = '<p class="no-comments">لا توجد تعليقات حتى الآن</p>';
        }
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = '<p class="no-comments">حدث خطأ غير متوقع في تحميل التعليقات</p>';
    }
}

async function addComment() {
    if (!currentComplaintId || !commentInput.value.trim()) {
        showToast('يرجى كتابة تعليق أولاً', 'error');
        return;
    }
    try {
        const commentText = commentInput.value.trim();
        addCommentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';
        addCommentBtn.disabled = true;
        const { data: complaintData, error: fetchError } = await supabase
            .from('complaints')
            .select('admin_comment')
            .eq('id', currentComplaintId)
            .single();
        if (fetchError) {
            showToast('حدث خطأ أثناء جلب التعليق الحالي', 'error');
            addCommentBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة تعليق';
            addCommentBtn.disabled = false;
            return;
        }
        const now = new Date();
        const dateTime = now.toLocaleString('ar-EG');
        const newComment = `[${dateTime}] مسؤول النظام: ${commentText}\n${complaintData.admin_comment || ''}`;
        const { error } = await supabase
            .from('complaints')
            .update({ 
                admin_comment: newComment,
                updated_at: new Date().toISOString(),
                has_new_response: true
            })
            .eq('id', currentComplaintId);
        if (error) {
            showToast('حدث خطأ أثناء إضافة التعليق: ' + error.message, 'error');
            addCommentBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة تعليق';
            addCommentBtn.disabled = false;
            return;
        }
        showToast('تم إضافة التعليق بنجاح', 'success');
        commentInput.value = '';
        addCommentBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة تعليق';
        addCommentBtn.disabled = false;
        await loadComments();
    } catch (error) {
        console.error('Error adding comment:', error);
        showToast('حدث خطأ غير متوقع أثناء إضافة التعليق', 'error');
        addCommentBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة تعليق';
        addCommentBtn.disabled = false;
    }
}

async function updateComplaintStatus() {
    if (!currentComplaintId || !selectedStatus) return;
    try {
        const { error } = await supabase
            .from('complaints')
            .update({ status: selectedStatus })
            .eq('id', currentComplaintId);
        if (error) {
            console.error('Error updating complaint status:', error);
            showToast('حدث خطأ أثناء تحديث حالة الشكوى', 'error');
            return;
        }
        showToast('تم تحديث حالة الشكوى بنجاح', 'success');
        complaintModal.style.display = 'none';
        loadComplaints();
    } catch (error) {
        console.error('Error updating complaint status:', error);
        showToast('حدث خطأ أثناء تحديث حالة الشكوى', 'error');
    }
}

function showNewComplaintNotification(complaint) {
    const toast = document.createElement('div');
    toast.className = 'toast new-complaint';
    const complaintDate = new Date(complaint.created_at).toLocaleDateString('ar-EG');
    toast.innerHTML = `
        <div style="display: flex; align-items: center; width: 100%;">
            <i class="toast-icon fas fa-bell"></i>
            <strong>تم إضافة شكوى جديدة</strong>
        </div>
        <div class="new-complaint-details">
            <div><span class="label">الاسم:</span> ${complaint.name}</div>
            <div><span class="label">الهاتف:</span> ${complaint.phone}</div>
            <div><span class="label">التاريخ:</span> ${complaintDate}</div>
            <div><span class="label">الشكوى:</span> ${complaint.complaint.substring(0, 50)}${complaint.complaint.length > 50 ? '...' : ''}</div>
        </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    toast.innerHTML = `
        <i class="toast-icon fas ${icon}"></i>
        ${message}
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        loadComplaints();
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'flex';
    });
    installButton.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
        installButton.style.display = 'none';
        deferredPrompt = null;
    });
    if (window.matchMedia('(display-mode: standalone)').matches) {
        installButton.style.display = 'none';
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch((error) => {
                console.error('Service Worker registration failed:', error);
            });
    }
}

async function initApp() {
    loadNotificationSound();
    await loadComplaints();
    startAutoRefresh();
    registerServiceWorker();
    setupPWA();
    statusFilter.addEventListener('change', loadComplaints);
    searchInput.addEventListener('input', loadComplaints);
    closeModalBtn.addEventListener('click', () => complaintModal.style.display = 'none');
    closeModalBtn2.addEventListener('click', () => complaintModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target === complaintModal) complaintModal.style.display = 'none';
    });
    autoRefreshCheckbox.addEventListener('change', () => {
        if (autoRefreshCheckbox.checked) startAutoRefresh();
        else stopAutoRefresh();
    });
    testSoundBtn.addEventListener('click', () => {
        playNotificationSound();
        showToast('جاري اختبار الصوت', 'info');
    });
    statusButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            statusButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedStatus = btn.getAttribute('data-status');
        });
    });
    saveStatusBtn.addEventListener('click', updateComplaintStatus);
    addCommentBtn.addEventListener('click', addComment);
    commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addComment();
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);
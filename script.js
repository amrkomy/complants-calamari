// ======== Supabase الإعدادات ========
const SUPABASE_URL = "https://xczrexzzmmrpdokcitvg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjenJleHp6bW1ycGRva2NpdHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDExNDEsImV4cCI6MjA3NjA3NzE0MX0.RoTn4GQ7yOKhGInH6aIuuXpmlvzFfx0tY6gn9Myx1Gk";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======== متغيرات التطبيق ========
const totalComplaintsEl = document.getElementById('totalComplaints');
const pendingComplaintsEl = document.getElementById('pendingComplaints');
const resolvedComplaintsEl = document.getElementById('resolvedComplaints');
const rejectedComplaintsEl = document.getElementById('rejectedComplaints');
const complaintsTableBody = document.getElementById('complaintsTableBody');
const detailsModal = document.getElementById('detailsModal');
const notificationAlert = document.getElementById('notificationAlert');
const notificationText = document.getElementById('notificationText');
const toast = document.getElementById('toast');
const installPwaBtn = document.getElementById('installPwaBtn');

// متغيرات الردود الجديدة
const commentsList = document.getElementById('commentsList');
const newCommentText = document.getElementById('newCommentText');
const addCommentBtn = document.getElementById('addCommentBtn');

let monthlyChart;
let currentComplaintId = null;
let allBranches = [];
let realtimeChannel = null;
let deferredPrompt = null;
let lastComplaintIds = new Set(); // ← للكشف عن الشكاوى الجديدة

// ======== دالة إرسال إشعار OneSignal عبر Netlify Function داخلي ========
async function sendNotificationToRole(type, data) {
  try {
    const response = await fetch("/.netlify/functions/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data })
    });
    if (!response.ok) {
      console.warn("OneSignal notification failed:", await response.json());
    }
  } catch (e) {
    console.warn("Failed to send OneSignal notification:", e);
  }
}

// ======== تهيئة التطبيق ========
document.addEventListener('DOMContentLoaded', async () => {
  await loadBranches();
  await loadComplaints();
  await loadStats();
  initCharts();
  await loadChartsData();
  setupEventListeners();
  setupRealtimeUpdates();
  setupPWA();
});

function cleanup() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
}

// ======== PWA التثبيت ========
function setupPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });

  installPwaBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        hideInstallButton();
        logAppInstalled();
      } else {
        setTimeout(() => showInstallButton(), 30000);
      }
      deferredPrompt = null;
    }
  });

  window.addEventListener('appinstalled', () => {
    hideInstallButton();
    deferredPrompt = null;
    logAppInstalled();
  });

  if (!isAppInstalled()) {
    setTimeout(() => {
      if (!isAppInstalled() && deferredPrompt) {
        showInstallButton();
      }
    }, 3000);
  }
}

function showInstallButton() {
  if (!isAppInstalled()) {
    installPwaBtn.classList.remove('hidden');
    setTimeout(() => hideInstallButton(), 30000);
  }
}

function hideInstallButton() {
  installPwaBtn.classList.add('hidden');
}

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone ||
         document.referrer.includes('android-app://');
}

function logAppInstalled() {
  console.log('تم تثبيت التطبيق بنجاح');
  showToast('تم تثبيت التطبيق بنجاح على جهازك!', 3000);
}

// ======== الإشعارات المحلية ========
function showNewComplaintNotification(complaint) {
  notificationText.textContent = `شكوى جديدة من ${complaint.customer_name || 'عميل'}`;
  notificationAlert.classList.add('show', 'vibrate');
  playNotificationSound();
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  setTimeout(() => {
    notificationAlert.classList.remove('show', 'vibrate');
  }, 5000);
}

function playNotificationSound() {
  const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');
  audio.volume = 0.3;
  audio.play().catch(() => {});
}

// ======== إدارة الفروع ========
async function loadBranches() {
  try {
    const { data: branches, error } = await supabase
      .from('branches')
      .select('id, name')
      .order('name');
    
    if (!error && branches) {
      allBranches = branches;
      const branchFilter = document.getElementById('complaintFilterBranch');
      branchFilter.innerHTML = '<option value="all">جميع الفروع</option>';
      branches.forEach(b => {
        const option = document.createElement('option');
        option.value = b.id;
        option.textContent = b.name;
        branchFilter.appendChild(option);
      });
    }
  } catch (e) {
    console.error('Error loading branches:', e);
  }
}

// ======== إدارة الشكاوى ========
async function loadComplaints() {
  const status = document.getElementById('complaintFilterStatus').value;
  const branchId = document.getElementById('complaintFilterBranch').value;
  
  try {
    let query = supabase
      .from('complaints')
      .select(`id, customer_name, customer_phone, complaint_text, status, 
              created_at, resolved_at, resolved_by, resolution_notes, 
              branch_id, branches(name)`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (status !== 'all') query = query.eq('status', status);
    if (branchId !== 'all') query = query.eq('branch_id', branchId);

    const { data: complaints, error } = await query;
    
    if (error) throw error;
    
    // ← الكشف عن الشكاوى الجديدة
    const currentIds = new Set(complaints.map(c => c.id));
    const newComplaints = complaints.filter(c => !lastComplaintIds.has(c.id));
    if (newComplaints.length > 0) {
      newComplaints.forEach(complaint => {
        showNewComplaintNotification(complaint);
        // ✅ إرسال إشعار "شكوى جديدة" للإدارة فقط
        sendNotificationToRole("new_complaint", complaint);
      });
    }
    lastComplaintIds = currentIds;

    renderComplaintsTable(complaints || []);
  } catch (e) {
    console.error('Error loading complaints:', e);
    showToast('حدث خطأ أثناء تحميل الشكاوى', 3000);
  }
}

function renderComplaintsTable(complaints) {
  complaintsTableBody.innerHTML = '';
  
  if (complaints.length === 0) {
    complaintsTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:20px">
          لا توجد شكاوى متطابقة مع معايير البحث
        </td>
      </tr>`;
    return;
  }

  complaints.forEach(c => {
    const tr = document.createElement('tr');
    const date = new Date(c.created_at).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const statusClass = {
      pending: 'status-pending',
      resolved: 'status-resolved',
      rejected: 'status-rejected'
    }[c.status];
    
    const statusText = {
      pending: 'معلقة',
      resolved: 'تم الحل',
      rejected: 'مرفوضة'
    }[c.status];
    
    tr.innerHTML = `
      <td>${date}</td>
      <td>${escapeHtml(c.customer_name)}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td><button class="action-btn view-btn" data-id="${c.id}">
            <i class="fas fa-eye"></i> عرض
          </button></td>`;
    
    complaintsTableBody.appendChild(tr);
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => showComplaintDetails(btn.dataset.id));
  });
}

// ======== الإحصائيات ========
async function loadStats() {
  try {
    const { count: totalCount } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true });
    
    const { count: pendingCount } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const { count: resolvedCount } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');
    
    const { count: rejectedCount } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');
    
    totalComplaintsEl.textContent = totalCount || 0;
    pendingComplaintsEl.textContent = pendingCount || 0;
    resolvedComplaintsEl.textContent = resolvedCount || 0;
    rejectedComplaintsEl.textContent = rejectedCount || 0;
  } catch (e) {
    console.error('Error loading statistics:', e);
  }
}

// ======== الرسوم البيانية ========
function initCharts() {
  const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
  monthlyChart = new Chart(monthlyCtx, {
    type: 'line',
    data: {
      labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
      datasets: [{
        label: 'عدد الشكاوى',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: 'rgba(0,0,0,.2)',
        borderColor: 'rgba(0,0,0,1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
          rtl: true
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

async function loadChartsData() {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('id, created_at, branch_id, branches(name)')
      .gte('created_at', sixMonthsAgo.toISOString());
    
    if (error) throw error;

    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const labels = [];
    const counts = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(monthNames[d.getMonth()]);
      
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const c = complaints.filter(x => {
        const dt = new Date(x.created_at);
        return dt >= d && dt < next;
      }).length;
      
      counts.push(c);
    }
    
    monthlyChart.data.labels = labels;
    monthlyChart.data.datasets[0].data = counts;
    monthlyChart.update();
  } catch (e) {
    console.error('Error loading charts data:', e);
  }
}

// ======== تفاصيل الشكوى ========
async function showComplaintDetails(complaintId) {
  try {
    const { data: c, error } = await supabase
      .from('complaints')
      .select(`id, customer_name, customer_phone, complaint_text, status, 
              created_at, resolved_at, resolved_by, resolution_notes, 
              branch_id, branches(name)`)
      .eq('id', complaintId)
      .single();
    
    if (error) throw error;
    
    currentComplaintId = c.id;
    document.getElementById('detailComplaintId').textContent = c.id;
    document.getElementById('detailComplaintDate').textContent = 
      new Date(c.created_at).toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    
    const statusText = {
      pending: '<span class="status-badge status-pending">معلقة</span>',
      resolved: '<span class="status-badge status-resolved">تم الحل</span>',
      rejected: '<span class="status-badge status-rejected">مرفوضة</span>'
    }[c.status];
    
    document.getElementById('detailComplaintStatus').innerHTML = statusText;
    document.getElementById('detailComplaintText').textContent = c.complaint_text || '';
    document.getElementById('detailComplaintPhone').textContent = c.customer_phone || '-';
    document.getElementById('detailComplaintBranch').textContent = 
      c.branches ? c.branches.name : '-';
    
    const resolutionSection = document.getElementById('resolutionSection');
    if (c.status === 'resolved' || c.status === 'rejected') {
      resolutionSection.style.display = 'block';
      document.getElementById('detailResolutionNotes').textContent = 
        c.resolution_notes || 'لا توجد ملاحظات';
      document.getElementById('detailResolvedBy').textContent = 
        c.resolved_by || 'غير معروف';
      document.getElementById('detailResolvedAt').textContent = 
        c.resolved_at ? new Date(c.resolved_at).toLocaleString('ar-EG', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : 'غير معروف';
    } else {
      resolutionSection.style.display = 'none';
    }
    
    document.getElementById('actionSection').style.display = 'block';
    document.getElementById('detailResolutionText').value = '';
    
    // تحميل الردود
    await loadComplaintComments(c.id);
    
    detailsModal.style.display = 'flex';
  } catch (e) {
    console.error('Error loading complaint details:', e);
    showToast('حدث خطأ أثناء تحميل تفاصيل الشكوى', 3000);
  }
}

// ======== الردود على الشكوى ========
async function loadComplaintComments(complaintId) {
  try {
    const { data: comments, error } = await supabase
      .from('complaint_comments')
      .select('id, author, comment_text, created_at')
      .eq('complaint_id', complaintId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    renderComments(comments || []);
  } catch (e) {
    console.error('Error loading comments:', e);
    showToast('خطأ في تحميل الردود', 3000);
  }
}

function renderComments(comments) {
  commentsList.innerHTML = '';
  
  if (comments.length === 0) {
    commentsList.innerHTML = '<p style="color:#999; font-style:italic;">لا توجد ردود حتى الآن.</p>';
    return;
  }

  comments.forEach(comment => {
    const date = new Date(comment.created_at).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <div class="comment-author">${escapeHtml(comment.author)}</div>
      <div>${escapeHtml(comment.comment_text)}</div>
      <div class="comment-date">${date}</div>
    `;
    commentsList.appendChild(div);
  });
}

async function addComplaintComment() {
  const text = newCommentText.value.trim();
  if (!text) {
    showToast('يرجى كتابة رد قبل الإرسال', 3000);
    return;
  }

  if (!currentComplaintId) {
    showToast('لم يتم تحديد شكوى', 3000);
    return;
  }

  try {
    const { error } = await supabase
      .from('complaint_comments')
      .insert({
        complaint_id: currentComplaintId,
        author: 'المشرف',
        comment_text: text,
        created_at: new Date().toISOString()
      });

    if (error) throw error;

    showToast('تم إضافة الرد بنجاح', 3000);
    newCommentText.value = '';
    await loadComplaintComments(currentComplaintId);
  } catch (e) {
    console.error('Error adding comment:', e);
    showToast('فشل إضافة الرد', 3000);
  }
}

// ======== تحديث حالة الشكوى ========
async function updateComplaintStatus(status) {
  if (!currentComplaintId) return;
  
  const resolutionNotes = document.getElementById('detailResolutionText').value.trim();
  
  try {
    const updateData = {
      status,
      resolved_at: status !== 'pending' ? new Date().toISOString() : null,
      resolved_by: status !== 'pending' ? 'المسؤول' : null,
      resolution_notes: resolutionNotes || null
    };
    
    const { error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', currentComplaintId);
    
    if (error) throw error;
    
    const statusTextMap = {
      pending: 'معلقة',
      resolved: 'تم الحل',
      rejected: 'مرفوضة'
    };
    
    showToast(`تم تحديث حالة الشكوى إلى "${statusTextMap[status]}"`, 3000);
    detailsModal.style.display = 'none';
    
    await loadComplaints();
    await loadStats();
    await loadChartsData();
  } catch (e) {
    console.error('Error updating complaint status:', e);
    showToast('حدث خطأ أثناء تحديث حالة الشكوى', 3000);
  }
}

// ======== التحديثات الفورية ========
function setupRealtimeUpdates() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  
  realtimeChannel = supabase
    .channel('complaints-insert')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'complaints'
    }, (payload) => {
      loadComplaints();
    })
    .subscribe();
}

// ======== دوال مساعدة ========
function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function setupEventListeners() {
  document.getElementById('complaintFilterStatus').addEventListener('change', loadComplaints);
  document.getElementById('complaintFilterBranch').addEventListener('change', loadComplaints);
  document.getElementById('refreshComplaintsBtn').addEventListener('click', loadComplaints);
  
  document.getElementById('closeDetailsBtn').addEventListener('click', () => {
    detailsModal.style.display = 'none';
  });
  
  document.getElementById('resolveBtn').addEventListener('click', () => updateComplaintStatus('resolved'));
  document.getElementById('rejectBtn').addEventListener('click', () => updateComplaintStatus('rejected'));
  document.getElementById('pendingBtn').addEventListener('click', () => updateComplaintStatus('pending'));
  
  addCommentBtn.addEventListener('click', addComplaintComment);
  
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) detailsModal.style.display = 'none';
  });

  // ============ إعدادات زر إرسال الإشعارات ============
  document.getElementById('sendBroadcastBtn').addEventListener('click', () => {
    document.getElementById('broadcastModal').style.display = 'flex';
  });

  document.getElementById('cancelBroadcast').addEventListener('click', () => {
    document.getElementById('broadcastModal').style.display = 'none';
  });

  document.getElementById('confirmBroadcast').addEventListener('click', async () => {
    const title = document.getElementById('broadcastTitle').value.trim();
    const message = document.getElementById('broadcastMessage').value.trim();
    
    if (!message) {
      showToast('نص الإشعار مطلوب', 3000);
      return;
    }
    
    await sendNotificationToRole("broadcast_to_customers", {
      title,
      message,
      url: document.getElementById('broadcastUrl').value.trim() || "https://your-restaurant-site.com/"
    });
    
    showToast('تم إرسال الإشعار للعملاء بنجاح!', 3000);
    document.getElementById('broadcastModal').style.display = 'none';
    // مسح الحقول
    document.getElementById('broadcastTitle').value = '';
    document.getElementById('broadcastMessage').value = '';
    document.getElementById('broadcastUrl').value = '';
  });
}

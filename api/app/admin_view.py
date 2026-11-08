"""Admin Dashboard HTML Generator for Sauti ya Dere.

Provides an authenticated, zero-PII monitoring console for TAWU-Kenya union reps,
developers, and judges to review model telemetry, driver feedback, and SMS logs.
"""


def get_admin_dashboard_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sauti ya Dere — Admin Telemetry & Feedback Monitor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col">

  <!-- AUTH OVERLAY (Passkey Prompt) -->
  <div id="auth-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-200">
      <div class="flex items-center gap-3 mb-4">
        <div class="size-10 rounded-xl bg-[#1E5E3A] flex items-center justify-center text-white font-black text-xl">⚖️</div>
        <div>
          <h2 class="text-xl font-extrabold text-[#0F172A]">Admin Console Login</h2>
          <p class="text-xs text-slate-500">Sauti ya Dere & TAWU-Kenya Advocacy Desk</p>
        </div>
      </div>
      <p class="text-sm text-slate-600 mb-6">Enter your administrative team passkey to access live model telemetry and driver feedback.</p>
      <form id="auth-form" onsubmit="event.preventDefault(); handleAuth(event); return false;" class="space-y-4">
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Admin Passkey</label>
          <input id="passkey-input" type="password" required placeholder="Enter passkey..."
            onkeydown="if (event.key === 'Enter') { event.preventDefault(); handleAuth(event); }"
            class="w-full min-h-12 px-4 rounded-xl border border-slate-300 focus:border-[#1E5E3A] focus:ring-2 focus:ring-[#1E5E3A]/20 outline-none text-sm transition" />
        </div>
        <p id="auth-error" class="text-xs text-red-600 hidden font-bold">Incorrect passkey. Please try again.</p>
        <button id="auth-submit-btn" type="button" onclick="handleAuth(event)" class="w-full min-h-12 bg-[#1E5E3A] hover:bg-[#174A2E] text-white rounded-xl font-bold text-sm transition shadow-md">
          Authenticate & Unlock Dashboard
        </button>
      </form>
    </div>
  </div>

  <!-- MAIN ADMIN DASHBOARD (Initially Hidden until Auth) -->
  <div id="dashboard-content" class="hidden flex-1 flex flex-col">
    <!-- TOP NAVIGATION -->
    <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-[#1E5E3A] flex items-center justify-center text-white font-black text-lg">⚖️</div>
        <div>
          <h1 class="text-lg font-black text-[#0F172A] tracking-tight">Sauti ya Dere <span class="text-xs font-bold text-[#1E5E3A] bg-[#E9F3ED] px-2 py-0.5 rounded-full ml-1 border border-[#B9DCC6]">Admin & Telemetry</span></h1>
          <p class="text-xs text-slate-500">TAWU-Kenya Union Partner & ML Quality Console</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button onclick="refreshData()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition">
          🔄 Refresh Data
        </button>
        <button onclick="logout()" class="px-3 py-1.5 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition border border-red-200">
          Lock Session
        </button>
      </div>
    </header>

    <!-- METRICS OVERVIEW -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Telemetry Events</p>
          <p id="stat-total" class="mt-2 text-3xl font-black text-[#0F172A]">0</p>
          <p class="mt-1 text-xs text-slate-500">Zero-PII dispute pings received</p>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Avg Model Confidence</p>
          <p id="stat-confidence" class="mt-2 text-3xl font-black text-[#1E5E3A]">0.0%</p>
          <p class="mt-1 text-xs text-slate-500">Across SetFit & Gemini inference</p>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Inversion Overrides</p>
          <p id="stat-overrides" class="mt-2 text-3xl font-black text-amber-600">0 <span id="stat-override-pct" class="text-xs font-normal text-slate-500">(0%)</span></p>
          <p class="mt-1 text-xs text-slate-500">Drivers who corrected AI category</p>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Driver Feedback Count</p>
          <p id="stat-feedback" class="mt-2 text-3xl font-black text-blue-600">0</p>
          <p class="mt-1 text-xs text-slate-500">Via App & Shortcode 20384</p>
        </div>
      </div>

      <!-- TABS SECTION -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="flex border-b border-slate-200 px-6 pt-4 gap-6 bg-slate-50/60">
          <button id="tab-btn-telemetry" onclick="switchTab('telemetry')" class="pb-3 text-sm font-bold text-[#1E5E3A] border-b-2 border-[#1E5E3A]">
            🎯 Zero-PII Model Telemetry
          </button>
          <button id="tab-btn-feedback" onclick="switchTab('feedback')" class="pb-3 text-sm font-bold text-slate-500 hover:text-slate-800 border-b-2 border-transparent">
            💬 Driver Feedback & SMS (20384)
          </button>
          <button id="tab-btn-sms" onclick="switchTab('sms')" class="pb-3 text-sm font-bold text-slate-500 hover:text-slate-800 border-b-2 border-transparent">
            📱 Africa's Talking Gateway Logs
          </button>
        </div>

        <!-- TAB 1: TELEMETRY -->
        <div id="tab-content-telemetry" class="p-6 overflow-x-auto">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h3 class="text-base font-extrabold text-[#0F172A]">Edge-Audited AI Model Telemetry</h3>
              <p class="text-xs text-slate-500">Strictly zero-PII: No personal names, phone numbers, or narrative text leaves the client device.</p>
            </div>
            <span class="text-xs font-mono bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">Local-First Guarded</span>
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th class="pb-3">Timestamp (UTC)</th>
                <th class="pb-3">Platform</th>
                <th class="pb-3">Predicted Category</th>
                <th class="pb-3">Confidence</th>
                <th class="pb-3">Inversion Override?</th>
                <th class="pb-3">Entities Captured</th>
                <th class="pb-3">Evidence Readiness</th>
              </tr>
            </thead>
            <tbody id="telemetry-table-body" class="divide-y divide-slate-100 font-medium text-slate-700">
              <tr><td colspan="7" class="py-6 text-center text-slate-400">Loading telemetry records...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- TAB 2: FEEDBACK -->
        <div id="tab-content-feedback" class="p-6 overflow-x-auto hidden">
          <div class="mb-4">
            <h3 class="text-base font-extrabold text-[#0F172A]">Driver Feedback & Grievance Submissions</h3>
            <p class="text-xs text-slate-500">Collected in-app or via 2-Way Africa's Talking SMS (Keyword: <code class="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">kamilimu sauti [message]</code> to 20384).</p>
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th class="pb-3">Timestamp</th>
                <th class="pb-3">Source</th>
                <th class="pb-3">Rating</th>
                <th class="pb-3">Platform</th>
                <th class="pb-3">Phone</th>
                <th class="pb-3 w-1/2">Driver Comment / Suggestion</th>
              </tr>
            </thead>
            <tbody id="feedback-table-body" class="divide-y divide-slate-100 font-medium text-slate-700">
              <tr><td colspan="6" class="py-6 text-center text-slate-400">Loading feedback records...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- TAB 3: SMS LOGS -->
        <div id="tab-content-sms" class="p-6 overflow-x-auto hidden">
          <div class="mb-4">
            <h3 class="text-base font-extrabold text-[#0F172A]">Africa's Talking SMS Gateway Log</h3>
            <p class="text-xs text-slate-500">Dispatches OTP verification codes and NTSA Regulation 15 statutory timeline reminders.</p>
          </div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th class="pb-3">Timestamp</th>
                <th class="pb-3">Direction</th>
                <th class="pb-3">Type</th>
                <th class="pb-3">Recipient / Sender</th>
                <th class="pb-3">Status</th>
                <th class="pb-3 w-1/2">Message Text</th>
              </tr>
            </thead>
            <tbody id="sms-table-body" class="divide-y divide-slate-100 font-medium text-slate-700">
              <tr><td colspan="6" class="py-6 text-center text-slate-400">Loading SMS logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <footer class="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-400">
      &copy; 2026 Sauti ya Dere &bull; Developed in partnership with the Transport & Allied Workers Union (TAWU-Kenya) &bull; NTSA Legal Notice 120 Compliance Engine
    </footer>
  </div>

  <script>
    let currentPasskey = sessionStorage.getItem('admin_passkey') || '';

    // Check if previously authenticated
    window.addEventListener('DOMContentLoaded', () => {
      if (currentPasskey) {
        verifyAndLoad(currentPasskey);
      }
    });

    async function handleAuth(event) {
      event.preventDefault();
      const passkey = document.getElementById('passkey-input').value.trim();
      await verifyAndLoad(passkey);
    }

    async function verifyAndLoad(passkey) {
      const btn = document.getElementById('auth-submit-btn') || document.querySelector('#auth-form button');
      if (btn) btn.textContent = 'Authenticating...';
      const authError = document.getElementById('auth-error');
      authError.classList.add('hidden');
      try {
        const res = await fetch(`/api/admin/data?passkey=${encodeURIComponent(passkey)}`, {
          headers: { 'X-Admin-Passkey': passkey }
        });
        if (res.ok) {
          currentPasskey = passkey;
          sessionStorage.setItem('admin_passkey', passkey);
          const modal = document.getElementById('auth-modal');
          modal.style.display = 'none';
          modal.classList.remove('flex');
          modal.classList.add('hidden');
          const dash = document.getElementById('dashboard-content');
          dash.style.display = 'flex';
          dash.classList.remove('hidden');
          dash.classList.add('flex');
          authError.classList.add('hidden');
          const data = await res.json();
          renderDashboard(data);
        } else {
          authError.textContent = 'Incorrect passkey. Please check and retry.';
          authError.classList.remove('hidden');
          sessionStorage.removeItem('admin_passkey');
        }
      } catch (err) {
        authError.textContent = 'Error connecting to backend API: ' + (err.message || 'Network error');
        authError.classList.remove('hidden');
      } finally {
        if (btn) btn.textContent = 'Authenticate & Unlock Dashboard';
      }
    }

    async function refreshData() {
      if (!currentPasskey) return;
      try {
        const res = await fetch(`/api/admin/data?passkey=${encodeURIComponent(currentPasskey)}`, {
          headers: { 'X-Admin-Passkey': currentPasskey }
        });
        if (res.ok) {
          const data = await res.json();
          renderDashboard(data);
        }
      } catch (err) {
        console.error('Failed to refresh data', err);
      }
    }

    function renderDashboard(data) {
      // 1. Stats
      const stats = data.stats || {};
      document.getElementById('stat-total').textContent = stats.total_telemetry_events || 0;
      document.getElementById('stat-confidence').textContent = (stats.avg_confidence || 0) + '%';
      document.getElementById('stat-overrides').innerHTML = `${stats.inversion_overrides || 0} <span class="text-xs font-normal text-slate-500">(${stats.override_rate_pct || 0}%)</span>`;
      document.getElementById('stat-feedback').textContent = (data.feedback || []).length;

      // 2. Telemetry Table
      const tBody = document.getElementById('telemetry-table-body');
      if (data.telemetry && data.telemetry.length > 0) {
        tBody.innerHTML = data.telemetry.map(row => `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 font-mono text-[11px] text-slate-500">${row.timestamp ? row.timestamp.replace('T', ' ').slice(0, 19) : '-'}</td>
            <td class="py-3 font-bold text-slate-800">${row.platform || 'General'}</td>
            <td class="py-3"><span class="px-2 py-0.5 rounded-full font-mono text-[11px] bg-slate-100 text-slate-700">${row.predicted_case_type || 'unclassified'}</span></td>
            <td class="py-3 font-bold ${row.model_confidence >= 0.8 ? 'text-emerald-700' : 'text-amber-700'}">${row.model_confidence ? (row.model_confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
            <td class="py-3">${row.inversion_override ? '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Yes: ' + (row.overridden_case_type || 'Changed') + '</span>' : '<span class="text-slate-400">No</span>'}</td>
            <td class="py-3 font-mono">${row.entities_detected_count || 0}</td>
            <td class="py-3">${row.readiness_score !== null && row.readiness_score !== undefined ? row.readiness_score + '%' : 'N/A'}</td>
          </tr>
        `).join('');
      } else {
        tBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">No telemetry events logged yet.</td></tr>';
      }

      // 3. Feedback Table
      const fBody = document.getElementById('feedback-table-body');
      if (data.feedback && data.feedback.length > 0) {
        fBody.innerHTML = data.feedback.map(row => `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 font-mono text-[11px] text-slate-500">${row.timestamp ? row.timestamp.replace('T', ' ').slice(0, 19) : '-'}</td>
            <td class="py-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${row.source === 'sms' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${(row.source || 'web').toUpperCase()}</span></td>
            <td class="py-3 font-bold text-amber-500">${row.rating ? '★'.repeat(row.rating) + '☆'.repeat(5 - row.rating) : 'N/A'}</td>
            <td class="py-3 font-semibold text-slate-700">${row.platform || '-'}</td>
            <td class="py-3 font-mono text-[11px] text-slate-500">${row.phone ? row.phone.slice(0, 4) + '***' + row.phone.slice(-3) : 'Anonymous'}</td>
            <td class="py-3 text-slate-800">${row.comments || '<i class="text-slate-400">No comment</i>'}</td>
          </tr>
        `).join('');
      } else {
        fBody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No driver feedback logged yet.</td></tr>';
      }

      // 4. SMS Table
      const sBody = document.getElementById('sms-table-body');
      if (data.sms_logs && data.sms_logs.length > 0) {
        sBody.innerHTML = data.sms_logs.map(row => `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 font-mono text-[11px] text-slate-500">${row.timestamp ? row.timestamp.replace('T', ' ').slice(0, 19) : '-'}</td>
            <td class="py-3 font-bold">${row.direction === 'inbound' ? '📥 Inbound' : '📤 Outbound'}</td>
            <td class="py-3"><span class="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700">${row.sms_type || 'sms'}</span></td>
            <td class="py-3 font-mono text-[11px]">${row.phone ? row.phone.slice(0, 4) + '***' + row.phone.slice(-3) : '-'}</td>
            <td class="py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${row.status.includes('delivered') || row.status.includes('sent') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${row.status}</span></td>
            <td class="py-3 text-slate-700">${row.message || ''}</td>
          </tr>
        `).join('');
      } else {
        sBody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No Africa&apos;s Talking SMS events logged yet.</td></tr>';
      }
    }

    function switchTab(tab) {
      ['telemetry', 'feedback', 'sms'].forEach(t => {
        document.getElementById('tab-content-' + t).classList.add('hidden');
        document.getElementById('tab-btn-' + t).classList.remove('text-[#1E5E3A]', 'border-[#1E5E3A]');
        document.getElementById('tab-btn-' + t).classList.add('text-slate-500', 'border-transparent');
      });
      document.getElementById('tab-content-' + tab).classList.remove('hidden');
      document.getElementById('tab-btn-' + tab).classList.add('text-[#1E5E3A]', 'border-[#1E5E3A]');
      document.getElementById('tab-btn-' + tab).classList.remove('text-slate-500', 'border-transparent');
    }

    function logout() {
      sessionStorage.removeItem('admin_passkey');
      currentPasskey = '';
      const dash = document.getElementById('dashboard-content');
      dash.style.display = 'none';
      dash.classList.add('hidden');
      dash.classList.remove('flex');
      const modal = document.getElementById('auth-modal');
      modal.style.display = 'flex';
      modal.classList.add('flex');
      modal.classList.remove('hidden');
    }
  </script>
</body>
</html>
"""

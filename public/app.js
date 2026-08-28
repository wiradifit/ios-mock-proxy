// LocalMockAPI Frontend Controller
document.addEventListener('DOMContentLoaded', () => {
  // State
  let config = {};
  let rules = [];
  let traffic = [];
  let selectedTrafficId = null;
  let sseSource = null;

  // DOM Elements
  const liveStatus = document.getElementById('liveStatus');
  const quickUpstreamInput = document.getElementById('quickUpstreamInput');
  const saveUpstreamBtn = document.getElementById('saveUpstreamBtn');
  const mockModeSelect = document.getElementById('mockModeSelect');
  const trafficCountBadge = document.getElementById('trafficCountBadge');
  const rulesCountBadge = document.getElementById('rulesCountBadge');

  const trafficList = document.getElementById('trafficList');
  const trafficFilterInput = document.getElementById('trafficFilterInput');
  const trafficMethodFilter = document.getElementById('trafficMethodFilter');
  const trafficTypeFilter = document.getElementById('trafficTypeFilter');
  const clearTrafficBtn = document.getElementById('clearTrafficBtn');

  // Inspector Elements
  const inspectorEmpty = document.getElementById('inspectorEmpty');
  const inspectorContent = document.getElementById('inspectorContent');
  const inspMethodBadge = document.getElementById('inspMethodBadge');
  const inspPath = document.getElementById('inspPath');
  const inspStatusBadge = document.getElementById('inspStatusBadge');
  const inspTypeBadge = document.getElementById('inspTypeBadge');
  const inspDuration = document.getElementById('inspDuration');
  const inspTime = document.getElementById('inspTime');
  const inspRespBody = document.getElementById('inspRespBody');
  const inspRespHeaders = document.getElementById('inspRespHeaders');
  const inspReqParams = document.getElementById('inspReqParams');
  const inspReqBody = document.getElementById('inspReqBody');
  const inspReqHeaders = document.getElementById('inspReqHeaders');
  const convertToMockBtn = document.getElementById('convertToMockBtn');
  const copyRespBodyBtn = document.getElementById('copyRespBodyBtn');

  // Rules Elements
  const rulesGrid = document.getElementById('rulesGrid');
  const ruleSearchInput = document.getElementById('ruleSearchInput');
  const newRuleBtn = document.getElementById('newRuleBtn');
  const ruleModal = document.getElementById('ruleModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelRuleBtn = document.getElementById('cancelRuleBtn');
  const ruleForm = document.getElementById('ruleForm');
  const modalTitle = document.getElementById('modalTitle');

  // Form Fields
  const ruleIdInput = document.getElementById('ruleId');
  const ruleActionTypeSelect = document.getElementById('ruleActionType');
  const statusCodeGroup = document.getElementById('statusCodeGroup');
  const editorGroupRespBody = document.getElementById('editorGroupRespBody');
  const editorGroupReqParams = document.getElementById('editorGroupReqParams');
  const editorGroupReqBody = document.getElementById('editorGroupReqBody');

  const ruleNameInput = document.getElementById('ruleName');
  const ruleEnabledInput = document.getElementById('ruleEnabled');
  const ruleEnabledLabel = document.getElementById('ruleEnabledLabel');
  const ruleMethodSelect = document.getElementById('ruleMethod');
  const ruleMatchTypeSelect = document.getElementById('ruleMatchType');
  const rulePathInput = document.getElementById('rulePath');
  const ruleStatusCodeSelect = document.getElementById('ruleStatusCode');
  const ruleDelayInput = document.getElementById('ruleDelay');
  
  const ruleBodyTextarea = document.getElementById('ruleBody');
  const prettifyJsonBtnResp = document.getElementById('prettifyJsonBtnResp');
  const jsonValidationMsgResp = document.getElementById('jsonValidationMsgResp');

  const reqOverrideParamsTextarea = document.getElementById('reqOverrideParams');
  const prettifyJsonBtnParams = document.getElementById('prettifyJsonBtnParams');
  const jsonValidationMsgParams = document.getElementById('jsonValidationMsgParams');

  const reqOverrideBodyTextarea = document.getElementById('reqOverrideBody');
  const prettifyJsonBtnReq = document.getElementById('prettifyJsonBtnReq');
  const jsonValidationMsgReq = document.getElementById('jsonValidationMsgReq');

  // Toast
  const toast = document.getElementById('toast');

  // --- API Client ---
  async function fetchConfig() {
    try {
      const res = await fetch('/_api/config');
      config = await res.json();
      quickUpstreamInput.value = config.upstream || '';
      mockModeSelect.value = config.mockMode || 'fallback';
    } catch (e) {
      console.error('Failed to fetch config', e);
    }
  }

  async function saveConfig(updates) {
    try {
      const res = await fetch('/_api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      config = data.config;
      showToast('Settings saved successfully');
    } catch (e) {
      showToast('Error saving settings', true);
    }
  }

  async function fetchRules() {
    try {
      const res = await fetch('/_api/rules');
      rules = await res.json();
      rulesCountBadge.textContent = rules.length;
      renderRules();
    } catch (e) {
      console.error('Failed to fetch rules', e);
    }
  }

  async function fetchTraffic() {
    try {
      const res = await fetch('/_api/traffic');
      traffic = await res.json();
      trafficCountBadge.textContent = traffic.length;
      renderTraffic();
    } catch (e) {
      console.error('Failed to fetch traffic', e);
    }
  }

  // --- Real-time SSE Connection ---
  function initSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource('/_api/events');

    sseSource.onopen = () => {
      liveStatus.innerHTML = '<span class="status-dot"></span><span class="status-label">Live Connected</span>';
      liveStatus.style.color = 'var(--accent-success)';
    };

    sseSource.addEventListener('traffic', (e) => {
      const log = JSON.parse(e.data);
      traffic.unshift(log);
      if (traffic.length > 200) traffic.pop();
      trafficCountBadge.textContent = traffic.length;
      renderTraffic();

      // If this was selected, update inspector
      if (selectedTrafficId === log.id) {
        inspectTraffic(log);
      }
    });

    sseSource.addEventListener('rules_updated', (e) => {
      rules = JSON.parse(e.data);
      rulesCountBadge.textContent = rules.length;
      renderRules();
    });

    sseSource.addEventListener('config_updated', (e) => {
      config = JSON.parse(e.data);
      quickUpstreamInput.value = config.upstream || '';
      mockModeSelect.value = config.mockMode || 'fallback';
    });

    sseSource.addEventListener('traffic_cleared', () => {
      traffic = [];
      trafficCountBadge.textContent = '0';
      selectedTrafficId = null;
      inspectorEmpty.style.display = 'flex';
      inspectorContent.style.display = 'none';
      renderTraffic();
    });

    sseSource.onerror = () => {
      liveStatus.innerHTML = '<span class="status-dot" style="background: var(--accent-danger); box-shadow: 0 0 8px var(--accent-danger);"></span><span class="status-label" style="color: var(--accent-danger);">Reconnecting...</span>';
    };
  }

  // --- Helper: Deep Search Traffic Item ---
  function matchTrafficSearch(item, filterText) {
    if (!filterText) return true;

    // 1. URL, Path, Method, Status, Duration
    if ((item.url || '').toLowerCase().includes(filterText)) return true;
    if ((item.path || '').toLowerCase().includes(filterText)) return true;
    if ((item.method || '').toLowerCase().includes(filterText)) return true;
    if (String(item.status || '').includes(filterText)) return true;
    if ((item.ruleName || '').toLowerCase().includes(filterText)) return true;
    if ((item.upstream || '').toLowerCase().includes(filterText)) return true;
    if ((item.error || '').toLowerCase().includes(filterText)) return true;

    // 2. Response Body (JSON or Text)
    if (item.response) {
      if (typeof item.response.body === 'string') {
        if (item.response.body.toLowerCase().includes(filterText)) return true;
      } else if (item.response.body) {
        try {
          if (JSON.stringify(item.response.body).toLowerCase().includes(filterText)) return true;
        } catch (e) {}
      }

      // 3. Response Headers (Keys and Values)
      if (item.response.headers) {
        for (const [k, v] of Object.entries(item.response.headers)) {
          if (k.toLowerCase().includes(filterText)) return true;
          if (String(v).toLowerCase().includes(filterText)) return true;
        }
      }
    }

    // 4. Request Body (JSON or Text)
    if (item.request) {
      if (typeof item.request.body === 'string') {
        if (item.request.body.toLowerCase().includes(filterText)) return true;
      } else if (item.request.body) {
        try {
          if (JSON.stringify(item.request.body).toLowerCase().includes(filterText)) return true;
        } catch (e) {}
      }

      // 5. Request Headers (Keys and Values)
      if (item.request.headers) {
        for (const [k, v] of Object.entries(item.request.headers)) {
          if (k.toLowerCase().includes(filterText)) return true;
          if (String(v).toLowerCase().includes(filterText)) return true;
        }
      }
      
      // 6. Query Parameters
      if (item.request.queryParams) {
        for (const [k, v] of Object.entries(item.request.queryParams)) {
          if (k.toLowerCase().includes(filterText)) return true;
          if (String(v).toLowerCase().includes(filterText)) return true;
        }
      }
    }

    return false;
  }

  // --- Render Traffic List ---
  function renderTraffic() {
    const filterText = trafficFilterInput.value.toLowerCase().trim();
    const methodFilter = trafficMethodFilter.value;
    const typeFilter = trafficTypeFilter.value;

    const filtered = traffic.filter(item => {
      if (filterText && !matchTrafficSearch(item, filterText)) {
        return false;
      }
      if (methodFilter !== 'ALL' && item.method !== methodFilter) return false;
      if (typeFilter === 'MOCK' && !item.isMock) return false;
      if (typeFilter === 'PROXY' && item.isMock) return false;
      if (typeFilter === 'ERROR' && item.status < 400) return false;
      return true;
    });

    if (filtered.length === 0) {
      trafficList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📡</div>
          <p>${traffic.length === 0 ? 'No traffic recorded yet' : 'No requests matching search'}</p>
          <span class="empty-hint">Try adjusting your search keywords or method filters.</span>
        </div>
      `;
      return;
    }

    trafficList.innerHTML = filtered.map(item => {
      const isSelected = item.id === selectedTrafficId ? 'selected' : '';
      const statusClass = getStatusClass(item.status);
      const typeBadge = item.isMock
        ? '<span class="type-pill type-mock">MOCK</span>'
        : '<span class="type-pill type-proxy">PROXY</span>';

      return `
        <div class="traffic-row ${isSelected}" data-id="${item.id}">
          <div class="col col-status">
            <span class="status-pill ${statusClass}">${item.status || '---'}</span>
          </div>
          <div class="col col-method">
            <span class="method-badge method-${item.method}">${item.method}</span>
          </div>
          <div class="col col-path" title="${escapeHtml(item.url)}">${escapeHtml(item.path || item.url)}</div>
          <div class="col col-type">${typeBadge}</div>
          <div class="col col-time">${item.duration || 0}ms</div>
        </div>
      `;
    }).join('');

    // Attach click listeners
    trafficList.querySelectorAll('.traffic-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        selectedTrafficId = id;
        renderTraffic();
        const item = traffic.find(t => t.id === id);
        if (item) inspectTraffic(item);
      });
    });
  }

  // --- Inspect Selected Traffic ---
  function inspectTraffic(item) {
    inspectorEmpty.style.display = 'none';
    inspectorContent.style.display = 'flex';

    inspMethodBadge.className = `method-badge method-${item.method}`;
    inspMethodBadge.textContent = item.method;
    inspPath.textContent = item.path || item.url;
    inspPath.title = item.url;

    inspStatusBadge.className = `status-pill ${getStatusClass(item.status)}`;
    inspStatusBadge.textContent = `${item.status || '---'}`;

    if (item.isMock) {
      inspTypeBadge.className = 'type-pill type-mock';
      inspTypeBadge.textContent = `MOCKED (${item.ruleName || 'Rule'})`;
    } else {
      inspTypeBadge.className = 'type-pill type-proxy';
      inspTypeBadge.textContent = `PROXIED (${item.upstream || 'Upstream'})`;
    }

    inspDuration.textContent = `${item.duration || 0}ms`;
    inspTime.textContent = new Date(item.timestamp).toLocaleTimeString();

    // Format Response Body
    let formattedRespBody = '';
    try {
      if (typeof item.response.body === 'string') {
        const parsed = JSON.parse(item.response.body);
        formattedRespBody = JSON.stringify(parsed, null, 2);
      } else {
        formattedRespBody = JSON.stringify(item.response.body, null, 2);
      }
    } catch (e) {
      formattedRespBody = item.response.body || '(Empty Response)';
    }
    inspRespBody.textContent = formattedRespBody;

    // Headers & Params
    inspRespHeaders.textContent = JSON.stringify(item.response.headers || {}, null, 2);
    inspReqHeaders.textContent = JSON.stringify(item.request.headers || {}, null, 2);
    
    // Formatting Query Params
    let queryParamsObj = item.request.queryParams || {};
    if (Object.keys(queryParamsObj).length > 0) {
      inspReqParams.textContent = JSON.stringify(queryParamsObj, null, 2);
    } else {
      inspReqParams.textContent = '(No Query Parameters)';
    }

    // Format Request Body
    let formattedReqBody = '';
    try {
      if (item.request.body) {
        const parsed = JSON.parse(item.request.body);
        formattedReqBody = JSON.stringify(parsed, null, 2);
      } else {
        formattedReqBody = '(No Request Body)';
      }
    } catch (e) {
      formattedReqBody = item.request.body || '(No Request Body)';
    }
    inspReqBody.textContent = formattedReqBody;

    // Convert to Mock button action (Prefill Response Body, Query Params, Request Body)
    convertToMockBtn.onclick = () => {
      let prefillParams = '';
      if (item.request && item.request.queryParams && Object.keys(item.request.queryParams).length > 0) {
        prefillParams = JSON.stringify(item.request.queryParams, null, 2);
      }

      let prefillReqBody = '';
      if (item.request && item.request.body) {
        try {
          const parsed = JSON.parse(item.request.body);
          prefillReqBody = JSON.stringify(parsed, null, 2);
        } catch (e) {
          prefillReqBody = item.request.body;
        }
      }

      openRuleModalForCreate({
        name: `Mock for ${item.path || item.url}`,
        method: item.method,
        path: item.path || item.url,
        matchType: 'exact',
        statusCode: item.status || 200,
        delay: 0,
        body: formattedRespBody,
        reqOverrideParams: prefillParams,
        reqOverrideBody: prefillReqBody
      });
    };
  }

  // --- Render Mock Rules ---
  function renderRules() {
    const filterText = ruleSearchInput.value.toLowerCase().trim();

    const filtered = rules.filter(r => {
      if (!filterText) return true;
      return (r.name || '').toLowerCase().includes(filterText) ||
             (r.path || '').toLowerCase().includes(filterText) ||
             (r.method || '').toLowerCase().includes(filterText);
    });

    if (filtered.length === 0) {
      rulesGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📋</div>
          <p>${rules.length === 0 ? 'No mock rules created yet' : 'No rules match search'}</p>
          <button class="btn btn-primary" onclick="document.getElementById('newRuleBtn').click()">＋ Create Your First Mock Rule</button>
        </div>
      `;
      return;
    }

    rulesGrid.innerHTML = filtered.map(rule => {
      const disabledClass = rule.enabled ? '' : 'disabled';
      const statusClass = getStatusClass(rule.statusCode || 200);

      return `
        <div class="rule-card ${disabledClass}" data-id="${rule.id}">
          <div class="rule-card-header">
            <span class="rule-name">${escapeHtml(rule.name || 'Untitled Rule')}</span>
            <label class="switch">
              <input type="checkbox" class="rule-toggle-checkbox" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div class="rule-card-endpoint">
            <span class="method-badge method-${rule.method || 'GET'}">${rule.method || 'GET'}</span>
            <span class="rule-endpoint-path" title="${escapeHtml(rule.path)}">${escapeHtml(rule.path)}</span>
          </div>

          <div class="rule-card-meta">
            ${rule.actionType === 'modify_request' ? '<span class="type-pill type-proxy">MODIFY REQUEST</span>' : '<span class="type-pill type-mock">MOCK RESPONSE</span>'}
            ${rule.actionType !== 'modify_request' ? `<span>Status: <strong class="status-pill ${statusClass}">${rule.statusCode || 200}</strong></span>` : ''}
            <span>Match: <strong>${rule.matchType || 'exact'}</strong></span>
            <span>Delay: <strong>${rule.delay || 0}ms</strong></span>
          </div>

          <div class="rule-card-actions">
            <button class="btn btn-outline btn-xs edit-rule-btn" data-id="${rule.id}">✏️ Edit</button>
            <button class="btn btn-outline btn-xs duplicate-rule-btn" data-id="${rule.id}">📋 Duplicate</button>
            <button class="btn btn-danger-outline btn-xs delete-rule-btn" data-id="${rule.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Rule Actions Listeners
    rulesGrid.querySelectorAll('.rule-toggle-checkbox').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        try {
          await fetch(`/_api/rules/${id}/toggle`, { method: 'POST' });
          showToast('Rule status updated');
        } catch (err) {
          showToast('Failed to toggle rule', true);
        }
      });
    });

    rulesGrid.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rule = rules.find(r => r.id === id);
        if (rule) openRuleModalForEdit(rule);
      });
    });

    rulesGrid.querySelectorAll('.duplicate-rule-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const rule = rules.find(r => r.id === id);
        if (rule) {
          const newRule = {
            ...rule,
            id: undefined,
            name: `${rule.name} (Copy)`
          };
          await saveRuleToApi(newRule);
        }
      });
    });

    rulesGrid.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this mock rule?')) {
          try {
            await fetch(`/_api/rules/${id}`, { method: 'DELETE' });
            showToast('Rule deleted');
          } catch (err) {
            showToast('Failed to delete rule', true);
          }
        }
      });
    });
  }

  // CodeMirror instances
  let cmEditorResp = null;
  let cmEditorParams = null;
  let cmEditorReqBody = null;

  function createCodeMirror(textarea, onChangeCb) {
    const cm = CodeMirror.fromTextArea(textarea, {
      mode: { name: "javascript", json: true },
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      styleActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      tabSize: 2,
      indentUnit: 2
    });
    cm.on('change', onChangeCb);
    return cm;
  }

  function initCodeMirror() {
    if (window.CodeMirror) {
      if (!cmEditorResp) cmEditorResp = createCodeMirror(ruleBodyTextarea, () => validateJsonInput(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp));
      if (!cmEditorParams) cmEditorParams = createCodeMirror(reqOverrideParamsTextarea, () => validateJsonInput(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true));
      if (!cmEditorReqBody) cmEditorReqBody = createCodeMirror(reqOverrideBodyTextarea, () => validateJsonInput(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true));
    }
  }

  function getEditorValue(cm, textarea) {
    if (cm) return cm.getValue();
    return textarea.value;
  }

  function setEditorValue(cm, textarea, val) {
    if (cm) {
      cm.setValue(val || '');
      setTimeout(() => cm.refresh(), 60);
    } else {
      textarea.value = val || '';
    }
  }

  function syncActionVisibility() {
    if (ruleActionTypeSelect.value === 'mock_response') {
      statusCodeGroup.style.display = 'block';
      editorGroupRespBody.style.display = 'block';
      editorGroupReqParams.style.display = 'none';
      editorGroupReqBody.style.display = 'none';
    } else {
      statusCodeGroup.style.display = 'none';
      editorGroupRespBody.style.display = 'none';
      editorGroupReqParams.style.display = 'block';
      editorGroupReqBody.style.display = 'block';
      if (cmEditorParams) setTimeout(() => cmEditorParams.refresh(), 60);
      if (cmEditorReqBody) setTimeout(() => cmEditorReqBody.refresh(), 60);
    }
  }

  ruleActionTypeSelect.addEventListener('change', syncActionVisibility);

  // --- Rule Modal Helpers ---
  function openRuleModalForCreate(prefill = {}) {
    initCodeMirror();
    modalTitle.textContent = 'Create Rule';
    ruleIdInput.value = '';
    ruleNameInput.value = prefill.name || '';
    ruleEnabledInput.checked = true;
    ruleEnabledLabel.textContent = 'Enabled';
    ruleActionTypeSelect.value = prefill.actionType || 'mock_response';
    ruleMethodSelect.value = prefill.method || 'GET';
    ruleMatchTypeSelect.value = prefill.matchType || 'exact';
    rulePathInput.value = prefill.path || '';
    ruleStatusCodeSelect.value = prefill.statusCode || '200';
    ruleDelayInput.value = prefill.delay || '0';
    
    setEditorValue(cmEditorResp, ruleBodyTextarea, prefill.body || '{\n  "status": "success",\n  "data": {}\n}');
    setEditorValue(cmEditorParams, reqOverrideParamsTextarea, prefill.reqOverrideParams || '');
    setEditorValue(cmEditorReqBody, reqOverrideBodyTextarea, prefill.reqOverrideBody || '');
    
    validateJsonInput(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp);
    validateJsonInput(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true);
    validateJsonInput(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true);
    
    syncActionVisibility();
    ruleModal.style.display = 'flex';
    setTimeout(() => {
      if (cmEditorResp) cmEditorResp.refresh();
      if (cmEditorParams) cmEditorParams.refresh();
      if (cmEditorReqBody) cmEditorReqBody.refresh();
    }, 80);
  }

  function openRuleModalForEdit(rule) {
    initCodeMirror();
    modalTitle.textContent = 'Edit Rule';
    ruleIdInput.value = rule.id;
    ruleNameInput.value = rule.name || '';
    ruleEnabledInput.checked = rule.enabled !== false;
    ruleEnabledLabel.textContent = rule.enabled !== false ? 'Enabled' : 'Disabled';
    ruleActionTypeSelect.value = rule.actionType || 'mock_response';
    ruleMethodSelect.value = rule.method || 'GET';
    ruleMatchTypeSelect.value = rule.matchType || 'exact';
    rulePathInput.value = rule.path || '';
    ruleStatusCodeSelect.value = rule.statusCode || '200';
    ruleDelayInput.value = rule.delay || '0';
    
    let bodyStr = rule.body;
    if (typeof bodyStr !== 'string') bodyStr = JSON.stringify(bodyStr, null, 2);
    setEditorValue(cmEditorResp, ruleBodyTextarea, bodyStr || '');

    let paramsStr = rule.reqOverrideParams;
    if (typeof paramsStr !== 'string' && paramsStr) paramsStr = JSON.stringify(paramsStr, null, 2);
    setEditorValue(cmEditorParams, reqOverrideParamsTextarea, paramsStr || '');

    let reqBodyStr = rule.reqOverrideBody;
    if (typeof reqBodyStr !== 'string' && reqBodyStr) reqBodyStr = JSON.stringify(reqBodyStr, null, 2);
    setEditorValue(cmEditorReqBody, reqOverrideBodyTextarea, reqBodyStr || '');

    validateJsonInput(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp);
    validateJsonInput(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true);
    validateJsonInput(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true);
    
    syncActionVisibility();
    ruleModal.style.display = 'flex';
    setTimeout(() => {
      if (cmEditorResp) cmEditorResp.refresh();
      if (cmEditorParams) cmEditorParams.refresh();
      if (cmEditorReqBody) cmEditorReqBody.refresh();
    }, 80);
  }

  function closeRuleModal() {
    ruleModal.style.display = 'none';
  }

  function validateJsonInput(cm, textarea, msgEl, allowEmpty = false) {
    if (!msgEl) return true;
    const val = getEditorValue(cm, textarea).trim();
    if (!val) {
      if (allowEmpty) {
        msgEl.textContent = 'Empty (Allowed)';
        msgEl.className = 'validation-msg';
        return true;
      }
      msgEl.textContent = 'Empty Body';
      msgEl.className = 'validation-msg';
      return true;
    }
    try {
      JSON.parse(val);
      msgEl.textContent = '✓ Valid JSON';
      msgEl.className = 'validation-msg';
      return true;
    } catch (e) {
      msgEl.textContent = '✗ Invalid JSON: ' + e.message;
      msgEl.className = 'validation-msg error';
      return false;
    }
  }

  async function saveRuleToApi(ruleData) {
    try {
      const res = await fetch('/_api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData)
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast('Mock rule saved successfully');
        closeRuleModal();
      } else {
        showToast(data.error || 'Failed to save rule', true);
      }
    } catch (e) {
      showToast('Error saving rule: ' + e.message, true);
    }
  }

  // --- Event Listeners ---
  // Tabs Navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = `tab-${tab.getAttribute('data-tab')}`;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Inspector Sub-tabs
  document.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const paneId = `subtab-${btn.getAttribute('data-subtab')}`;
      document.getElementById(paneId).classList.add('active');
    });
  });

  // Upstream & Mode controls
  saveUpstreamBtn.addEventListener('click', () => {
    saveConfig({ upstream: quickUpstreamInput.value.trim() });
  });

  quickUpstreamInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveUpstreamBtn.click();
  });

  mockModeSelect.addEventListener('change', () => {
    saveConfig({ mockMode: mockModeSelect.value });
  });

  // Traffic Filters
  trafficFilterInput.addEventListener('input', renderTraffic);
  trafficMethodFilter.addEventListener('change', renderTraffic);
  trafficTypeFilter.addEventListener('change', renderTraffic);

  clearTrafficBtn.addEventListener('click', async () => {
    await fetch('/_api/traffic', { method: 'DELETE' });
    showToast('Traffic logs cleared');
  });

  // Rules Toolbar & Form
  ruleSearchInput.addEventListener('input', renderRules);
  newRuleBtn.addEventListener('click', () => openRuleModalForCreate());
  closeModalBtn.addEventListener('click', closeRuleModal);
  cancelRuleBtn.addEventListener('click', closeRuleModal);

  ruleEnabledInput.addEventListener('change', () => {
    ruleEnabledLabel.textContent = ruleEnabledInput.checked ? 'Enabled' : 'Disabled';
  });

  ruleBodyTextarea.addEventListener('input', () => validateJsonInput(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp));
  reqOverrideParamsTextarea.addEventListener('input', () => validateJsonInput(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true));
  reqOverrideBodyTextarea.addEventListener('input', () => validateJsonInput(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true));

  function handlePrettify(cm, textarea, msgEl, allowEmpty) {
    try {
      const currentVal = getEditorValue(cm, textarea);
      if (!currentVal.trim()) return;
      const parsed = JSON.parse(currentVal);
      setEditorValue(cm, textarea, JSON.stringify(parsed, null, 2));
      validateJsonInput(cm, textarea, msgEl, allowEmpty);
      showToast('JSON formatted');
    } catch (e) {
      showToast('Cannot format invalid JSON', true);
    }
  }

  prettifyJsonBtnResp.addEventListener('click', () => handlePrettify(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp, false));
  prettifyJsonBtnParams.addEventListener('click', () => handlePrettify(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true));
  prettifyJsonBtnReq.addEventListener('click', () => handlePrettify(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true));

  copyRespBodyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(inspRespBody.textContent).then(() => {
      showToast('Response copied to clipboard');
    });
  });

  ruleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const isMock = ruleActionTypeSelect.value === 'mock_response';
    
    if (isMock) {
      if (!validateJsonInput(cmEditorResp, ruleBodyTextarea, jsonValidationMsgResp)) {
        showToast('Please fix JSON formatting before saving', true);
        return;
      }
    } else {
      const v1 = validateJsonInput(cmEditorParams, reqOverrideParamsTextarea, jsonValidationMsgParams, true);
      const v2 = validateJsonInput(cmEditorReqBody, reqOverrideBodyTextarea, jsonValidationMsgReq, true);
      if (!v1 || !v2) {
        showToast('Please fix JSON formatting before saving', true);
        return;
      }
    }

    const ruleData = {
      id: ruleIdInput.value || undefined,
      name: ruleNameInput.value.trim(),
      enabled: ruleEnabledInput.checked,
      actionType: ruleActionTypeSelect.value,
      method: ruleMethodSelect.value,
      matchType: ruleMatchTypeSelect.value,
      path: rulePathInput.value.trim(),
      statusCode: parseInt(ruleStatusCodeSelect.value, 10),
      delay: parseInt(ruleDelayInput.value || 0, 10),
      body: getEditorValue(cmEditorResp, ruleBodyTextarea).trim(),
      reqOverrideParams: getEditorValue(cmEditorParams, reqOverrideParamsTextarea).trim(),
      reqOverrideBody: getEditorValue(cmEditorReqBody, reqOverrideBodyTextarea).trim()
    };

    await saveRuleToApi(ruleData);
  });

  // --- Utility Functions ---
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.style.borderColor = isError ? 'var(--accent-danger)' : 'var(--accent-primary)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function getStatusClass(code) {
    if (!code) return 'status-200';
    if (code >= 200 && code < 300) return 'status-2xx';
    if (code >= 300 && code < 400) return 'status-3xx';
    if (code >= 400 && code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }

  // Initial Load
  fetchConfig();
  fetchRules();
  fetchTraffic();
  initSSE();

  // Automated demo handler for visual documentation & screenshots
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('demo') === 'inspect') {
    setTimeout(() => {
      const rows = Array.from(document.querySelectorAll('.traffic-row'));
      const targetRow = rows.find(r => r.textContent.includes('/api/v1/user/profile')) || rows[0];
      if (targetRow) targetRow.click();
    }, 500);
  } else if (urlParams.get('demo') === 'modal') {
    setTimeout(() => {
      openRuleModalForCreate({
        name: 'Mock User Profile (VIP Tier)',
        method: 'GET',
        path: '/api/v1/user/profile',
        statusCode: 200,
        delay: 200,
        body: JSON.stringify({
          status: 'success',
          data: {
            id: 'usr_99812',
            name: 'Alex Johnson',
            email: 'alex.johnson@example.com',
            tier: 'Diamond VIP',
            balance_usd: 145250.00,
            features: ['instant_transfer', 'zero_fee_trading', 'analytics_pro']
          }
        }, null, 2)
      });
    }, 500);
  }
});

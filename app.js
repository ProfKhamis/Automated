const BASE_URL = 'https://api.derivws.com';
let accountList = [];
let optionsWebSocket = null;


// Global Session P/L Tracker
let totalSessionProfit = 0;
const sessionProfitDisplay = document.getElementById("session-profit-display"); // We will create this in HTML

// ACTIVE STRATEGY STATE VARS
let activeTabId = 'tab-even-odd';
let isAutoTradingEO = false;
let isAutoTradingOU = false;
let autoBulkCooldown = false; 

// COUNTER STATE TRACKING
let totalTradesExecutedOU = 0; 

// DOM Bindings - Core & UI elements
const btnFetch = document.getElementById('btn-fetch-accounts');
const btnResetBalance = document.getElementById('btn-reset-balance');
const btnToggleStream = document.getElementById('btn-toggle-stream');
const tokenInput = document.getElementById('api-token');
const appIdInput = document.getElementById('app-id');
const apiStatus = document.getElementById('api-status');
const dropdown = document.getElementById('account-dropdown');
const balanceText = document.getElementById('active-balance');
const currencyText = document.getElementById('active-currency');
const badge = document.getElementById('account-type-badge');
const logConsole = document.getElementById('log-console');

// DOM Bindings - Telemetry
const marketPanel = document.getElementById('market-data-panel');
const marketDropdown = document.getElementById('market-dropdown');
const liveTickValue = document.getElementById('live-tick-value');
const liveDigitValue = document.getElementById('live-digit-value');

// DOM Bindings - Strategy 1 (EO)
const btnBuyEO = document.getElementById('btn-buy-eo');
const btnToggleAutoEO = document.getElementById('btn-toggle-auto-eo');
const tradeStakeEO = document.getElementById('trade-stake-eo');
const tradeDurationEO = document.getElementById('trade-duration-eo');
const strategyModeEO = document.getElementById('strategy-mode-eo');
const tradeStakeBEO = document.getElementById("trade-stake-beo");
const tradeDurationBEO = document.getElementById("trade-duration-beo");
const btnBuyBEO = document.getElementById("btn-buy-beo");
const maxTradesBEO = document.getElementById("max-trades-beo");
let totalTradesExecutedBEO = 0;
const btnToggleAutoBEO = document.getElementById("btn-toggle-auto-beo");
let isAutoModeBEO = false;
let trackingSettledContractsBEO = 0;
// DOM Bindings - Strategy 2 (OU)
const btnBuyOU = document.getElementById('btn-buy-ou');
const btnToggleAutoOU = document.getElementById('btn-toggle-auto-ou');
const tradeStakeOU = document.getElementById('trade-stake-ou');
const tradeDurationOU = document.getElementById('trade-duration-ou');
const predOverInput = document.getElementById('pred-over');
const predUnderInput = document.getElementById('pred-under');
const maxTradesOUInput = document.getElementById('max-trades-ou');
const ledgerBody = document.getElementById('ledger-body');
const emptyRow = document.getElementById('ledger-empty-row');

// DOM Bindings - Strategy 5 (Pattern-Triggered Over/Under)
const btnToggleAutoPOU = document.getElementById('btn-toggle-auto-pou');
const tradeStakePOU = document.getElementById('trade-stake-pou');
const tradeDurationPOU = document.getElementById('trade-duration-pou');
const maxTradesPOUInput = document.getElementById('max-trades-pou');
const patternDigitHistoryDisplay = document.getElementById('pattern-digit-history');
const patternLastMatchDisplay = document.getElementById('pattern-last-match');

// DOM Bindings - Take Profit / Stop Loss
const btnToggleTPSL = document.getElementById('btn-toggle-tpsl');
const tpTargetInput = document.getElementById('tp-target');
const slTargetInput = document.getElementById('sl-target');
const tpslProgressFill = document.getElementById('tpsl-progress-fill');
const tpslModalOverlay = document.getElementById('tpsl-modal-overlay');
const tpslModalIcon = document.getElementById('tpsl-modal-icon');
const tpslModalTitle = document.getElementById('tpsl-modal-title');
const tpslModalMessage = document.getElementById('tpsl-modal-message');
const tpslModalAmount = document.getElementById('tpsl-modal-amount');
const btnCloseTPSLModal = document.getElementById('btn-close-tpsl-modal');
let isTPSLArmed = false;

// DOM Bindings - Bulk Over 2 (digit-trigger batch buyer)
const btnBuyBulkOver2 = document.getElementById('btn-buy-bulk-over2');
const tradeStakeOver2 = document.getElementById('trade-stake-over2');
const tradeDurationOver2 = document.getElementById('trade-duration-over2');
const triggerModeOver2Select = document.getElementById('trigger-mode-over2');
const triggerDigitOver2Input = document.getElementById('trigger-digit-over2');
const triggerDigitLabelOver2 = document.getElementById('trigger-digit-label-over2');
const triggerDigit2Over2Input = document.getElementById('trigger-digit-2-over2');
const triggerDigit2WrapperOver2 = document.getElementById('trigger-digit-2-wrapper-over2');
const contractsPerTriggerOver2Input = document.getElementById('contracts-per-trigger-over2');
const maxTriggersOver2Input = document.getElementById('max-triggers-over2');
const overBarrierOver2Input = document.getElementById('over-barrier-over2');
const over2RunProgressDisplay = document.getElementById('over2-run-progress');
let isBulkOver2Armed = false;
let bulkOver2TriggersFired = 0;
let bulkOver2Cooldown = false;

// PATTERN OU STATE
let isAutoTradingPOU = false;
let totalTradesExecutedPOU = 0;
let patternCooldown = false;
let recentDigitHistory = []; // rolling window of the last 2 tick digits

// Pattern definitions: any two-tick sequence containing this digit pair (in either order)
// triggers the paired contract_type/barrier below.
const DIGIT_PATTERNS = [
    { digits: [1, 2], contract_type: 'DIGITOVER', barrier: '2', label: 'Over 2 (1\u2194 2 pattern)' },
    { digits: [7, 8], contract_type: 'DIGITUNDER', barrier: '7', label: 'Under 7 (7\u2194 8 pattern)' }
];

function matchDigitPattern(history) {
    if (history.length < 2) return null;
    const [a, b] = history;
    return DIGIT_PATTERNS.find(p =>
        (a === p.digits[0] && b === p.digits[1]) || (a === p.digits[1] && b === p.digits[0])
    ) || null;
}

// Generic "did these two digits land back-to-back, in either order" check --
// shared by the Bulk Over trigger's Two-Digit Sequence mode.
function matchConsecutivePair(history, digitA, digitB) {
    if (history.length < 2) return false;
    const [a, b] = history;
    return (a === digitA && b === digitB) || (a === digitB && b === digitA);
}

// Toggle the second trigger-digit field depending on the chosen mode.
if (triggerModeOver2Select) {
    triggerModeOver2Select.addEventListener('change', () => {
        const isDouble = triggerModeOver2Select.value === 'double';
        if (triggerDigit2WrapperOver2) triggerDigit2WrapperOver2.style.display = isDouble ? 'flex' : 'none';
        if (triggerDigitLabelOver2) triggerDigitLabelOver2.textContent = isDouble ? "First Trigger Digit (0-9):" : "Trigger Digit (0-9):";
    });
}

// --- TAKE PROFIT / STOP LOSS ---
function updateSessionProfitUI() {
    if (sessionProfitDisplay) {
        sessionProfitDisplay.textContent = totalSessionProfit.toFixed(2);
        sessionProfitDisplay.style.color = totalSessionProfit > 0
            ? "var(--accent-green)"
            : totalSessionProfit < 0
                ? "var(--accent-red)"
                : "var(--text-primary)";
    }
    updateTPSLProgressBar();
}

function updateTPSLProgressBar() {
    if (!tpslProgressFill) return;
    const tpTarget = parseFloat(tpTargetInput.value) || 0;
    const slTarget = parseFloat(slTargetInput.value) || 0;

    if (tpTarget <= 0 && slTarget <= 0) {
        tpslProgressFill.style.width = '0%';
        tpslProgressFill.style.left = '50%';
        return;
    }

    // Bar center (50%) = 0 P/L. Right edge (100%) = +TP. Left edge (0%) = -SL.
    let halfWidthPct;
    if (totalSessionProfit >= 0) {
        halfWidthPct = tpTarget > 0 ? Math.min(totalSessionProfit / tpTarget, 1) * 50 : 0;
        tpslProgressFill.style.left = '50%';
        tpslProgressFill.style.width = `${halfWidthPct}%`;
        tpslProgressFill.style.backgroundColor = 'var(--accent-green)';
    } else {
        halfWidthPct = slTarget > 0 ? Math.min(Math.abs(totalSessionProfit) / slTarget, 1) * 50 : 0;
        tpslProgressFill.style.left = `${50 - halfWidthPct}%`;
        tpslProgressFill.style.width = `${halfWidthPct}%`;
        tpslProgressFill.style.backgroundColor = 'var(--accent-red)';
    }
}

function checkTPSLHit() {
    if (!isTPSLArmed) return;
    const tpTarget = parseFloat(tpTargetInput.value) || 0;
    const slTarget = parseFloat(slTargetInput.value) || 0;

    if (tpTarget > 0 && totalSessionProfit >= tpTarget) {
        haltAllAutoModes();
        disarmTPSL();
        showTPSLModal(true, totalSessionProfit);
    } else if (slTarget > 0 && totalSessionProfit <= -slTarget) {
        haltAllAutoModes();
        disarmTPSL();
        showTPSLModal(false, totalSessionProfit);
    }
}

function showTPSLModal(isWin, amount) {
    if (!tpslModalOverlay) return;
    if (isWin) {
        tpslModalIcon.textContent = "🎉";
        tpslModalTitle.textContent = "Take Profit Hit!";
        tpslModalMessage.textContent = "Nice work — you hit your session take profit target. Consider calling it here.";
        tpslModalAmount.textContent = `+${amount.toFixed(2)} USD`;
        tpslModalAmount.className = "modal-amount win";
    } else {
        tpslModalIcon.textContent = "🛑";
        tpslModalTitle.textContent = "Stop Loss Hit";
        tpslModalMessage.textContent = "Your session stop loss was reached, so auto-trading has been halted to protect your balance.";
        tpslModalAmount.textContent = `${amount.toFixed(2)} USD`;
        tpslModalAmount.className = "modal-amount loss";
    }
    tpslModalOverlay.style.display = 'flex';
}

if (btnCloseTPSLModal) {
    btnCloseTPSLModal.addEventListener('click', () => {
        tpslModalOverlay.style.display = 'none';
    });
}

function armTPSL() {
    isTPSLArmed = true;
    btnToggleTPSL.textContent = "Disarm TP/SL";
    btnToggleTPSL.classList.add('stream-active');
    tpTargetInput.disabled = true;
    slTargetInput.disabled = true;
    totalSessionProfit = 0;
    updateSessionProfitUI();
    logToConsole(`[TP/SL] Armed. Take Profit: $${tpTargetInput.value} | Stop Loss: $${slTargetInput.value}`, "success-msg");
}

function disarmTPSL() {
    isTPSLArmed = false;
    btnToggleTPSL.textContent = "Arm TP/SL";
    btnToggleTPSL.classList.remove('stream-active');
    tpTargetInput.disabled = false;
    slTargetInput.disabled = false;
}

// TP/SL controls were removed from the UI, so guard this listener --
// the rest of the TP/SL logic above stays inert (isTPSLArmed never
// flips true) which keeps checkTPSLHit()/haltAllAutoModes() call sites
// throughout the file safe without touching them.
if (btnToggleTPSL) {
    btnToggleTPSL.addEventListener('click', () => {
        if (isTPSLArmed) {
            disarmTPSL();
            logToConsole("[TP/SL] Disarmed by user.");
        } else {
            armTPSL();
        }
    });
}

function haltAllAutoModes() {
    if (isAutoTradingEO) toggleAutoEO(false);
    if (isAutoTradingOU) toggleAutoOU(false);
    if (isAutoModeBEO) stopAutoBulkModeBEO();
    if (isAutoTradingPOU) toggleAutoPOU(false);
    if (isBulkOver2Armed) disarmBulkOver2();
    isAutoModeTN = false;
    logToConsole("[Risk Management] All auto-trading modes halted.", "error-msg");
}

// --- BULK OVER 2 (digit-trigger batch buyer) ---
btnBuyBulkOver2.addEventListener('click', () => {
    if (isBulkOver2Armed) {
        disarmBulkOver2();
    } else {
        armBulkOver2();
    }
});

function armBulkOver2() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }
    bulkOver2TriggersFired = 0;
    bulkOver2Cooldown = false;
    isBulkOver2Armed = true;

    btnBuyBulkOver2.textContent = "Disarm Bulk Over 2";
    btnBuyBulkOver2.classList.add('stream-active');
    tradeStakeOver2.disabled = true;
    tradeDurationOver2.disabled = true;
    if (triggerModeOver2Select) triggerModeOver2Select.disabled = true;
    triggerDigitOver2Input.disabled = true;
    if (triggerDigit2Over2Input) triggerDigit2Over2Input.disabled = true;
    contractsPerTriggerOver2Input.disabled = true;
    maxTriggersOver2Input.disabled = true;
    overBarrierOver2Input.disabled = true;
    if (over2RunProgressDisplay) over2RunProgressDisplay.textContent = `0 / ${maxTriggersOver2Input.value}`;

    const isDouble = triggerModeOver2Select && triggerModeOver2Select.value === 'double';
    const watchDesc = isDouble
        ? `digits ${triggerDigitOver2Input.value} & ${triggerDigit2Over2Input.value} landing back-to-back`
        : `digit ${triggerDigitOver2Input.value}`;
    logToConsole(`[Bulk Over] Armed. Watching for ${watchDesc} -- will buy ${contractsPerTriggerOver2Input.value} Over ${overBarrierOver2Input.value} contracts each time it fires.`, "success-msg");
}

function disarmBulkOver2() {
    isBulkOver2Armed = false;
    btnBuyBulkOver2.textContent = "Arm Bulk Over 2";
    btnBuyBulkOver2.classList.remove('stream-active');
    tradeStakeOver2.disabled = false;
    tradeDurationOver2.disabled = false;
    if (triggerModeOver2Select) triggerModeOver2Select.disabled = false;
    triggerDigitOver2Input.disabled = false;
    if (triggerDigit2Over2Input) triggerDigit2Over2Input.disabled = false;
    contractsPerTriggerOver2Input.disabled = false;
    maxTriggersOver2Input.disabled = false;
    overBarrierOver2Input.disabled = false;
    logToConsole("[Bulk Over] Disarmed.");
}

function fireBulkOver2Batch() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        disarmBulkOver2();
        return;
    }

    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeOver2.value);
    const duration = parseInt(tradeDurationOver2.value, 10);
    const currency = currencyText.textContent || "USD";
    const batchSize = parseInt(contractsPerTriggerOver2Input.value, 10) || 1;
    const overBarrier = overBarrierOver2Input.value.toString();
    const bulkRunToken = "BULK_OVER2_" + Date.now();

    for (let i = 0; i < batchSize; i++) {
        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": {
                "amount": stake,
                "basis": "stake",
                "contract_type": "DIGITOVER",
                "currency": currency,
                "duration": duration,
                "duration_unit": "t",
                "underlying_symbol": symbol,
                "barrier": overBarrier
            },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));
    }

    bulkOver2TriggersFired += 1;
    const maxTriggers = parseInt(maxTriggersOver2Input.value, 10) || 10;
    if (over2RunProgressDisplay) over2RunProgressDisplay.textContent = `${bulkOver2TriggersFired} / ${maxTriggers}`;
    logToConsole(`[Bulk Over] Trigger digit hit \u2014 bought ${batchSize} Over ${overBarrier} contracts. (${bulkOver2TriggersFired}/${maxTriggers} triggers)`, "success-msg");

    if (bulkOver2TriggersFired >= maxTriggers) {
        logToConsole("[Bulk Over] Max trigger cap reached. Disarming.", "success-msg");
        disarmBulkOver2();
        return;
    }

    // Short cooldown so one tick's trigger doesn't fire the batch more than once
    bulkOver2Cooldown = true;
    setTimeout(() => { bulkOver2Cooldown = false; }, (duration * 2000) + 500);
}

// --- TAB NAVIGATION LOGIC ---
const dashboardContainer = document.querySelector('.dashboard-container');
const focusBar = document.getElementById('focus-bar');
const btnExitFocus = document.getElementById('btn-exit-focus');

function enterFocusMode() {
    if (dashboardContainer) dashboardContainer.classList.add('focus-mode');
    if (focusBar) focusBar.style.display = 'flex';
}

function exitFocusMode() {
    if (dashboardContainer) dashboardContainer.classList.remove('focus-mode');
    if (focusBar) focusBar.style.display = 'none';
}

document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        if (isAutoTradingEO) toggleAutoEO(false);
        if (isAutoTradingOU) toggleAutoOU(false);
        if (isAutoTradingPOU) toggleAutoPOU(false);
        if (isBulkOver2Armed) disarmBulkOver2();
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

        button.classList.add('active');
        activeTabId = button.getAttribute('data-target');
        document.getElementById(activeTabId).classList.add('active');

        // Tapping a strategy narrows the view down to just that strategy
        // and the Ledger, so both can be watched together.
        enterFocusMode();

        logToConsole(`Switched View: ${button.textContent}`, "system-msg");
    });
});

if (btnExitFocus) {
    btnExitFocus.addEventListener('click', exitFocusMode);
}

// Jumping to Setup / Market / Logs via the quick nav should reveal them
// again first -- they're tucked away while focus mode is active.
document.querySelectorAll('.quick-nav-link').forEach(link => {
    const target = link.getAttribute('href');
    if (target === '#section-setup' || target === '#section-market' || target === '#section-logs') {
        link.addEventListener('click', exitFocusMode);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('deriv_pat_token');
    const savedAppId = localStorage.getItem('deriv_app_id');
    if (savedToken) tokenInput.value = savedToken;
    if (savedAppId) appIdInput.value = savedAppId;
});

// --- API SYNC EXECUTION CONNECTIONS ---
btnFetch.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    if (!token || !appId) return;
    
    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts`, {
            method: 'GET',
            headers: { 'Deriv-App-ID': appId, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const result = JSON.parse(await response.text());
        accountList = result.data || [];
        localStorage.setItem('deriv_pat_token', token);
        localStorage.setItem('deriv_app_id', appId);
        apiStatus.textContent = "Synced";
        populateDropdown(accountList);
    } catch (e) { logToConsole(e.message, "error-msg"); }
});

btnToggleAutoBEO.addEventListener("click", () => {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Cannot start automation without an active stream link.", "error-msg");
        return;
    }

    if (isAutoModeBEO) {
        stopAutoBulkModeBEO();
    } else {
        startAutoBulkModeBEO();
    }
});

document.getElementById("btn-clear-ledger").addEventListener("click", () => {
    const ledgerBody = document.getElementById("ledger-body");

    if (!ledgerBody) {
        console.error("CRITICAL: ledger-body not found in the DOM!");
        return;
    }

    // 1. Remove all existing content
    ledgerBody.innerHTML = '';

    // 2. Explicitly create the empty row element
    const emptyRow = document.createElement('tr');
    emptyRow.id = 'ledger-empty-row';
    emptyRow.innerHTML = `
        <td colspan="3" style="text-align: center; color: #888; padding: 20px;">
            No bulk operations logged in this session yet.
        </td>
    `;

    // 3. Append it
    ledgerBody.appendChild(emptyRow);

    // 4. Reset your stats
    totalTradesExecutedTN = 0;
    if (typeof totalSessionProfit !== 'undefined') {
        totalSessionProfit = 0;
        updateSessionProfitUI();
    }

    logToConsole("Ledger cleared successfully.");
});

function addToLedger(data) {
    const ledgerBody = document.getElementById("ledger-body");
    const emptyRow = document.getElementById("ledger-empty-row");

    // 1. If the empty row exists, remove it before adding the new trade
    if (emptyRow) {
        ledgerBody.innerHTML = ""; // This wipes the "No operations" text clean
    }

    // 2. Create the new row
    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${data.type}</td>
        <td>${data.spot}</td>
        <td style="text-align: right;">${data.price}</td>
    `;

    // 3. Add the row to the table
    ledgerBody.appendChild(row);
}

function startAutoBulkModeBEO() {
    isAutoModeBEO = true;
    totalTradesExecutedBEO = 0; // Reset runtime session counts
    trackingSettledContractsBEO = 0;
    
    btnToggleAutoBEO.textContent = "Stop Auto Mode";
    btnToggleAutoBEO.style.backgroundColor = "#ff3b30"; // Warning red
    btnToggleAutoBEO.style.color = "#ffffff";
    
    logToConsole("[Auto Engine] Bulk Even/Odd Automation Started...", "success-msg");
    
    // Fire the initial sequence instantly
    executeBulkEvenOddPair();
}

function stopAutoBulkModeBEO() {
    isAutoModeBEO = false;
    btnToggleAutoBEO.textContent = "Start Auto Bulk Mode";
    btnToggleAutoBEO.style.backgroundColor = ""; // Reverts to system styles
    btnToggleAutoBEO.style.color = "";
    logToConsole("[Auto Engine] Bulk Even/Odd Automation Stopped by user request.");
}
function populateDropdown(accounts) {
    dropdown.innerHTML = "";
    accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.account_id;
        opt.textContent = `${acc.account_id} (${acc.account_type})`;
        dropdown.appendChild(opt);
    });
    dropdown.disabled = false;
    updateActiveAccountView(accounts[0].account_id);
}

dropdown.addEventListener('change', (e) => {
    disconnectExistingStream();
    updateActiveAccountView(e.target.value);
});

function updateActiveAccountView(accountId) {
    const selected = accountList.find(a => a.account_id === accountId);
    if (!selected) return;
    balanceText.textContent = selected.balance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    currencyText.textContent = selected.currency;
    badge.textContent = selected.account_type;
    badge.className = `badge ${selected.account_type}`;
if (selected.account_type === 'demo') {
        btnResetBalance.style.display = 'block';
        btnResetBalance.disabled = false;
    } else {
        btnResetBalance.style.display = 'none';
    }
    logToConsole(`Switched active context to: ${accountId}`);
}

/**
 * 2. Reset Demo Account Balance (POST)
 */
btnResetBalance.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    const activeAccountId = dropdown.value;

    if (!activeAccountId) return;
    btnResetBalance.disabled = true;

    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts/${activeAccountId}/reset-demo-balance`, {
            method: 'POST',
            headers: {
                'Deriv-App-ID': appId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const responseText = await response.text();
        if (!response.ok) {
            const errorJson = JSON.parse(responseText);
            throw new Error(errorJson.errors ? errorJson.errors[0].message : "Reset failed");
        }

        const result = JSON.parse(responseText);
        logToConsole(`Demo balance successfully reset to ${result.data.balance} ${result.data.currency}.`, "success-msg");
        
        const targetAcc = accountList.find(a => a.account_id === activeAccountId);
        if (targetAcc) {
            targetAcc.balance = result.data.balance;
            updateActiveAccountView(activeAccountId);
        }
    } catch (error) {
        logToConsole(`Reset Failed: ${error.message}`, "error-msg");
    } finally {
        btnResetBalance.disabled = false;
    }
})

// --- WEBSOCKET ROUTING SWITCHBOARD ---
btnToggleStream.addEventListener('click', async () => {
    if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN) {
        disconnectExistingStream();
        return;
    }
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    const activeAccountId = dropdown.value;
    if (!activeAccountId) return;

    btnToggleStream.disabled = true;
    
    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts/${activeAccountId}/otp`, {
            method: 'POST',
            headers: { 'Deriv-App-ID': appId, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const result = JSON.parse(await response.text());
        const wsUrl = result.data.url;
        
        optionsWebSocket = new WebSocket(wsUrl);

        optionsWebSocket.onopen = () => {
            logToConsole("Connected! Live Stream Active.", "success-msg");
            const token = tokenInput.value.trim();
    optionsWebSocket.send(JSON.stringify({ "authorize": token }));
            btnToggleStream.disabled = false;
            btnToggleStream.textContent = "Disconnect Stream";
            btnToggleStream.classList.add('stream-active');
            marketPanel.style.display = 'flex';
            
            updateTradeControlsState(true);
            optionsWebSocket.send(JSON.stringify({ "active_symbols": "brief" }));
            optionsWebSocket.send(JSON.stringify({ "active_symbols": "brief" }));

        };
optionsWebSocket.onmessage = (event) => {
    
    const incoming = JSON.parse(event.data);
    if (incoming.error) {
        logToConsole(`Error: ${incoming.error.message}`, "error-msg");
        return;
    }
    if (incoming.msg_type === "topup_virtual") {
        logToConsole("Balance reset successful!", "success-msg");
        optionsWebSocket.send(JSON.stringify({ "balance": 1, "subscribe": 1 }));
    } else if (incoming.msg_type === "balance") {
        // Assuming you have a function to update your UI balance
        updateBalanceUI(incoming.balance);
    }
    if (incoming.msg_type === "active_symbols") {
        populateMarketDropdown(incoming.active_symbols);
    } else if (incoming.msg_type === "tick") {
        handleIncomingTickPacket(incoming.tick);
    } else if (incoming.msg_type === "buy") {
        handlePurchaseReceipt(incoming.buy);
    } else if (incoming.msg_type === "proposal_open_contract") {
        // REQUIREMENT 1: Properly route the streaming response object
        handleContractUpdate(incoming.proposal_open_contract);
    }
};

        optionsWebSocket.onclose = () => disconnectExistingStream();

    } catch (error) {
        disconnectExistingStream();
    }
});


function populateMarketDropdown(symbolsArray) {
    marketDropdown.innerHTML = "";
    symbolsArray.forEach(sym => {
        const opt = document.createElement('option');
        opt.value = sym.underlying_symbol;
        opt.textContent = sym.underlying_symbol_name;
        marketDropdown.appendChild(opt);
    });
    subscribeToSymbolTicks(symbolsArray[0].underlying_symbol);
}

marketDropdown.addEventListener('change', (e) => {
    if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN && e.target.value) {
        subscribeToSymbolTicks(e.target.value);
    }
});

function subscribeToSymbolTicks(symbolCode) {
    if (optionsWebSocket) optionsWebSocket.send(JSON.stringify({ "ticks": symbolCode }));
}

// --- AUTO ENGINE RUNNER AND TICK PROCESSING ---
function handleIncomingTickPacket(tickData) {
    if (!tickData || !tickData.quote) return;
    const priceString = tickData.quote.toString();
    const lastDigit = parseInt(priceString.charAt(priceString.length - 1), 10);
    
    liveTickValue.textContent = tickData.quote.toLocaleString(undefined, { minimumFractionDigits: 2 });
    liveDigitValue.textContent = lastDigit;

    // Maintain a rolling 2-tick window for the Pattern Over/Under strategy
    recentDigitHistory.push(lastDigit);
    if (recentDigitHistory.length > 2) recentDigitHistory.shift();
    if (patternDigitHistoryDisplay) {
        patternDigitHistoryDisplay.textContent = recentDigitHistory.join(' ') || '--';
    }

    if (activeTabId === 'tab-pattern-ou' && isAutoTradingPOU && !patternCooldown) {
        const maxAllowed = parseInt(maxTradesPOUInput.value, 10) || 10;
        if (totalTradesExecutedPOU + 1 > maxAllowed) {
            logToConsole(`[Pattern OU] Max trade cap reached (${totalTradesExecutedPOU}/${maxAllowed}). Stopping execution.`, "system-msg");
            toggleAutoPOU(false);
        } else {
            const match = matchDigitPattern(recentDigitHistory);
            if (match) {
                logToConsole(`[Pattern OU] Detected ${recentDigitHistory.join(',')} -> firing ${match.label}`, "success-msg");
                if (patternLastMatchDisplay) patternLastMatchDisplay.textContent = `${match.label} @ ${new Date().toLocaleTimeString()}`;
                executePatternOverUnder(match);
                // Reset history so the same two digits can't immediately re-trigger the next tick
                recentDigitHistory = [];
            }
        }
    }

    if (activeTabId === 'tab-bulk-ou' && isBulkOver2Armed && !bulkOver2Cooldown) {
        const isDoubleMode = triggerModeOver2Select && triggerModeOver2Select.value === 'double';
        if (isDoubleMode) {
            const digitA = parseInt(triggerDigitOver2Input.value, 10);
            const digitB = parseInt(triggerDigit2Over2Input.value, 10);
            if (matchConsecutivePair(recentDigitHistory, digitA, digitB)) {
                fireBulkOver2Batch();
                // Reset history so the same two digits can't immediately re-trigger the next tick
                recentDigitHistory = [];
            }
        } else {
            const triggerDigit = parseInt(triggerDigitOver2Input.value, 10);
            if (lastDigit === triggerDigit) {
                fireBulkOver2Batch();
            }
        }
    }

    if (activeTabId === 'tab-even-odd' && isAutoTradingEO) {
        const isEven = lastDigit % 2 === 0;
        const selectedMode = strategyModeEO.value;
        if ((selectedMode === "DIGITEVEN" && isEven) || (selectedMode === "DIGITODD" && !isEven)) {
            executeContractEO();
        }
    } 
    else if (activeTabId === 'tab-bulk-ou' && isAutoTradingOU && !autoBulkCooldown) {
        const maxAllowed = parseInt(maxTradesOUInput.value, 10) || 10;
        
        // Safety check: Does firing the next pair exceed the limit?
        if (totalTradesExecutedOU + 2 > maxAllowed) {
            logToConsole(`[Bot Auto Stop] Max trade cap reached (${totalTradesExecutedOU}/${maxAllowed}). Stopping execution.`, "system-msg");
            toggleAutoOU(false);
            return;
        }

        logToConsole(`[Bulk Auto Triggered] Firing paired strategy...`, "system-msg");
        executeBulkOverUnderPair();
        
        const durationTicks = parseInt(tradeDurationOU.value, 10);
        autoBulkCooldown = true;
        btnBuyOU.disabled = true; 
        
        setTimeout(() => {
            autoBulkCooldown = false;
            if(!isAutoTradingOU) btnBuyOU.disabled = false;
        }, (durationTicks * 2000) + 1200); 
    }
}

// --- CONTRACT ORDER PLACEMENT CONTROLLERS ---
function executeBulkEvenOddPair() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }

    const maxCap = parseInt(maxTradesBEO.value, 10);
    
    // Safety check: Ensure the new pair won't push us past the user's defined ceiling limit
    if (totalTradesExecutedBEO + 2 > maxCap) {
        logToConsole(`[Bulk EO] Halt: Running this pair would exceed your Max Trades Run Cap of ${maxCap}.`, "error-msg");
        return;
    }
    
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeBEO.value);
    const duration = parseInt(tradeDurationBEO.value, 10);
    const currency = currencyText.textContent || "USD";
    
    const bulkRunToken = "BULK_EO_" + Date.now();

    const payloadEven = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITEVEN",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    const payloadOdd = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITODD",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    logToConsole(`[${bulkRunToken}] Synchronizing parallel Even/Odd executions...`);
    
    optionsWebSocket.send(JSON.stringify(payloadEven));
    optionsWebSocket.send(JSON.stringify(payloadOdd));

    // Increment counter tracking by 2 since we just fired a pair
    totalTradesExecutedBEO += 2;
    logToConsole(`[Bulk EO Run Status]: ${totalTradesExecutedBEO} / ${maxCap} individual contracts executed.`);
}
function executeContractEO() {
    if (!optionsWebSocket) return;
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeEO.value);
    
    const payload = {
        "buy": "1",
        "price": stake,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": strategyModeEO.value,
            "currency": currencyText.textContent || "USD",
            "duration": parseInt(tradeDurationEO.value, 10),
            "duration_unit": "t",
            "underlying_symbol": symbol
        }
    };
    logToConsole(`Sending EO Order: $${stake}...`);
    optionsWebSocket.send(JSON.stringify(payload));
}

function executeBulkOverUnderPair() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }
    
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeOU.value);
    const duration = parseInt(tradeDurationOU.value, 10);
    const currency = currencyText.textContent || "USD";
    
    const overDigit = predOverInput.value.toString();
    const underDigit = predUnderInput.value.toString();

    // 1. GENERATE A UNIQUE RUN TIMESTAMP ID FOR PASSTHROUGH LOGGING
    // This tags both contracts as twins so the system matches them to the exact execution frame
    const bulkRunToken = "BULK_" + Date.now();

    const payloadOver = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITOVER",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t", // 't' guarantees tick-locked expiration
            "underlying_symbol": symbol,
            "barrier": overDigit
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    const payloadUnder = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITUNDER",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol,
            "barrier": underDigit
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    logToConsole(`[${bulkRunToken}] Synchronizing parallel execution parameters...`);
    
    // 2. IMMEDIATE PIPELINE TRANSMISSION
    // Sending these back-to-back inside the same microtask queue ensures the server 
    // processes the buy requests sequentially against the same underlying market tick rate.
    optionsWebSocket.send(JSON.stringify(payloadOver));
    optionsWebSocket.send(JSON.stringify(payloadUnder));

    totalTradesExecutedOU += 2;
}

function executePatternOverUnder(match) {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }

    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakePOU.value);
    const duration = parseInt(tradeDurationPOU.value, 10);
    const currency = currencyText.textContent || "USD";
    const bulkRunToken = "PATTERN_OU_" + Date.now();

    const payload = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": match.contract_type,
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol,
            "barrier": match.barrier
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    optionsWebSocket.send(JSON.stringify(payload));
    totalTradesExecutedPOU += 1;
    logToConsole(`[Pattern OU Run Status]: ${totalTradesExecutedPOU} / ${maxTradesPOUInput.value} contracts executed.`);

    // Brief cooldown so we don't fire twice while this tick's downstream messages settle
    patternCooldown = true;
    setTimeout(() => { patternCooldown = false; }, (duration * 2000) + 500);
}

btnToggleAutoPOU.addEventListener('click', () => toggleAutoPOU(!isAutoTradingPOU));
function toggleAutoPOU(state) {
    isAutoTradingPOU = state;
    btnToggleAutoPOU.textContent = state ? "Stop Pattern Auto-Mode" : "Start Pattern Auto-Mode";
    btnToggleAutoPOU.classList.toggle('stream-active', state);

    tradeStakePOU.disabled = state;
    tradeDurationPOU.disabled = state;
    maxTradesPOUInput.disabled = state;

    if (state) {
        patternCooldown = false;
        totalTradesExecutedPOU = 0;
        recentDigitHistory = [];
        if (patternLastMatchDisplay) patternLastMatchDisplay.textContent = "None";
        logToConsole(`Pattern Auto-Mode Started. Cap Target: ${maxTradesPOUInput.value} trades. Watching for 1/2 and 7/8 sequences...`, "success-msg");
    } else {
        logToConsole("Pattern Auto-Mode Stopped.");
    }
}

// --- PORTFOLIO LEDGER DOM DATA HYDRATION ---
function handlePurchaseReceipt(buyReceipt) {
    if (!buyReceipt || !buyReceipt.contract_id) return;
    logToConsole(`[Receipt] ID: ${buyReceipt.contract_id} | ${buyReceipt.shortcode}`, "success-msg");
    
    if (buyReceipt.balance_after) {
        balanceText.textContent = buyReceipt.balance_after.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }

    // REQUIREMENT 2: Instantly request proposal_open_contract subscription stream
    if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN) {
        optionsWebSocket.send(JSON.stringify({
            "proposal_open_contract": 1,
            "contract_id": buyReceipt.contract_id,
            "subscribe": 1
        }));
    }

    if (emptyRow) emptyRow.remove();

    const isOver = buyReceipt.shortcode.includes("DIGITOVER");
    const directionArrow = isOver 
        ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 1.1rem;">↗</span>` 
        : `<span style="color: var(--accent-red); font-weight: bold; font-size: 1.1rem;">↘</span>`;

    const marketRaw = marketDropdown.value || "";
    const marketBadge = marketRaw.includes("10") ? "10s" : "100s"; 

    const tr = document.createElement('tr');
    tr.id = `contract-row-${buyReceipt.contract_id}`;
    tr.innerHTML = `
        <td>
            <div class="type-cell-wrapper">
                <span class="market-mini-badge">${marketBadge}</span>
                ${directionArrow}
            </div>
        </td>
        <td>
            <div class="spot-row">
                <span class="dot entry-dot"></span>
                <span class="row-entry-price">--.--</span>
            </div>
            <div class="spot-row">
                <span class="dot exit-dot"></span>
                <span class="row-exit-digit">--.--</span>
            </div>
        </td>
        <td class="price-col">
            <div class="row-buy-price">${parseFloat(buyReceipt.buy_price || tradeStakeOU.value).toFixed(2)} USD</div>
            <div class="row-profit-loss" style="color: var(--text-secondary);">--.--</div>
        </td>
    `;
    ledgerBody.insertBefore(tr, ledgerBody.firstChild);
}
function handleContractUpdate(contract) {
    if (!contract || !contract.contract_id) return;

    // TN bulk auto-continuation (kept from the original pre-existing logic)
    if (contract.status === "won" || contract.status === "lost") {
        if (contract.passthrough?.bulkRunId?.startsWith("BULK_TN_")) {
            if (isAutoModeTN && totalTradesExecutedTN < parseInt(maxTradesTN.value)) {
                setTimeout(executeBulkTouchNoTouch, 1000);
            } else if (isAutoModeTN) {
                logToConsole("Max Touch/No Touch runs reached.");
                isAutoModeTN = false;
            }
        }
    }

    const row = document.getElementById(`contract-row-${contract.contract_id}`);
    if (!row) return; // Wait until receipt function renders row container shell

    const currencySymbol = contract.currency || "USD";

    // Update Buy Price row text if available
    if (contract.buy_price) {
        row.querySelector('.row-buy-price').textContent = `${parseFloat(contract.buy_price).toFixed(2)} ${currencySymbol}`;
    }

    // Update Entry Spot visual text
    if (contract.entry_spot) {
        row.querySelector('.row-entry-price').textContent = parseFloat(contract.entry_spot).toFixed(2);
    }

    // Update Exit or Current Spot text in real-time
    if (contract.exit_spot || contract.current_spot) {
        const activeSpot = contract.exit_spot || contract.current_spot;
        row.querySelector('.row-exit-digit').textContent = parseFloat(activeSpot).toFixed(2);
    }

    // Update Profit/Loss visualization colors and strings
    if (contract.profit !== undefined) {
        const profitValue = parseFloat(contract.profit);
        const profitCell = row.querySelector('.row-profit-loss');

        if (contract.status === "open") {
            profitCell.textContent = `${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.style.color = profitValue >= 0 ? "var(--accent-green)" : "var(--accent-red)";
        } else if (contract.status === "won") {
            profitCell.textContent = `${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.className = "row-profit-loss text-win";
            profitCell.style.color = "var(--text-primary)";
        } else if (contract.status === "lost") {
            profitCell.textContent = `${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.className = "row-profit-loss text-loss";
            profitCell.style.color = "var(--accent-red)";
        }

        // Accrue session P/L exactly once per contract, on final settlement
        if ((contract.status === "won" || contract.status === "lost") && row.dataset.settled !== "1") {
            row.dataset.settled = "1";
            totalSessionProfit += profitValue;
            updateSessionProfitUI();
            checkTPSLHit();
        }
    }

    // Unsubscribe from closed stream mappings using connection unique 'id'
    if (contract.is_expired === 1 || contract.status === "won" || contract.status === "lost") {
        if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN && contract.id) {
            optionsWebSocket.send(JSON.stringify({
                "forget": contract.id
            }));
            logToConsole(`[Cleanup] Sent forget handshake for subscription ID: ${contract.id}`);
        }
    }
}

// --- INTERFACE CONTROL HANDLERS ---
btnBuyEO.addEventListener('click', executeContractEO);
btnBuyOU.addEventListener('click', executeBulkOverUnderPair);

btnToggleAutoEO.addEventListener('click', () => toggleAutoEO(!isAutoTradingEO));
function toggleAutoEO(state) {
    isAutoTradingEO = state;
    btnToggleAutoEO.textContent = state ? "Stop Auto Mode" : "Start Auto-Mode";
    btnToggleAutoEO.classList.toggle('stream-active', state);
    btnBuyEO.disabled = state;
    if(state) logToConsole("EO Auto-Mode Active.", "success-msg");
}

btnToggleAutoOU.addEventListener('click', () => toggleAutoOU(!isAutoTradingOU));
function toggleAutoOU(state) {
    isAutoTradingOU = state;
    btnToggleAutoOU.textContent = state ? "Stop Auto Bulk Mode" : "Start Auto Bulk Mode";
    btnToggleAutoOU.classList.toggle('stream-active', state);
    
    predOverInput.disabled = state;
    predUnderInput.disabled = state;
    tradeStakeOU.disabled = state;
    tradeDurationOU.disabled = state;
    maxTradesOUInput.disabled = state;
    
    if(state) {
        autoBulkCooldown = false; 
        totalTradesExecutedOU = 0; // Reset execution counter for new session run
        logToConsole(`Bulk Auto-Mode Started. Cap Target: ${maxTradesOUInput.value} total trades. Waiting for next tick...`, "success-msg");
    }
}

const btnBuyTN = document.getElementById("btn-buy-tn");
const btnToggleAutoTN = document.getElementById("btn-toggle-auto-tn");
const tradeStakeTN = document.getElementById("trade-stake-tn");
const tradeBarrierTN = document.getElementById("trade-barrier-tn");
const maxTradesTN = document.getElementById("max-trades-tn");

let isAutoModeTN = false;
let totalTradesExecutedTN = 0;

function executeBulkTouchNoTouch() {
    
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: WebSocket not connected.", "error-msg");
        return;
    }

    const stake = parseFloat(tradeStakeTN.value);
    const barrierValue = parseFloat(tradeBarrierTN.value);
    const barrierStr = (barrierValue >= 0 ? "+" : "") + barrierValue.toFixed(3); 
    const duration = parseInt(document.getElementById("trade-duration-tn").value) || 5;
    const bulkRunToken = "BULK_TN_" + Date.now();

    const baseParams = {
        "amount": stake,
        "basis": "stake",
        "currency": currencyText.textContent || "USD",
        "duration": duration,
        "duration_unit": "t",
        "underlying_symbol": marketDropdown.value,
        "barrier": barrierStr
    };

    optionsWebSocket.send(JSON.stringify({
        "buy": 1,
        "price": stake,
        "parameters": { ...baseParams, "contract_type": "ONETOUCH" },
        "passthrough": { "bulkRunId": bulkRunToken }
    }));

    optionsWebSocket.send(JSON.stringify({
        "buy": 1,
        "price": stake,
        "parameters": { ...baseParams, "contract_type": "NOTOUCH" },
        "passthrough": { "bulkRunId": bulkRunToken }
    }));

    totalTradesExecutedTN += 2;
    logToConsole(`[TN] Sent pair batch. Barrier: ${barrierStr}, Dur: ${duration}`);
}

// 3. THE REGISTRATION (This must be OUTSIDE the function)
if (btnBuyTN) {
    btnBuyTN.addEventListener("click", executeBulkTouchNoTouch);
    console.log("Event listener attached successfully to btn-buy-tn");
} else {
    console.error("CRITICAL: btn-buy-tn not found in the DOM!");
}

// Link the button to the function
document.getElementById("btn-reset-balance").addEventListener("click", () => {
    if (confirm("Are you sure you want to reset your demo balance to 10,000 USD?")) {
        resetDemoBalance();
    }
});

// The Reset Function
function resetDemoBalance() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: WebSocket not connected.", "error-msg");
        return;
    }

    optionsWebSocket.send(JSON.stringify({
        "topup_virtual": 1
    }));
    
    logToConsole("Requesting balance reset...");
}

function updateTradeControlsState(isActive) {
    const isReady = isActive && optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN;
    btnBuyEO.disabled = !isReady;
    btnToggleAutoEO.disabled = !isReady;
    btnBuyOU.disabled = !isReady;
    btnToggleAutoOU.disabled = !isReady;
    btnToggleAutoPOU.disabled = !isReady;
    btnBuyBulkOver2.disabled = !isReady;
    if (!isReady) { toggleAutoEO(false); toggleAutoOU(false); toggleAutoPOU(false); if (isBulkOver2Armed) disarmBulkOver2(); }
}

function disconnectExistingStream() {
    if (optionsWebSocket) { optionsWebSocket.close(); optionsWebSocket = null; }
    updateTradeControlsState(false);
    marketPanel.style.display = 'none';
    btnToggleStream.disabled = false;
    btnToggleStream.textContent = "Connect Real-Time Stream";
    btnToggleStream.classList.remove('stream-active');
}

function logToConsole(message, className = "") {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight;
}

// --- QUICK NAV SCROLLSPY (purely cosmetic, fully self-guarded) ---
// Highlights whichever section is currently in view so the sticky
// top nav reflects scroll position instead of just being static links.
(function initQuickNavScrollspy() {
    const navLinks = document.querySelectorAll('.quick-nav-link');
    if (!navLinks.length) return;

    const targets = Array.from(navLinks)
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (!targets.length || !('IntersectionObserver' in window)) return;

    const linkFor = (id) => document.querySelector(`.quick-nav-link[href="#${id}"]`);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const link = linkFor(entry.target.id);
            if (!link) return;
            if (entry.isIntersecting) {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    targets.forEach(t => observer.observe(t));
})();
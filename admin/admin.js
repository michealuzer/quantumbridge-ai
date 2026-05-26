const config = window.QUANTUMTRADE_ADMIN_CONFIG;
const supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

const state = {
    session: null,
    profiles: [],
    plans: [],
    investments: [],
    projects: [],
    withdrawals: []
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    bindAuth();
    bindForms();
    const { data } = await supabaseClient.auth.getSession();
    state.session = data.session;
    await syncUi();
});

function bindAuth() {
    $('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setMessage('login-message', 'Signing in...');
        const email = $('admin-email').value.trim();
        const password = $('admin-password').value;
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            setMessage('login-message', error.message, true);
            return;
        }
        state.session = data.session;
        await syncUi();
    });

    $('logout-button').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        state.session = null;
        state.profiles = [];
        state.plans = [];
        state.investments = [];
        state.projects = [];
        state.withdrawals = [];
        await syncUi();
    });

    $('refresh-data').addEventListener('click', () => loadAdminData());
}

function bindForms() {
    $('investment-select').addEventListener('change', fillInvestmentForm);

    $('investment-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.submitter;
        setBusy(button, true);
        setMessage('investment-message', 'Updating investment...');
        const body = {
            action: 'update_investment',
            investment_id: $('investment-select').value,
            plan_id: $('investment-plan').value,
            principal_usd: Number($('investment-principal').value),
            day_number: Number($('investment-day').value),
            status: $('investment-status').value
        };
        const result = await invoke('admin-portfolio', body);
        setBusy(button, false);
        if (result.error) {
            setMessage('investment-message', result.error, true);
            return;
        }
        setMessage('investment-message', 'Investment updated.');
        await loadAdminData();
    });

    $('project-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.submitter;
        setBusy(button, true);
        setMessage('project-message', 'Adding project...');
        const body = {
            action: 'create_project',
            user_id: $('project-user').value,
            symbol: $('project-symbol').value,
            side: $('project-side').value,
            risk: $('project-risk').value,
            result_percent: Number($('project-result').value),
            status: $('project-status').value
        };
        const result = await invoke('admin-portfolio', body);
        setBusy(button, false);
        if (result.error) {
            setMessage('project-message', result.error, true);
            return;
        }
        $('project-symbol').value = '';
        setMessage('project-message', 'Project added.');
        await loadAdminData();
    });
}

async function syncUi() {
    const loggedIn = Boolean(state.session);
    $('login-panel').classList.toggle('hidden', loggedIn);
    $('admin-panel').classList.toggle('hidden', !loggedIn);
    if (!loggedIn) return;

    $('admin-session-email').textContent = state.session.user.email || '';
    await loadAdminData();
}

async function loadAdminData() {
    setMessage('withdrawal-status', 'Loading...');
    const [portfolioResult, withdrawalResult] = await Promise.all([
        invoke('admin-portfolio', { action: 'list' }),
        invoke('withdrawal-admin', { action: 'list' })
    ]);

    if (portfolioResult.error || withdrawalResult.error) {
        const message = portfolioResult.error || withdrawalResult.error;
        setMessage('withdrawal-status', message, true);
        if (String(message).toLowerCase().includes('admin')) {
            $('admin-panel').classList.add('hidden');
            $('login-panel').classList.remove('hidden');
            setMessage('login-message', 'This admin desk is only available to the owner account.', true);
        }
        return;
    }

    state.profiles = portfolioResult.profiles || [];
    state.plans = portfolioResult.plans || [];
    state.investments = portfolioResult.investments || [];
    state.projects = portfolioResult.projects || [];
    state.withdrawals = withdrawalResult.withdrawals || [];

    setMessage('withdrawal-status', 'Live data loaded.');
    renderStats();
    renderWithdrawals();
    renderInvestmentControls();
    renderProjects();
}

async function invoke(functionName, body) {
    const { data, error } = await supabaseClient.functions.invoke(functionName, { body });
    if (error) return { error: error.message };
    return data || {};
}

function renderStats() {
    const activePrincipal = state.investments
        .filter((investment) => investment.status === 'active')
        .reduce((sum, investment) => sum + Number(investment.principal_usd || 0), 0);
    const pendingPayouts = state.withdrawals
        .filter((withdrawal) => withdrawal.status === 'pending')
        .reduce((sum, withdrawal) => sum + Number(withdrawal.amount_usd || 0), 0);

    $('stat-principal').textContent = formatUsd(activePrincipal, 0);
    $('stat-pending').textContent = formatUsd(pendingPayouts, 0);
    $('stat-investors').textContent = String(state.profiles.length);
    $('stat-projects').textContent = String(state.projects.length);
}

function renderWithdrawals() {
    const list = $('withdrawals-list');
    if (!state.withdrawals.length) {
        list.innerHTML = '<p class="muted">No payout requests yet.</p>';
        return;
    }

    list.innerHTML = state.withdrawals.map((withdrawal) => {
        const profile = withdrawal.profile || {};
        const details = renderDetails(withdrawal.details || {});
        const paid = withdrawal.status === 'completed';
        return `
            <article class="row-card">
                <div>
                    <h3>${escapeHtml(profile.display_name || profile.email || 'Investor')}</h3>
                    <p>${escapeHtml(profile.investor_code || '')} · ${formatMethod(withdrawal.method)} · ${timeAgo(withdrawal.created_at)}</p>
                    <p>${details}</p>
                </div>
                <div>
                    <strong>${formatUsd(withdrawal.amount_usd)}</strong>
                    <p><span class="pill ${escapeHtml(withdrawal.status)}">${escapeHtml(withdrawal.status)}</span></p>
                    <div class="mini-actions">
                        ${paid ? '' : `<button type="button" data-mark-paid="${escapeHtml(withdrawal.id)}">Mark Paid</button>`}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    list.querySelectorAll('[data-mark-paid]').forEach((button) => {
        button.addEventListener('click', async () => {
            setBusy(button, true);
            const result = await invoke('withdrawal-admin', {
                action: 'mark_paid',
                withdrawal_id: button.dataset.markPaid,
                admin_note: 'Paid from admin desk'
            });
            setBusy(button, false);
            if (result.error) {
                setMessage('withdrawal-status', result.error, true);
                return;
            }
            setMessage('withdrawal-status', 'Payout marked paid.');
            await loadAdminData();
        });
    });
}

function renderInvestmentControls() {
    const investmentSelect = $('investment-select');
    const planSelect = $('investment-plan');
    const projectUser = $('project-user');

    investmentSelect.innerHTML = state.investments.map((investment) => {
        const profile = investment.profile || {};
        const label = `${profile.email || profile.investor_code || 'Investor'} · ${investment.plan?.name || 'No plan'} · ${formatUsd(investment.principal_usd, 0)}`;
        return `<option value="${escapeHtml(investment.id)}">${escapeHtml(label)}</option>`;
    }).join('');

    planSelect.innerHTML = state.plans.map((plan) => (
        `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)} · ${formatPercent(plan.daily_return_percent)} · ${Number(plan.duration_days)} days</option>`
    )).join('');

    projectUser.innerHTML = state.profiles.map((profile) => (
        `<option value="${escapeHtml(profile.user_id)}">${escapeHtml(profile.email || profile.investor_code || 'Investor')}</option>`
    )).join('');

    fillInvestmentForm();
}

function fillInvestmentForm() {
    const investment = state.investments.find((item) => item.id === $('investment-select').value);
    if (!investment) return;
    $('investment-plan').value = investment.plan_id || '';
    $('investment-principal').value = Number(investment.principal_usd || 0).toFixed(2);
    $('investment-day').value = Number(investment.day_number || 1);
    $('investment-status').value = investment.status || 'active';
}

function renderProjects() {
    const list = $('projects-list');
    if (!state.projects.length) {
        list.innerHTML = '<p class="muted">No portfolio projects have been assigned yet.</p>';
        return;
    }

    list.innerHTML = state.projects.map((project) => {
        const profile = project.profile || {};
        return `
            <article class="row-card">
                <div>
                    <h3>${escapeHtml(project.symbol)}</h3>
                    <p>${escapeHtml(profile.email || profile.investor_code || 'Investor')} · ${escapeHtml(project.side)} · ${escapeHtml(project.risk)} · ${formatPercent(project.result_percent)}</p>
                </div>
                <div>
                    <span class="pill ${escapeHtml(project.status)}">${escapeHtml(project.status)}</span>
                    <p>${timeAgo(project.placed_at)}</p>
                </div>
            </article>
        `;
    }).join('');
}

function renderDetails(details) {
    return Object.entries(details || {})
        .filter(([, value]) => value)
        .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
        .join(' · ');
}

function formatUsd(value, fractionDigits = 2) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    }).format(Number(value || 0));
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(Number(value) % 1 === 0 ? 0 : 2)}%`;
}

function formatMethod(method) {
    if (method === 'bank_transfer') return 'Bank Transfer';
    if (method === 'bitcoin') return 'Bitcoin Wallet';
    return 'Mobile Money';
}

function timeAgo(value) {
    const then = new Date(value).getTime();
    const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
}

function setMessage(id, message, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(error));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char] || char));
}

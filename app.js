document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('screen-container');
    const loadingState = document.getElementById('loading-state');
    const controlPanel = document.getElementById('control-panel');

    setTimeout(() => {
        controlPanel.classList.remove('opacity-0', 'translate-y-[20px]', 'md:translate-y-[-20px]');
    }, 500);

    const routes = {
        '': 'landing_page_cf30eeb862a24f0d81686bdf5005f465.html',
        'landing': 'landing_page_cf30eeb862a24f0d81686bdf5005f465.html',
        'dashboard': 'investor_dashboard_a7c0192a26844367b8fc7a4d11352c80.html',
        'explorer': 'strategy_explorer_2b4beb1456194cc985e2c8907e494d93.html',
        'live_projects': 'investor_dashboard_a7c0192a26844367b8fc7a4d11352c80.html',
        'history': 'trade_history_db3848ead2c04f448eca94c0a199dd67.html',
        'insights': 'ai_insights_0910f63b98ed44daa92811f4d7a4036a.html',
        'onboarding': 'start_investing_7d88bd4af5574b1883d479dd95a67dda.html',
        'elite_tier': 'elite_strategy_tier_4482adec500f47f1b95d8532f235d50d.html',
        'terminal': 'trading_terminal_f6d9d0b2d1f74cf2851136e1d48489bb.html',
        'payment': 'payment_authorization.html',
        'login': 'login.html',
        'signup': 'signup.html',
        'reset-password': 'reset_password.html'
    };

    const publicRoutes = new Set(['', 'landing', 'explorer', 'login', 'signup', 'reset-password']);
    const authRoutes = new Set(['login', 'signup']);
    let currentDynamicStyles = [];
    let currentSession = null;
    let pendingRoute = null;
    captureReferralCode();

    const supabaseConfig = window.QUANTUMBRIDGE_AUTH_CONFIG || window.QUANTUMTRADE_AUTH_CONFIG || {};
    const supabaseLibrary = typeof supabase !== 'undefined'
        ? supabase
        : window.supabase || window.supabaseJs || window.Supabase;
    const hasSupabaseConfig = Boolean(
        supabaseConfig.SUPABASE_URL &&
        supabaseConfig.SUPABASE_ANON_KEY &&
        !supabaseConfig.SUPABASE_URL.includes('SUPABASE_URL') &&
        !supabaseConfig.SUPABASE_ANON_KEY.includes('SUPABASE_ANON_KEY')
    );
    const supabaseClient = hasSupabaseConfig && supabaseLibrary?.createClient
        ? supabaseLibrary.createClient(supabaseConfig.SUPABASE_URL, supabaseConfig.SUPABASE_ANON_KEY)
        : null;

    if (supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        currentSession = data.session;
        syncAuthAwareNav();
        supabaseClient.auth.onAuthStateChange((_event, session) => {
            currentSession = session;
            syncAuthAwareNav();
            refreshRouteData();
        });
    }

    async function loadRoute() {
        captureReferralCode();
        let hash = window.location.hash.replace('#/', '').split('?')[0] || '';
        if (!routes[hash]) hash = '';

        // Handle specific route logic
        if (hash === 'live_projects') {
            window.location.hash = '/dashboard';
            return;
        }

        // Authentication checks
        if (!publicRoutes.has(hash) && !currentSession) {
            pendingRoute = hash;
            window.location.hash = '/login';
            return;
        }

        // Redirect logged-in users away from public-only pages (login, signup, landing)
        if (currentSession && (authRoutes.has(hash) || hash === '' || hash === 'landing')) {
            window.location.hash = '/dashboard';
            return;
        }

        const filename = routes[hash] || routes[''];
        updateActiveNav(hash);

        container.classList.add('opacity-0');
        loadingState.classList.remove('opacity-0', 'pointer-events-none');

        try {
            // Use absolute path with cache-buster to prevent resolution errors and bypass stale cache
            const response = await fetch(`/stitch_screens/${filename}?t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            currentDynamicStyles.forEach(style => style.remove());
            currentDynamicStyles = [];

            doc.querySelectorAll('style').forEach(style => {
                const newStyle = document.createElement('style');
                newStyle.textContent = style.textContent;
                document.head.appendChild(newStyle);
                currentDynamicStyles.push(newStyle);
            });

            document.body.className = `${doc.body.className} overflow-hidden m-0 p-0 w-screen h-[100dvh] flex relative`;

            setTimeout(() => {
                container.innerHTML = `<div class="w-full relative" id="injected-view">${doc.body.innerHTML}</div>`;
                container.appendChild(loadingState);
                interceptLinks();
                bindAuthForms();
                bindFundingForm();
                bindLogoutControls();
                showAuthConfigWarnings();
                hydrateRoute(hash);

                setTimeout(() => {
                    loadingState.classList.add('opacity-0', 'pointer-events-none');
                    container.classList.remove('opacity-0');
                }, 100);
            }, 250);
        } catch (error) {
            console.error(error);
            container.innerHTML = `
                <div class="p-8 text-center mt-20">
                    <h2 class="font-display text-3xl font-bold">Failed to load screen</h2>
                    <p class="mt-2 text-on-surface/60">${error.message}</p>
                    <button onclick="window.location.hash='/dashboard'; window.location.reload();" class="mt-6 px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg">Return to Dashboard</button>
                </div>
            `;
            container.appendChild(loadingState);
            loadingState.classList.add('opacity-0', 'pointer-events-none');
            container.classList.remove('opacity-0');
        }
    }

    function updateActiveNav(hash) {
        syncAuthAwareNav();
        document.querySelectorAll('.cp-link').forEach(link => {
            const href = link.getAttribute('href');
            const isActive = href === `#/${hash}` || (hash === '' && href === '#/landing');
            link.classList.toggle('active', isActive);
        });
    }

    function syncAuthAwareNav() {
        const homeLink = document.querySelector('[data-home-nav]');
        const homeLabel = document.querySelector('[data-home-nav-label]');
        if (!homeLink || !homeLabel) return;

        homeLink.setAttribute('href', currentSession ? '#/dashboard' : '#/landing');
        homeLabel.textContent = currentSession ? 'Account' : 'Home';
    }

    function interceptLinks() {
        const view = document.getElementById('injected-view');
        if (!view) return;

        document.querySelectorAll('a[href="#/logout"]').forEach(link => {
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                await signOut();
            });
        });

        view.querySelectorAll('a, button').forEach(el => {
            el.addEventListener('click', (event) => {
                if (el.tagName.toLowerCase() === 'button' && el.getAttribute('type') === 'submit') return;
                
                // Prevent intercepting "Copy" buttons
                if (el.id && el.id.includes('copy')) return;

                const text = el.innerText.toLowerCase().trim();
                const href = el.getAttribute('href');
                let targetRoute = null;

                if (href && href.startsWith('#/')) return;
                if (text.includes('home') || text.includes('quantumbridge') || text.includes('quantum ai')) targetRoute = 'landing';
                else if (text.includes('dashboard') || text.includes('account')) targetRoute = 'dashboard';
                else if (text.includes('terminal')) targetRoute = 'terminal';
                else if (text.includes('live projects') || text.includes('projects')) targetRoute = 'dashboard';
                else if (text.includes('portfolio') || text.includes('history') || text.includes('withdrawal')) targetRoute = 'history';
                else if (text.includes('strategy') || text.includes('explorer') || text.includes('investment plan') || text.includes('view plan')) targetRoute = 'explorer';
                else if (text.includes('insights') || text.includes('security')) targetRoute = 'insights';
                else if (text.includes('start investing') || text.includes('onboard') || text.includes('get started')) targetRoute = 'onboarding';
                else if (text.includes('open account') || text.includes('create account')) targetRoute = 'signup';
                else if (text.includes('upgrade') || text.includes('elite') || text.includes('referral') || text.includes('representative')) targetRoute = 'elite_tier';

                if (el.tagName.toLowerCase() === 'a' && href === '#') event.preventDefault();

                if (targetRoute) {
                    event.preventDefault();
                    window.location.hash = `/${targetRoute}`;
                }
            });
        });
    }

    function bindAuthForms() {
        bindLoginForm();
        bindSignupForm();
        bindResetPasswordForm();
    }

    function bindLogoutControls() {
        document.querySelectorAll('[data-logout]').forEach(control => {
            control.addEventListener('click', async (event) => {
                event.preventDefault();
                await signOut();
            });
        });
    }

    function bindLoginForm() {
        const form = document.getElementById('login-form');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = String(formData.get('email') || '').trim();
            const password = String(formData.get('password') || '');

            if (!requireSupabase(form)) return;
            setFormState(form, true, 'Signing in...');
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                setFormState(form, false, error.message, 'error');
                return;
            }

            currentSession = data.session;
            setFormState(form, false, 'Login successful. Redirecting...', 'success');
            redirectAfterAuth();
        });
    }

    function bindSignupForm() {
        const form = document.getElementById('signup-form');
        if (!form) return;
        showSignupReferralNote();

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = String(formData.get('email') || '').trim();
            const password = String(formData.get('password') || '');
            const confirmPassword = String(formData.get('confirmPassword') || '');

            if (password !== confirmPassword) {
                setFormState(form, false, 'Passwords do not match.', 'error');
                return;
            }

            if (!requireSupabase(form)) return;
            setFormState(form, true, 'Creating account...');
            const referralCode = getStoredReferralCode();
            const signUpOptions = referralCode
                ? { data: { referral_code: referralCode } }
                : undefined;
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: signUpOptions,
            });

            if (error) {
                setFormState(form, false, error.message, 'error');
                return;
            }

            currentSession = data.session;
            setFormState(form, false, data.session ? 'Account created. Redirecting...' : 'Check your email to confirm your account.', 'success');
            if (data.session) redirectAfterAuth();
        });
    }

    function bindResetPasswordForm() {
        const form = document.getElementById('reset-password-form');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = String(formData.get('email') || '').trim();

            if (!requireSupabase(form)) return;
            setFormState(form, true, 'Sending reset link...');
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname + '#/login'
            });

            if (error) {
                setFormState(form, false, error.message, 'error');
                return;
            }

            setFormState(form, false, 'Reset link sent. Check your email.', 'success');
        });
    }

    function requireSupabase(form) {
        if (supabaseClient) return true;
        setFormState(form, false, hasSupabaseConfig ? 'Investor access could not load. Refresh the page and try again.' : 'Investor access is being prepared. Please try again shortly.', 'error');
        return false;
    }

    function showAuthConfigWarnings() {
        document.querySelectorAll('[data-auth-config-warning]').forEach(el => {
            el.classList.toggle('hidden', Boolean(supabaseClient));
        });
    }

    function setFormState(form, loading, message, type = 'info') {
        const submit = form.querySelector('.auth-submit');
        const messageEl = form.querySelector('[data-auth-message]');

        if (submit) {
            submit.disabled = loading;
            submit.classList.toggle('opacity-60', loading);
            submit.classList.toggle('cursor-wait', loading);
        }

        if (messageEl) {
            messageEl.textContent = message || '';
            messageEl.className = 'min-h-5 text-sm font-semibold';
            if (type === 'error') messageEl.classList.add('text-red-700');
            else if (type === 'success') messageEl.classList.add('text-primary');
            else messageEl.classList.add('text-on-surface/55');
        }
    }

    async function signOut() {
        if (supabaseClient) await supabaseClient.auth.signOut();
        currentSession = null;
        pendingRoute = null;
        window.location.hash = '/landing';
    }

    function redirectAfterAuth() {
        const route = pendingRoute || 'dashboard';
        pendingRoute = null;
        setTimeout(() => {
            window.location.hash = `/${route}`;
        }, 500);
    }

    async function hydrateRoute(hash) {
        try {
            if (hash === 'payment') {
                await hydratePaymentAuthorization();
                return;
            }

            if (!supabaseClient) return;

            if (currentSession) {
                await supabaseClient.rpc('qt_bootstrap_current_user');
            }

            if (hash === 'dashboard') await hydrateDashboard();
            if (hash === 'explorer') await hydratePlans();
            if (hash === 'onboarding') await hydrateFundingForm();
            if (hash === 'live_projects') await hydrateStandaloneProjects();
            if (hash === 'history') await hydrateWithdrawalPage();
            if (hash === 'elite_tier') await hydrateReferralPage();
        } catch (error) {
            console.error('Hydration error:', error);
        }
    }

    async function refreshRouteData() {
        const hash = window.location.hash.replace('#/', '').split('?')[0] || '';
        if (['dashboard', 'explorer', 'history', 'elite_tier', 'onboarding'].includes(hash)) {
            await hydrateRoute(hash);
        }
    }

    async function hydratePlans() {
        const grid = document.getElementById('plans-grid');
        if (!grid) return;

        const [{ data, error }, investmentResult] = await Promise.all([
            supabaseClient
            .from('qt_plans')
            .select('id,slug,name,daily_return_percent,duration_days,min_deposit_usd,max_deposit_usd,description,featured,sort_order')
            .order('sort_order', { ascending: true }),
            currentSession
                ? supabaseClient
                    .from('qt_investments')
                    .select('id,principal_usd,status')
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null })
        ]);

        if (error) {
            grid.innerHTML = `<article class="bg-white rounded-[2rem] p-8 border border-outline-variant/30 text-red-700 font-semibold">${escapeHtml(error.message)}</article>`;
            return;
        }

        if (investmentResult?.error) console.error(investmentResult.error);
        const accountBalance = Number(investmentResult?.data?.principal_usd || 0);
        setText('plans-account-balance', formatCurrency(accountBalance));

        grid.innerHTML = (data || []).map(plan => {
            const minDeposit = Number(plan.min_deposit_usd || 0);
            const canSelect = currentSession && accountBalance >= minDeposit;
            const actionClass = plan.featured ? 'bg-white text-primary' : 'bg-primary text-white';
            const action = !currentSession
                ? `<a href="#/signup" class="block mt-7 px-5 py-3 rounded-xl font-bold text-center ${actionClass} shadow-lg hover:opacity-90 transition-opacity">Create Account</a>`
                : canSelect
                    ? `<button type="button" data-select-plan="${escapeHtml(plan.slug)}" class="w-full mt-7 px-5 py-3 rounded-xl font-bold text-center ${actionClass} shadow-lg hover:opacity-90 transition-opacity">Select Package</button>`
                    : `<a href="#/onboarding" class="block mt-7 px-5 py-3 rounded-xl font-bold text-center ${actionClass} shadow-lg hover:opacity-90 transition-opacity">Load Account</a>`;

            return `
            <article class="${plan.featured ? 'bg-primary/90 text-white shadow-xl shadow-primary/20 backdrop-blur-xl border border-white/20' : 'glass-panel'} rounded-[2rem] p-8 transition-transform hover:scale-[1.02] duration-300">
                <span class="text-[10px] font-bold uppercase tracking-widest ${plan.featured ? 'opacity-60' : 'text-on-surface/40'}">${plan.featured ? 'Featured Fund' : 'Investment Fund'}</span>
                <h2 class="font-display text-2xl font-bold mt-3">${escapeHtml(plan.name)}</h2>
                <p class="${plan.featured ? 'text-white/75' : 'text-on-surface/60'} text-sm mt-3 min-h-[60px]">${escapeHtml(plan.description || '')}</p>
                <div class="grid grid-cols-3 gap-3 mt-6">
                    <div><p class="text-[10px] font-bold uppercase ${plan.featured ? 'opacity-50' : 'text-on-surface/40'}">Daily</p><p class="font-display text-2xl font-bold">${formatPercent(plan.daily_return_percent)}</p></div>
                    <div><p class="text-[10px] font-bold uppercase ${plan.featured ? 'opacity-50' : 'text-on-surface/40'}">Term</p><p class="font-display text-2xl font-bold">${plan.duration_days}D</p></div>
                    <div><p class="text-[10px] font-bold uppercase ${plan.featured ? 'opacity-50' : 'text-on-surface/40'}">Min</p><p class="font-display text-2xl font-bold">${formatCurrency(plan.min_deposit_usd, 0)}</p></div>
                </div>
                ${action}
            </article>
        `;
        }).join('');

        grid.querySelectorAll('[data-select-plan]').forEach(button => {
            button.addEventListener('click', () => selectInvestmentPlan(button.dataset.selectPlan, data || [], investmentResult?.data));
        });

        // Bind Calculator Logic
        const calcAmount = document.getElementById('calc-amount');
        const calcPlan = document.getElementById('calc-plan');
        const calcCompound = document.getElementById('calc-compound');
        const calcDailyReturn = document.getElementById('calc-daily-return');
        const calcTotalReturn = document.getElementById('calc-total-return');
        const calcFinalBalance = document.getElementById('calc-final-balance');
        const calcReturnLabel = document.getElementById('calc-return-label');
        const calcLockNote = document.getElementById('calc-lock-note');

        if (calcAmount && calcPlan) {
            calcPlan.innerHTML = (data || []).map(plan => (
                `<option value="${Number(plan.daily_return_percent)},${Number(plan.duration_days)},${Number(plan.min_deposit_usd || 10)}">${escapeHtml(plan.name)} (${formatPercent(plan.daily_return_percent)} Daily / ${Number(plan.duration_days)} Days)</option>`
            )).join('');

            function updateCalculator() {
                let amount = parseFloat(calcAmount.value) || 0;
                const [dailyPercent, termDays, minDeposit] = calcPlan.value.split(',').map(Number);
                if (Number.isFinite(minDeposit)) {
                    calcAmount.min = String(minDeposit);
                    if (!amount || amount < minDeposit) {
                        amount = minDeposit;
                        calcAmount.value = String(minDeposit);
                    }
                }
                const dailyRate = dailyPercent / 100;
                const isCompounding = Boolean(calcCompound?.checked);
                
                const firstDayReturn = amount * dailyRate;
                const totalReturn = isCompounding
                    ? (amount * Math.pow(1 + dailyRate, termDays)) - amount
                    : firstDayReturn * termDays;

                if (calcReturnLabel) calcReturnLabel.innerText = isCompounding ? 'First Day Yield' : 'Estimated Daily Yield';
                calcDailyReturn.innerText = `+$${firstDayReturn.toFixed(2)}`;
                calcTotalReturn.innerText = `+$${totalReturn.toFixed(2)}`;
                if (calcFinalBalance) calcFinalBalance.innerText = `$${totalReturn.toFixed(2)}`;
                if (calcLockNote) {
                    calcLockNote.textContent = isCompounding
                        ? `Compounding locks yield until the ${termDays}-day plan period ends, because daily yield is reinvested. Principal remains committed and non-refundable.`
                        : 'Standard mode keeps yield flexible: collected daily yield can be withdrawn while principal remains committed.';
                    calcLockNote.className = isCompounding
                        ? 'rounded-xl bg-on-surface text-white border border-on-surface/10 px-4 py-3 text-sm leading-6'
                        : 'rounded-xl bg-primary/10 border border-primary/15 px-4 py-3 text-sm text-on-surface/70 leading-6';
                }
            }

            calcAmount.addEventListener('input', updateCalculator);
            calcPlan.addEventListener('change', updateCalculator);
            calcCompound?.addEventListener('change', updateCalculator);
            updateCalculator(); // Init
        }
    }

    async function hydrateFundingForm() {
        const form = document.getElementById('funding-form');
        const planSelect = document.getElementById('funding-plan');
        if (!form || !supabaseClient) return;
        if (!planSelect) {
            updateFundingPreview();
            return;
        }

        const { data, error } = await supabaseClient
            .from('qt_plans')
            .select('slug,name,daily_return_percent,duration_days,min_deposit_usd,description,sort_order')
            .order('sort_order', { ascending: true });

        if (error) {
            setFundingState(form, false, error.message, 'error');
            return;
        }

        planSelect.innerHTML = (data || []).map(plan => `
            <option value="${escapeHtml(plan.slug)}"
                data-daily="${Number(plan.daily_return_percent)}"
                data-days="${Number(plan.duration_days)}"
                data-min="${Number(plan.min_deposit_usd)}"
                data-description="${escapeHtml(plan.description || '')}">
                ${escapeHtml(plan.name)} - ${formatPercent(plan.daily_return_percent)} daily
            </option>
        `).join('');

        updateFundingPreview();
    }

    function bindFundingForm() {
        const form = document.getElementById('funding-form');
        if (!form) return;

        const currencySelect = document.getElementById('funding-currency');
        currencySelect?.addEventListener('change', () => {
            const amountEl = document.getElementById('funding-amount');
            const minimum = getFundingMinimumForCurrency(currencySelect.value);
            if (amountEl && (!Number(amountEl.value) || Number(amountEl.value) < minimum)) {
                amountEl.value = String(Math.ceil(minimum));
            }
        });

        form.querySelectorAll('#funding-plan, #funding-amount, #funding-currency').forEach(control => {
            control.addEventListener('input', updateFundingPreview);
            control.addEventListener('change', updateFundingPreview);
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!supabaseClient) {
                setFundingState(form, false, 'Investor access is being prepared. Please try again shortly.', 'error');
                return;
            }

            if (!currentSession) {
                pendingRoute = 'onboarding';
                window.location.hash = '/login';
                return;
            }

            const planSelect = document.getElementById('funding-plan');
            const selectedPlan = planSelect?.selectedOptions?.[0];
            const amount = Number(document.getElementById('funding-amount')?.value || 0);
            const currency = String(document.getElementById('funding-currency')?.value || 'KES');
            const email = String(currentSession.user?.email || '').trim();
            const minUsd = Number(selectedPlan?.dataset?.min || 10);
            const amountUsd = convertFundingAmountToUsd(amount, currency);
            const minLocalAmount = getFundingMinimumForCurrency(currency, minUsd);
            const planSlug = selectedPlan?.value || 'starter-fund';

            if (!Number.isFinite(amount) || amountUsd < minUsd) {
                setFundingState(form, false, `Minimum account load is ${formatCurrency(minUsd, 0)} or ${formatLocalFundingAmount(minLocalAmount, currency)}.`, 'error');
                return;
            }

            setFundingState(form, true, 'Preparing account load...');

            const { data, error } = await supabaseClient.functions.invoke('pesapal-create-order', {
                body: {
                    plan_slug: planSlug,
                    amount,
                    currency,
                    amount_usd: amountUsd,
                    billing_address: {
                        email_address: email,
                        first_name: 'QuantumTrade',
                        last_name: 'Investor',
                    },
                },
            });

            if (error || data?.error) {
                setFundingState(form, false, data?.error || error?.message || 'Could not create Pesapal checkout.', 'error');
                return;
            }

            if (!data?.redirect_url) {
                setFundingState(form, false, 'Pesapal did not return a checkout link.', 'error');
                return;
            }

            sessionStorage.setItem('quantumbridge_pending_payment', JSON.stringify({
                redirect_url: data.redirect_url,
                order_tracking_id: data.order_tracking_id,
                merchant_reference: data.merchant_reference,
                created_at: Date.now()
            }));
            setFundingState(form, true, 'Redirecting to Pesapal...');
            window.location.href = data.redirect_url;
        });
    }

    function updateFundingPreview() {
        const planSelect = document.getElementById('funding-plan');
        const selectedPlan = planSelect?.selectedOptions?.[0];
        const amount = Number(document.getElementById('funding-amount')?.value || 0);
        const currency = String(document.getElementById('funding-currency')?.value || 'KES');
        const amountEl = document.getElementById('funding-amount');
        const submit = document.querySelector('.funding-submit');
        const projectedEl = document.getElementById('funding-projected-return');
        const summaryEl = document.getElementById('funding-summary');
        const minimumEl = document.getElementById('funding-minimum');
        const equivalentEl = document.getElementById('funding-usd-equivalent');
        const noteEl = document.getElementById('funding-plan-note');
        const minUsd = Number(selectedPlan?.dataset?.min || 10);
        const amountUsd = convertFundingAmountToUsd(amount, currency);
        const minLocalAmount = getFundingMinimumForCurrency(currency, minUsd);
        const isBelowMinimum = amountUsd < minUsd;

        if (amountEl) amountEl.min = String(Math.ceil(minLocalAmount));
        if (submit) submit.disabled = isBelowMinimum;

        if (!selectedPlan) {
            if (summaryEl) summaryEl.textContent = `Load ${formatLocalFundingAmount(amount, currency)} as committed, non-refundable principal, then choose a package from Plans.`;
            if (minimumEl) minimumEl.textContent = `Minimum account load: ${formatLocalFundingAmount(minLocalAmount, currency)}, about ${formatCurrency(minUsd)}.`;
            if (equivalentEl) {
                equivalentEl.textContent = `USD equivalent: ${formatCurrency(amountUsd)}${isBelowMinimum ? ' - below minimum' : ''}`;
                equivalentEl.className = `text-sm mt-1 ${isBelowMinimum ? 'text-red-700 font-semibold' : 'text-on-surface/55'}`;
            }
            return;
        }

        const dailyPercent = Number(selectedPlan.dataset.daily || 0);
        const days = Number(selectedPlan.dataset.days || 0);
        const projected = amount * (dailyPercent / 100) * days;

        if (projectedEl) projectedEl.textContent = `${currency} ${projected.toFixed(2)}`;
        if (summaryEl) summaryEl.textContent = `${formatPercent(dailyPercent)} daily yield over ${days} days. Pesapal checkout will process ${currency} ${amount.toFixed(2)} as committed, non-refundable principal.`;
        if (minimumEl) minimumEl.textContent = `Minimum account load: ${formatLocalFundingAmount(minLocalAmount, currency)}, about ${formatCurrency(minUsd)}.`;
        if (equivalentEl) {
            equivalentEl.textContent = `USD equivalent: ${formatCurrency(amountUsd)}${isBelowMinimum ? ' - below minimum' : ''}`;
            equivalentEl.className = `text-sm mt-1 ${isBelowMinimum ? 'text-red-700 font-semibold' : 'text-on-surface/55'}`;
        }
        if (noteEl) noteEl.textContent = selectedPlan.dataset.description || 'Choose a QuantumTrade fund to continue.';

        const emailEl = document.getElementById('funding-email');
        if (emailEl && !emailEl.value && currentSession?.user?.email) {
            emailEl.value = currentSession.user.email;
        }
    }

    async function selectInvestmentPlan(slug, plans, investment) {
        const plan = plans.find(item => item.slug === slug);
        if (!plan || !investment?.id) return;

        const principal = Number(investment.principal_usd || 0);
        const dailyCredit = principal * (Number(plan.daily_return_percent || 0) / 100);
        const projectedReturn = dailyCredit * Number(plan.duration_days || 0);

        const { error } = await supabaseClient
            .from('qt_investments')
            .update({
                plan_id: plan.id,
                duration_days: Number(plan.duration_days || 0),
                daily_credit_usd: dailyCredit,
                projected_return_usd: projectedReturn,
                updated_at: new Date().toISOString()
            })
            .eq('id', investment.id);

        if (error) {
            alert(`Could not select package: ${error.message}`);
            return;
        }

        window.location.hash = '/dashboard';
    }

    function setFundingState(form, loading, message, type = 'info') {
        const submit = form.querySelector('.funding-submit');
        const messageEl = form.querySelector('[data-funding-message]');

        if (submit) {
            submit.disabled = loading;
            submit.classList.toggle('opacity-60', loading);
            submit.classList.toggle('cursor-wait', loading);
        }

        if (messageEl) {
            messageEl.textContent = message || '';
            messageEl.className = 'min-h-5 text-sm font-semibold';
            if (type === 'error') messageEl.classList.add('text-red-700');
            else if (type === 'success') messageEl.classList.add('text-primary');
            else messageEl.classList.add('text-on-surface/55');
        }
    }

    async function hydratePaymentAuthorization() {
        const frame = document.getElementById('payment-frame');
        const missing = document.getElementById('payment-missing');
        const openLink = document.getElementById('payment-open-new');
        const orderEl = document.getElementById('payment-order-id');
        const refresh = document.getElementById('payment-status-refresh');

        let payment = null;
        try {
            payment = JSON.parse(sessionStorage.getItem('quantumbridge_pending_payment') || 'null');
        } catch (_error) {
            payment = null;
        }

        if (!payment?.redirect_url || !payment?.order_tracking_id) {
            if (missing) missing.classList.remove('hidden');
            if (frame) frame.classList.add('hidden');
            if (openLink) openLink.classList.add('hidden');
            return;
        }

        if (frame) {
            frame.src = payment.redirect_url;
            frame.classList.remove('hidden');
        }
        if (openLink) openLink.href = payment.redirect_url;
        if (orderEl) orderEl.textContent = `Order ${payment.order_tracking_id}`;

        if (refresh) {
            refresh.addEventListener('click', () => checkPaymentStatus(payment.order_tracking_id));
        }

        setTimeout(() => checkPaymentStatus(payment.order_tracking_id), 2000);
        window.clearInterval(window.quantumbridgePaymentPoll);
        window.quantumbridgePaymentPoll = window.setInterval(() => checkPaymentStatus(payment.order_tracking_id, true), 8000);
    }

    async function checkPaymentStatus(orderTrackingId, quiet = false) {
        const messageEl = document.getElementById('payment-auth-message');
        const titleEl = document.getElementById('payment-status-title');
        const copyEl = document.getElementById('payment-status-copy');

        if (!supabaseClient || !currentSession || !orderTrackingId) return;

        if (messageEl && !quiet) messageEl.textContent = 'Checking Pesapal status...';

        let status = null;
        try {
            status = await fetchPaymentStatus(orderTrackingId);
        } catch (error) {
            if (messageEl && !quiet) messageEl.textContent = error.message || 'Status check failed.';
            return;
        }

        const description = String(status.payment_status_description || '').toUpperCase();
        const statusCode = Number(status.status_code ?? -1);

        if (messageEl) messageEl.textContent = description ? `Pesapal status: ${description}` : 'Waiting for Pesapal confirmation.';

        if (statusCode === 1 || description === 'COMPLETED') {
            window.clearInterval(window.quantumbridgePaymentPoll);
            sessionStorage.removeItem('quantumbridge_pending_payment');
            if (titleEl) titleEl.textContent = 'Payment confirmed';
            if (copyEl) copyEl.textContent = 'Your investment payment has been confirmed. Redirecting you to your dashboard.';
            setTimeout(() => {
                window.location.hash = '/dashboard';
            }, 1200);
        }
    }

    async function hydrateDashboard() {
        await syncPendingPaymentBeforeDashboard();

        const [profileResult, investmentResult, projectsResult, commissionResult, directResult] = await Promise.all([
            supabaseClient.from('qt_profiles').select('email,display_name,investor_code').maybeSingle(),
            supabaseClient
                .from('qt_investments')
                .select('principal_usd,daily_credit_usd,projected_return_usd,day_number,duration_days,status,created_at,qt_plans(name,daily_return_percent)')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabaseClient
                .from('qt_projects')
                .select('symbol,side,risk,result_percent,status,placed_at')
                .order('placed_at', { ascending: false })
                .limit(4),
            supabaseClient
                .from('qt_referral_commissions')
                .select('amount_usd')
                .order('created_at', { ascending: false }),
            supabaseClient
                .from('qt_profiles')
                .select('user_id')
                .eq('referrer_user_id', currentSession.user.id)
        ]);

        if (profileResult.error) console.error(profileResult.error);
        if (investmentResult.error) console.error(investmentResult.error);
        if (projectsResult.error) console.error(projectsResult.error);
        if (commissionResult.error) console.error(commissionResult.error);
        if (directResult.error) console.error(directResult.error);

        const profile = profileResult.data;
        const investment = investmentResult.data;
        let dbProjects = projectsResult.data || [];
        const plan = investment?.qt_plans;

        setText('dashboard-investor-code', profile?.investor_code ? `QuantumTrade Investor: ${profile.investor_code}` : 'QuantumTrade Investor');
        setText('dashboard-display-name', profile?.display_name || profile?.email || 'QuantumTrade Client');
        setText('dashboard-plan-name', plan?.name || 'No active plan');

        if (investment) {
            const principal = Number(investment.principal_usd || 0);
            const dailyCredit = getInvestmentDailyCredit(investment, plan);
            const timing = getInvestmentTiming(investment);
            const currentDay = timing.currentDay;
            const durationDays = timing.durationDays;
            const projectedYield = Number(investment.projected_return_usd || 0) || (dailyCredit * durationDays);
            const collectedYield = dailyCredit * timing.completedDays;
            const todaysCredit = timing.completedDays > 0 ? dailyCredit : 0;

            setText('dashboard-collected-yield', formatCurrency(collectedYield));
            setText('dashboard-funded-balance', `Committed ${formatCurrency(principal)}`);
            setText('dashboard-daily-percent', `${formatPercent(plan?.daily_return_percent || 0)} Daily Yield`);
            setText('dashboard-day', timing.completedDays === 0 ? `First credit in ${timing.hoursUntilNextCredit}h` : `Day ${currentDay} of ${durationDays}`);
            setText('dashboard-daily-credit', `+${formatCurrency(todaysCredit)}`);
            setText('dashboard-projected-return', formatCurrency(projectedYield, 0));
            setText('dashboard-maturity-value', formatCurrency(projectedYield, 0));
            setText('dashboard-schedule-title', `${durationDays || ''}${durationDays ? '-Day ' : ''}Yield Schedule`);
        }

        hydrateDashboardReferralSummary(profile, commissionResult.data || [], directResult.data || []);
        renderDashboardProjects(dbProjects, !!investment);
    }

    function hydrateDashboardReferralSummary(profile, commissions, directReferrals) {
        let code = profile?.investor_code || '';
        
        // Auto-generate code if missing
        if (!code && currentSession?.user?.id) {
            code = 'QT' + currentSession.user.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
            supabaseClient.from('qt_profiles').update({ investor_code: code }).eq('user_id', currentSession.user.id).then();
        }

        const link = code ? buildReferralLink(code) : '';
        const totalEarned = (commissions || []).reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);

        setText('dashboard-referral-link', link || 'Your referral link will appear after your profile is ready.');
        setText('dashboard-referral-total', formatCurrency(totalEarned));
        setText('dashboard-referral-direct-count', `${(directReferrals || []).length} direct investor${(directReferrals || []).length === 1 ? '' : 's'} invited.`);

        const copyButton = document.getElementById('dashboard-copy-referral-link');
        const copyMessage = document.getElementById('dashboard-referral-copy-message');
        if (!copyButton) return;

        copyButton.disabled = !link;
        copyButton.addEventListener('click', async () => {
            if (!link) return;
            await navigator.clipboard?.writeText(link);
            if (copyMessage) copyMessage.textContent = 'Referral link copied.';
        });
    }

    async function hydrateReferralPage() {
        if (!currentSession) return;

        const [profileResult, commissionResult, directResult] = await Promise.all([
            supabaseClient
                .from('qt_profiles')
                .select('investor_code')
                .eq('user_id', currentSession.user.id)
                .maybeSingle(),
            supabaseClient
                .from('qt_referral_commissions')
                .select('amount_usd,level,rate_percent,status,created_at')
                .order('created_at', { ascending: false }),
            supabaseClient
                .from('qt_profiles')
                .select('user_id,display_name,email,created_at')
                .eq('referrer_user_id', currentSession.user.id)
                .order('created_at', { ascending: false }),
        ]);

        if (profileResult.error) console.error(profileResult.error);
        if (commissionResult.error) console.error(commissionResult.error);
        if (directResult.error) console.error(directResult.error);
        const commissions = commissionResult.data || [];
        const directReferrals = directResult.data || [];
        
        let code = profileResult.data?.investor_code || '';
        if (!code && currentSession?.user?.id) {
            code = 'QT' + currentSession.user.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
            supabaseClient.from('qt_profiles').update({ investor_code: code }).eq('user_id', currentSession.user.id).then();
        }

        const link = code ? buildReferralLink(code) : '';
        const totalEarned = commissions.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);

        setText('referral-link', link || 'Your referral link will appear after your profile is ready.');
        setText('referral-total-earned', formatCurrency(totalEarned));
        setText('referral-direct-count', `${directReferrals.length} direct investor${directReferrals.length === 1 ? '' : 's'} invited.`);

        const copyButton = document.getElementById('copy-referral-link');
        const copyMessage = document.getElementById('referral-copy-message');
        if (copyButton) {
            copyButton.disabled = !link;
            copyButton.addEventListener('click', async () => {
                if (!link) return;
                await navigator.clipboard?.writeText(link);
                if (copyMessage) copyMessage.textContent = 'Referral link copied.';
            });
        }

        const list = document.getElementById('referral-commission-list');
        if (!list) return;
        if (!commissions.length) {
            list.innerHTML = '<p class="text-sm text-on-surface/50 py-6">No commission activity yet. Share your link to invite investors.</p>';
            return;
        }

        list.innerHTML = commissions.slice(0, 12).map(row => `
            <div class="py-5 flex items-center justify-between gap-4">
                <div>
                    <p class="font-bold">Level ${Number(row.level || 1)} commission</p>
                    <p class="text-xs text-on-surface/45 uppercase tracking-widest mt-1">${formatPercent(row.rate_percent)} earned - ${timeAgo(row.created_at)}</p>
                </div>
                <div class="text-right">
                    <p class="font-display text-xl font-bold text-primary">+${formatCurrency(row.amount_usd)}</p>
                    <p class="text-xs text-on-surface/45 uppercase tracking-widest">${escapeHtml(row.status || 'earned')}</p>
                </div>
            </div>
        `).join('');
    }

    async function hydrateWithdrawalPage() {
        const principalEl = document.getElementById('withdraw-active-principal');
        const balanceEl = document.getElementById('withdraw-available-balance');
        const todaysCreditEl = document.getElementById('withdraw-todays-credit');
        const listContainer = document.getElementById('personal-withdrawals-list');
        const form = document.getElementById('withdraw-form');
        const methodSelect = document.getElementById('withdraw-method');

        if (!supabaseClient) return;

        hydrateGlobalPayouts();
        hydrateWithdrawalAdminPanel();

        if (!currentSession) return;

        // 1. Fetch user profile/investment to show balances
        const [investmentResult, withdrawalsResult] = await Promise.all([
            supabaseClient
                .from('qt_investments')
                .select('principal_usd,daily_credit_usd,day_number,duration_days,status,created_at,qt_plans(daily_return_percent)')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabaseClient
                .from('qt_withdrawals')
                .select('amount_usd,method,status,created_at')
                .order('created_at', { ascending: false })
        ]);

        const investment = investmentResult?.data;
        const withdrawals = withdrawalsResult?.data || [];

        const plan = investment?.qt_plans;
        const dailyCredit = getInvestmentDailyCredit(investment, plan);
        const timing = getInvestmentTiming(investment);
        const totalYield = dailyCredit * timing.completedDays;
        const todaysCredit = timing.completedDays > 0 ? dailyCredit : 0;
        const totalWithdrawn = withdrawals
            .filter(w => w.status === 'completed' || w.status === 'pending')
            .reduce((acc, curr) => acc + Number(curr.amount_usd || 0), 0);

        const withdrawableBalance = Math.max(0, totalYield - totalWithdrawn);

        if (principalEl) principalEl.textContent = formatCurrency(withdrawableBalance);
        if (balanceEl) balanceEl.textContent = formatCurrency(withdrawableBalance);
        if (todaysCreditEl) todaysCreditEl.textContent = `+${formatCurrency(todaysCredit)}`;

        // 2. Render user requests list
        if (listContainer) {
            if (withdrawalsResult.error) {
                listContainer.innerHTML = `<p class="text-sm text-red-700 text-center py-8">Failed to load withdrawals: ${escapeHtml(withdrawalsResult.error.message)}</p>`;
            } else if (withdrawals.length === 0) {
                listContainer.innerHTML = `<p class="text-sm text-on-surface/40 text-center py-8">No pending or past withdrawal requests found.</p>`;
            } else {
                listContainer.innerHTML = withdrawals.map(w => {
                    const statusClass = w.status === 'completed'
                        ? 'text-primary bg-primary/10'
                        : w.status === 'rejected'
                            ? 'text-red-700 bg-red-50'
                            : 'text-on-surface/50 bg-surface-container';
                    const icon = w.method === 'bitcoin'
                        ? 'currency_bitcoin'
                        : w.method === 'bank_transfer'
                            ? 'account_balance'
                            : 'phone_android';
                    const methodName = w.method === 'bitcoin'
                        ? 'Bitcoin'
                        : w.method === 'bank_transfer'
                            ? 'Bank Transfer'
                            : 'Mobile Money';

                    return `
                        <div class="py-5 flex items-center gap-4">
                            <div class="w-11 h-11 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface/65">
                                <span class="material-symbols-outlined">${icon}</span>
                            </div>
                            <div class="flex-1">
                                <p class="font-body font-bold text-on-surface/85">${escapeHtml(methodName)}</p>
                                <p class="text-xs text-on-surface/40 font-semibold uppercase tracking-widest">${timeAgo(w.created_at)}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-display font-bold text-on-surface">${formatCurrency(w.amount_usd)}</p>
                                <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClass} mt-1">${w.status}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 3. Set up dropdown toggle
        if (methodSelect && !methodSelect.dataset.listenerBound) {
            methodSelect.dataset.listenerBound = 'true';
            methodSelect.addEventListener('change', () => {
                const selectedMethod = methodSelect.value;
                ['mobile_money', 'bank_transfer', 'bitcoin'].forEach(m => {
                    const el = document.getElementById(`details-${m}`);
                    if (el) {
                        el.classList.toggle('hidden', m !== selectedMethod);
                        el.querySelectorAll('input, select').forEach(input => {
                            if (m === selectedMethod) {
                                input.setAttribute('required', 'true');
                            } else {
                                input.removeAttribute('required');
                            }
                        });
                    }
                });
            });
        }

        // 4. Set up form submission handler
        if (form && !form.dataset.listenerBound) {
            form.dataset.listenerBound = 'true';
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const amountInput = document.getElementById('withdraw-amount');
                const amount = Number(amountInput?.value || 0);

                if (!Number.isFinite(amount) || amount <= 0) {
                    setWithdrawMessage('Please enter a valid amount.', 'error');
                    return;
                }

                if (amount > withdrawableBalance) {
                    setWithdrawMessage(`Withdrawal request exceeds your withdrawable yield balance of ${formatCurrency(withdrawableBalance)}.`, 'error');
                    return;
                }

                if (amount < 5) {
                    setWithdrawMessage('Minimum withdrawal amount is $5.00 USD.', 'error');
                    return;
                }

                const method = methodSelect.value;
                let details = {};

                if (method === 'mobile_money') {
                    const rawPhone = document.getElementById('withdraw-phone')?.value || '';
                    if (!rawPhone || rawPhone.length < 9 || rawPhone.length > 10 || !/^\d+$/.test(rawPhone)) {
                        alert("Please enter a valid phone number (9-10 digits).");
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Request Payout';
                        return;
                    }
                    details = {
                        phone: (document.getElementById('withdraw-country-code')?.value || '') + rawPhone,
                        provider: document.getElementById('withdraw-provider')?.value || ''
                    };
                } else if (method === 'bank_transfer') {
                    details = {
                        bank_name: document.getElementById('withdraw-bank-name')?.value || '',
                        account_number: document.getElementById('withdraw-bank-acc')?.value || '',
                        account_name: document.getElementById('withdraw-bank-holder')?.value || ''
                    };
                } else if (method === 'bitcoin') {
                    details = {
                        btc_address: document.getElementById('withdraw-btc-address')?.value || ''
                    };
                }

                setWithdrawState(true, 'Submitting payout request...');

                const { data, error } = await supabaseClient.functions.invoke('withdrawal-request', {
                    body: {
                        amount_usd: amount,
                        method,
                        details,
                    },
                });

                if (error) {
                    setWithdrawState(false);
                    setWithdrawMessage(data?.error || error.message, 'error');
                    return;
                }

                setWithdrawState(false);
                const emailNote = data?.email?.sent
                    ? ' We have notified the payout desk.'
                    : ' The payout desk will see it in the admin queue.';
                setWithdrawMessage(`Your withdrawal request has been submitted and is processing.${emailNote}`, 'success');
                form.reset();
                // Refresh data
                await hydrateWithdrawalPage();
            });
        }
    }

    async function hydrateWithdrawalAdminPanel() {
        const section = document.getElementById('withdraw-admin-section');
        const list = document.getElementById('admin-withdrawals-list');
        const refreshButton = document.getElementById('refresh-admin-withdrawals');
        if (!section || !list || !currentSession) return;

        const adminEmail = 'michealuzer@gmail.com';
        if (String(currentSession.user?.email || '').toLowerCase() !== adminEmail) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        refreshButton?.addEventListener('click', hydrateWithdrawalAdminPanel, { once: true });
        list.innerHTML = '<p class="text-sm text-on-surface/50 py-8 text-center">Loading payout requests...</p>';

        const { data, error } = await supabaseClient.functions.invoke('withdrawal-admin', {
            body: { action: 'list' },
        });

        if (error || data?.error) {
            list.innerHTML = `<p class="text-sm text-red-700 py-8 text-center">${escapeHtml(data?.error || error.message)}</p>`;
            return;
        }

        const withdrawals = data?.withdrawals || [];
        if (!withdrawals.length) {
            list.innerHTML = '<p class="text-sm text-on-surface/50 py-8 text-center">No withdrawal requests yet.</p>';
            return;
        }

        list.innerHTML = withdrawals.map(withdrawal => renderAdminWithdrawal(withdrawal)).join('');
        list.querySelectorAll('[data-mark-paid]').forEach(button => {
            button.addEventListener('click', async () => {
                const withdrawalId = button.getAttribute('data-mark-paid');
                button.disabled = true;
                button.textContent = 'Updating...';
                const { data: updateData, error: updateError } = await supabaseClient.functions.invoke('withdrawal-admin', {
                    body: {
                        action: 'mark_paid',
                        withdrawal_id: withdrawalId,
                    },
                });
                if (updateError || updateData?.error) {
                    button.disabled = false;
                    button.textContent = 'Mark Paid';
                    alert(updateData?.error || updateError.message);
                    return;
                }
                await hydrateWithdrawalAdminPanel();
            });
        });
    }

    function setWithdrawMessage(message, type = 'info') {
        const messageEl = document.getElementById('withdraw-message');
        if (messageEl) {
            messageEl.textContent = message || '';
            messageEl.className = 'min-h-5 text-sm font-semibold mt-2';
            if (type === 'error') messageEl.classList.add('text-red-700');
            else if (type === 'success') messageEl.classList.add('text-primary');
            else messageEl.classList.add('text-on-surface/55');
        }
    }

    function setWithdrawState(loading, message = '') {
        const submit = document.querySelector('.withdraw-submit');
        if (submit) {
            submit.disabled = loading;
            submit.classList.toggle('opacity-60', loading);
            submit.classList.toggle('cursor-wait', loading);
        }
        if (loading) {
            setWithdrawMessage(message, 'info');
        }
    }

    function renderAdminWithdrawal(withdrawal) {
        const profile = withdrawal.profile || (Array.isArray(withdrawal.qt_profiles)
            ? withdrawal.qt_profiles[0]
            : withdrawal.qt_profiles);
        const status = String(withdrawal.status || 'pending');
        const details = withdrawal.details || {};
        const detailsText = Object.entries(details)
            .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value || '-'}`)
            .join(' | ');
        const canMarkPaid = status !== 'completed';
        const statusClass = status === 'completed'
            ? 'text-primary bg-primary/10'
            : status === 'rejected'
                ? 'text-red-700 bg-red-50'
                : 'text-on-surface/70 bg-white/10';

        return `
            <article class="py-5 flex flex-col lg:flex-row lg:items-center gap-4">
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <p class="font-display text-2xl font-bold">${formatCurrency(withdrawal.amount_usd)}</p>
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClass}">${escapeHtml(status)}</span>
                    </div>
                    <p class="text-sm text-on-surface/70 mt-2">${escapeHtml(profile?.display_name || profile?.email || 'Investor')} - ${escapeHtml(profile?.investor_code || 'No code')}</p>
                    <p class="text-xs text-on-surface/45 uppercase tracking-widest mt-1">${escapeHtml(formatWithdrawMethod(withdrawal.method))} - ${timeAgo(withdrawal.created_at)}</p>
                    <p class="text-xs text-on-surface/55 mt-2 break-words">${escapeHtml(detailsText || 'No payout details supplied')}</p>
                    ${withdrawal.investor_notified_at ? '<p class="text-xs text-primary mt-2">Investor notified.</p>' : ''}
                </div>
                ${canMarkPaid
                    ? `<button data-mark-paid="${escapeHtml(withdrawal.id)}" class="px-5 py-3 rounded-xl bg-primary text-white font-bold">Mark Paid</button>`
                    : '<span class="px-5 py-3 rounded-xl bg-white/10 text-sm font-bold text-on-surface/60">Paid</span>'}
            </article>
        `;
    }

    function formatWithdrawMethod(method) {
        if (method === 'bank_transfer') return 'Bank Transfer';
        if (method === 'bitcoin') return 'Bitcoin Wallet';
        return 'Mobile Money';
    }


    async function syncPendingPaymentBeforeDashboard() {
        const pendingPayment = getPendingPaymentFromStorage();
        const callbackPayment = getRoutePaymentReference();
        const orderTrackingId = pendingPayment?.order_tracking_id || callbackPayment;
        if (!orderTrackingId || !currentSession) return;

        showDashboardPaymentBanner('Checking your payment and refreshing your account balance...', 'loading');

        for (let attempt = 0; attempt < 8; attempt += 1) {
            let status = null;
            try {
                status = await fetchPaymentStatus(orderTrackingId);
            } catch (error) {
                showDashboardPaymentBanner(error.message || 'Could not check payment status yet.', 'error');
                return;
            }

            const description = String(status?.payment_status_description || '').toUpperCase();
            const statusCode = Number(status?.status_code || 0);

            if (statusCode === 1 || description === 'COMPLETED') {
                sessionStorage.removeItem('quantumbridge_pending_payment');
                showDashboardPaymentBanner('Payment confirmed. Your account balance has been refreshed.', 'success');
                setTimeout(() => showDashboardPaymentBanner('', 'hidden'), 4500);
                return;
            }

            if (statusCode === 2 || description === 'FAILED' || description === 'INVALID') {
                sessionStorage.removeItem('quantumbridge_pending_payment');
                showDashboardPaymentBanner(`Payment ${description.toLowerCase() || 'failed'}. Your balance was not changed.`, 'error');
                setTimeout(() => showDashboardPaymentBanner('', 'hidden'), 6000);
                return;
            }

            showDashboardPaymentBanner('Payment is still processing. We will keep checking for confirmation...', 'loading');
            await wait(3500);
        }

        showDashboardPaymentBanner('Payment is still pending. Use the dashboard refresh after Pesapal confirms it.', 'info');
    }

    async function fetchPaymentStatus(orderTrackingId) {
        const url = `${supabaseConfig.SUPABASE_URL}/functions/v1/pesapal-status?orderTrackingId=${encodeURIComponent(orderTrackingId)}`;
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                apikey: supabaseConfig.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${currentSession.access_token}`,
            },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Could not check payment status.');
        return data.status;
    }

    function getPendingPaymentFromStorage() {
        try {
            return JSON.parse(sessionStorage.getItem('quantumbridge_pending_payment') || 'null');
        } catch (_error) {
            return null;
        }
    }

    function getRoutePaymentReference() {
        const route = window.location.hash.replace('#/', '');
        const query = route.includes('?') ? route.slice(route.indexOf('?') + 1) : '';
        return new URLSearchParams(query).get('payment');
    }

    function showDashboardPaymentBanner(message, type = 'info') {
        const view = document.getElementById('injected-view');
        const header = view?.querySelector('header');
        if (!view || !header) return;

        let banner = document.getElementById('dashboard-payment-banner');
        if (!message || type === 'hidden') {
            banner?.remove();
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'dashboard-payment-banner';
            header.insertAdjacentElement('afterend', banner);
        }

        const tone = type === 'error'
            ? 'bg-red-50 text-red-800 border-red-200'
            : type === 'success'
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-white/80 text-on-surface border-outline-variant/30';
        const spinner = type === 'loading'
            ? '<span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>'
            : '<span class="material-symbols-outlined text-[20px]">info</span>';

        banner.className = `mb-8 rounded-2xl border px-5 py-4 flex items-center gap-3 text-sm font-semibold ${tone}`;
        banner.innerHTML = `${spinner}<span>${escapeHtml(message)}</span>`;
    }

    async function hydrateStandaloneProjects() {
        const container = document.querySelector('#injected-view section.grid');
        if (!container || !currentSession) return;

        const { data, error } = await supabaseClient
            .from('qt_projects')
            .select('symbol,side,risk,result_percent,status,placed_at')
            .order('placed_at', { ascending: false })
            .limit(8);

        if (error) {
            container.innerHTML = `<article class="bg-white rounded-[2rem] p-6 border border-outline-variant/30 text-red-700 font-semibold">${escapeHtml(error.message)}</article>`;
            return;
        }

        container.innerHTML = (data || []).map(renderProjectCard).join('');
    }

    function renderDashboardProjects(projects, hasActivePlan) {
        const container = document.getElementById('dashboard-projects');
        if (!container) return;

        const titleHeader = container.parentElement.querySelector('h3');

        if (!projects.length) {
            // Simulated authentic projects
            projects = [
                {
                    symbol: 'Commercial Bridge Loan - TX',
                    side: 'Senior Debt',
                    placed_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
                    status: 'active'
                },
                {
                    symbol: 'Multi-Family Refinance - FL',
                    side: 'Mezzanine Debt',
                    placed_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
                    status: 'active'
                },
                {
                    symbol: 'Industrial Acquisition - OH',
                    side: 'Senior Debt',
                    placed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
                    status: 'active'
                }
            ];
        }

        if (titleHeader) {
            titleHeader.textContent = hasActivePlan ? "Active Portfolio Allocation" : "Recent Platform Projects";
        }

        container.innerHTML = projects.map(project => `
            <div class="bg-surface-container p-4 rounded-2xl flex items-center gap-4 group">
                <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined text-xl">real_estate_agent</span>
                </div>
                <div class="flex-1">
                    <p class="font-body font-bold text-sm">${escapeHtml(project.symbol)}</p>
                    <p class="text-[10px] text-on-surface/40 font-bold uppercase">${escapeHtml(project.side)} ${timeAgo(project.placed_at)}</p>
                </div>
                <span class="font-display font-bold text-primary">Active</span>
            </div>
        `).join('');
    }

    function renderProjectCard(project) {
        return `
            <article class="bg-white rounded-[2rem] p-6 border border-outline-variant/30 shadow-sm">
                <div class="flex justify-between items-start mb-8 gap-4">
                    <div>
                        <h2 class="font-display text-3xl font-bold">${escapeHtml(project.symbol)}</h2>
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mt-1">${escapeHtml(project.side)}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">${escapeHtml(project.status)}</span>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div><p class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Risk</p><p class="font-bold">${escapeHtml(project.risk)}</p></div>
                    <div><p class="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Placed</p><p class="font-bold">${timeAgo(project.placed_at)}</p></div>
                </div>
                <div class="flex justify-between items-end border-t border-outline-variant/30 pt-5">
                    <span class="text-sm text-on-surface/50">Profit gained</span>
                    <strong class="font-display text-primary text-2xl">+${formatPercent(project.result_percent)}</strong>
                </div>
            </article>
        `;
    }

    async function hydrateGlobalPayouts() {
        const container = document.getElementById('global-withdrawals-list');
        if (!container) return;

        container.innerHTML = '';

        // Attempt to fetch REAL data first
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient.rpc('qt_get_recent_payouts');
                if (!error && data && data.length > 0) {
                    const realHtml = data.map(w => {
                        const icon = w.method === 'bitcoin'
                            ? 'currency_bitcoin'
                            : w.method === 'bank_transfer'
                                ? 'account_balance'
                                : 'phone_android';

                        return `
                            <div class="py-5 flex items-center gap-4">
                                <div class="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                    <span class="material-symbols-outlined">${icon}</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-body font-bold text-on-surface/85">${escapeHtml(w.masked_email || 'u***@user.com')}</p>
                                    <p class="text-xs text-on-surface/40 font-semibold uppercase tracking-widest payout-time" data-time="${new Date(w.created_at).getTime()}">Payout - ${timeAgo(w.created_at)}</p>
                                </div>
                                <div class="text-right">
                                    <p class="font-display font-bold text-primary">${formatCurrency(w.amount_usd)}</p>
                                    <p class="text-xs text-on-surface/40">Real payout</p>
                                </div>
                            </div>
                        `;
                    }).join('');
                    container.innerHTML = realHtml;
                }
            } catch (err) {
                // Silently ignore if the user hasn't run the SQL script yet
            }
        }

        // Start the live simulation to supplement real data
        if (!window.quantumbridgeLiveSimulator) {
            window.quantumbridgeLiveSimulator = true;
            simulateLivePayouts();
        }
    }

    function simulateLivePayouts() {
        const container = document.getElementById('global-withdrawals-list');
        if (!container) return;

        const methods = ['bitcoin', 'bank_transfer', 'mobile_money'];
        const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
        const letters = 'abcdefghijklmnopqrstuvwxyz';

        function addFakePayout() {
            // Generate random data
            const letter = letters[Math.floor(Math.random() * letters.length)];
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const email = `${letter}***@${domain}`;
            const amount = (Math.random() * (2500 - 50) + 50).toFixed(2);
            const method = methods[Math.floor(Math.random() * methods.length)];
            
            const icon = method === 'bitcoin'
                ? 'currency_bitcoin'
                : method === 'bank_transfer'
                    ? 'account_balance'
                    : 'phone_android';

            // Create new DOM element
            const el = document.createElement('div');
            el.className = 'py-5 flex items-center gap-4 animate-pulse duration-1000'; // Add a little pulse when it appears
            el.innerHTML = `
                <div class="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <span class="material-symbols-outlined">${icon}</span>
                </div>
                <div class="flex-1">
                    <p class="font-body font-bold text-on-surface/85">${email}</p>
                    <p class="text-xs text-on-surface/40 font-semibold uppercase tracking-widest payout-time" data-time="${Date.now()}">Payout - Just now</p>
                </div>
                <div class="text-right">
                    <p class="font-display font-bold text-primary">$${amount}</p>
                    <p class="text-xs text-on-surface/40">Paid to investor</p>
                </div>
            `;

            // Insert at the top
            if (container.children.length > 0) {
                container.insertBefore(el, container.firstChild);
            } else {
                container.appendChild(el);
            }

            // Remove pulse after 1s to settle
            setTimeout(() => {
                el.classList.remove('animate-pulse', 'duration-1000');
            }, 1000);

            // Keep list max size to 10 to avoid DOM bloat
            if (container.children.length > 10) {
                container.removeChild(container.lastChild);
            }

            // Schedule next fake payout (between 8 and 35 seconds)
            setTimeout(addFakePayout, Math.random() * (35000 - 8000) + 8000);
        }

        // Setup dynamic aging for the timestamps
        if (!window.quantumbridgeLiveSimulatorTimer) {
            window.quantumbridgeLiveSimulatorTimer = setInterval(() => {
                const timeElements = document.querySelectorAll('.payout-time');
                const now = Date.now();
                timeElements.forEach(el => {
                    const time = parseInt(el.getAttribute('data-time'), 10);
                    if (!time) return;
                    const diffSeconds = Math.floor((now - time) / 1000);
                    if (diffSeconds < 10) {
                        el.textContent = 'Payout - Just now';
                    } else if (diffSeconds < 60) {
                        el.textContent = `Payout - ${diffSeconds}s ago`;
                    } else {
                        const mins = Math.floor(diffSeconds / 60);
                        el.textContent = `Payout - ${mins}m ago`;
                    }
                });
            }, 1000);
        }

        // Start loop
        setTimeout(addFakePayout, 3000);
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function captureReferralCode() {
        const code = getReferralCodeFromUrl();
        if (code) localStorage.setItem('quantumtrade_referral_code', code);
    }

    function getReferralCodeFromUrl() {
        const searchCode = new URLSearchParams(window.location.search).get('ref');
        const hash = window.location.hash || '';
        const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
        const hashCode = new URLSearchParams(hashQuery).get('ref');
        return sanitizeReferralCode(searchCode || hashCode);
    }

    function getStoredReferralCode() {
        return sanitizeReferralCode(localStorage.getItem('quantumtrade_referral_code') || '');
    }

    function sanitizeReferralCode(value) {
        return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
    }

    function showSignupReferralNote() {
        const note = document.getElementById('signup-referral-note');
        if (!note) return;
        note.classList.toggle('hidden', !getStoredReferralCode());
    }

    function buildReferralLink(code) {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = `/signup?ref=${encodeURIComponent(code)}`;
        return url.toString();
    }

    const fundingUsdRates = {
        USD: 1,
        KES: 130,
        UGX: 3900,
    };

    function convertFundingAmountToUsd(amount, currency) {
        const rate = fundingUsdRates[String(currency || 'USD').toUpperCase()] || 1;
        return Number(amount || 0) / rate;
    }

    function getFundingMinimumForCurrency(currency, minUsd = 10) {
        const rate = fundingUsdRates[String(currency || 'USD').toUpperCase()] || 1;
        return Number(minUsd || 10) * rate;
    }

    function formatLocalFundingAmount(amount, currency) {
        const normalizedCurrency = String(currency || 'USD').toUpperCase();
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: normalizedCurrency,
            maximumFractionDigits: normalizedCurrency === 'USD' ? 2 : 0,
        }).format(Number(amount || 0));
    }

    function formatCurrency(value, fractionDigits = 2) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        }).format(Number(value || 0));
    }

    const investmentCreditDayMs = 24 * 60 * 60 * 1000;

    function getInvestmentTiming(investment) {
        const durationDays = Math.max(Number(investment?.duration_days || 0), 0);
        const startedAt = Date.parse(investment?.created_at || '');
        const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null;
        const completedByClock = elapsedMs === null ? null : Math.floor(elapsedMs / investmentCreditDayMs);
        const completedByStoredDay = Math.max(Number(investment?.day_number || 1) - 1, 0);
        const completedDays = Math.min(durationDays || Number.MAX_SAFE_INTEGER, completedByClock ?? completedByStoredDay);
        const currentDay = durationDays ? Math.min(durationDays, completedDays + 1) : completedDays + 1;
        const hoursUntilNextCredit = elapsedMs === null
            ? 24
            : Math.max(1, Math.ceil((investmentCreditDayMs - (elapsedMs % investmentCreditDayMs)) / (60 * 60 * 1000)));

        return {
            completedDays,
            currentDay,
            durationDays,
            hoursUntilNextCredit,
        };
    }

    function getInvestmentDailyCredit(investment, plan) {
        const storedCredit = Number(investment?.daily_credit_usd || 0);
        if (storedCredit > 0) return storedCredit;

        const principal = Number(investment?.principal_usd || 0);
        const dailyPercent = Number(plan?.daily_return_percent || 0);
        return principal * (dailyPercent / 100);
    }

    function formatPercent(value) {
        return `${Number(value || 0).toFixed(Number(value) % 1 === 0 ? 0 : 2)}%`;
    }

    function capitalize(value) {
        return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
    }

    function timeAgo(value) {
        const then = new Date(value).getTime();
        const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.round(minutes / 60);
        return `${hours}h ago`;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    // Custom Pull-to-Refresh implementation
    let ptrStartY = 0;
    let ptrCurrentY = 0;
    let ptrIsPulling = false;
    let ptrIndicator = null;
    let ptrIcon = null;
    const PTR_THRESHOLD = 70;

    container.addEventListener('touchstart', (e) => {
        if (container.scrollTop === 0) {
            ptrStartY = e.touches[0].clientY;
            ptrIsPulling = true;
        } else {
            ptrIsPulling = false;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!ptrIsPulling) return;
        ptrCurrentY = e.touches[0].clientY;
        const pullDistance = ptrCurrentY - ptrStartY;

        if (pullDistance > 0 && container.scrollTop === 0) {
            if (!ptrIndicator) {
                ptrIndicator = document.createElement('div');
                ptrIndicator.className = 'absolute top-0 left-0 w-full flex justify-center overflow-hidden transition-all duration-200 pointer-events-none z-[100]';
                ptrIndicator.style.height = '0px';
                
                ptrIcon = document.createElement('div');
                ptrIcon.className = 'mt-4 w-10 h-10 rounded-full bg-surface shadow-xl border border-outline-variant/20 flex items-center justify-center text-primary transform scale-0 transition-transform duration-200';
                ptrIcon.innerHTML = '<span class="material-symbols-outlined text-[24px]">refresh</span>';
                
                ptrIndicator.appendChild(ptrIcon);
                container.appendChild(ptrIndicator);
            }
            
            const distance = Math.min(pullDistance, 140);
            ptrIndicator.style.height = `${distance}px`;
            
            if (pullDistance > PTR_THRESHOLD) {
                ptrIcon.style.transform = `scale(1) rotate(${pullDistance * 2}deg)`;
                ptrIcon.classList.add('text-primary-container', 'shadow-primary/20');
            } else {
                ptrIcon.style.transform = `scale(${Math.max(0, pullDistance / PTR_THRESHOLD)})`;
                ptrIcon.classList.remove('text-primary-container', 'shadow-primary/20');
            }
        }
    }, { passive: true });

    container.addEventListener('touchend', async () => {
        if (!ptrIsPulling || !ptrIndicator) return;
        ptrIsPulling = false;
        const pullDistance = ptrCurrentY - ptrStartY;

        if (pullDistance > PTR_THRESHOLD) {
            ptrIcon.classList.add('animate-spin');
            ptrIndicator.style.height = '80px';
            
            await refreshRouteData();
            
            ptrIndicator.style.height = '0px';
            setTimeout(() => {
                if (ptrIndicator) ptrIndicator.remove();
                ptrIndicator = null;
                ptrIcon = null;
            }, 300);
        } else {
            ptrIndicator.style.height = '0px';
            setTimeout(() => {
                if (ptrIndicator) ptrIndicator.remove();
                ptrIndicator = null;
                ptrIcon = null;
            }, 300);
        }
    });

    window.addEventListener('hashchange', loadRoute);
    loadRoute();
});

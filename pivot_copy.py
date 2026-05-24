import os, glob

files = glob.glob('*.html') + glob.glob('stitch_screens/*.html') + ['app.js']

replacements = {
    'QuantumTrade': 'QuantumBridge',
    'AI Trading': 'Bridge Loan',
    'Trading plans': 'Investment funds',
    'trading plans': 'investment funds',
    'Trading account': 'Investor account',
    'ASSET/USD Buy Signal': 'Austin, TX - Fix & Flip',
    'ASSET/USD': 'Funded Project',
    'Live AI Trades': 'Recent Projects Funded',
    'Daily Credit': 'Daily Yield',
    'daily credit': 'daily yield',
    'Live Pulse': 'Portfolio Pulse',
    'Latest Trade': 'Latest Project',
    'Profit Calculator': 'Yield Calculator',
    'Return Schedule': 'Yield Schedule',
    'Projected Return': 'Projected Yield',
    'Live Terminal': 'Active Projects',
    'Automated': 'Secured',
    'Trading to work': 'Capital to work',
    'AI-assisted Trading trading plans.': 'high-yield real estate bridge loans.',
    'Choose a plan, follow daily account credits, and keep your trade history, withdrawals, and security records in one private dashboard.': 'Choose a fund, track daily interest accruals, and manage your private debt portfolio securely in one dashboard.',
    'Choose a Trading Plan': 'Choose an Investment Fund',
    'Compare Plans': 'Compare Funds',
    'Start Plan': 'Fund Loan',
    'Starter Plan': 'Starter Fund',
    'Advanced Plan': 'Residential Fund',
    'Elite Plan': 'Commercial Fund',
    'Quantum Plan': 'Development Fund',
    'rocket_launch': 'account_balance',
    'currency_trading': 'real_estate_agent',
    'show_chart': 'domain'
}

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for k, v in replacements.items():
        content = content.replace(k, v)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Terminology pivot complete!")

import os, glob

files = glob.glob('*.html') + glob.glob('stitch_screens/*.html') + ['app.js']

replacements = {
    'QUANTUMTRADE': 'QUANTUMBRIDGE',
    'QuantumTrade': 'QuantumBridge',
    'trade history': 'portfolio history',
    'Live Trades': 'Recent Projects',
    'Trade activity': 'Project activity',
    'Trade activity belongs beside funds': 'Project updates belong beside funds',
    'trade records': 'project records',
    'higher-yield algorithmic trades': 'high-yield residential rehabs',
    'trades': 'projects',
    'trade': 'project',
    'Trades': 'Projects',
    'Trade': 'Project',
    'TRADES': 'PROJECTS',
    'TRADE': 'PROJECT',
}

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for k, v in replacements.items():
        # Do not accidentally break javascript functions if possible, but it's okay for variables
        content = content.replace(k, v)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Leftovers terminology pivot complete!")
